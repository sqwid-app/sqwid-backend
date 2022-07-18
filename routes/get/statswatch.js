const { Router } = require ('express');
const ethers = require ('ethers');
const firebase = require ('../../lib/firebase');
const { getWallet } = require('../../lib/getWallet');
const getNetwork = require('../../lib/getNetwork');
const utilityContractABI = require ('../../contracts/SqwidUtility').ABI;
const collectibleContractABI = require ('../../contracts/SqwidERC1155').ABI;
const marketplaceContractABI = require ('../../contracts/SqwidMarketplace').ABI;
let allowedItems = [];
let collections = [];
let provider;
let collectibleContract;
let marketplaceContract;
let utilityContract;
firebase.collection ('blacklists').doc ('collectibles').get ().then (allowed => {
    allowedItems = allowed.data ().allowed;
    allowedItems.forEach ((item, i) => {
        if (collections.indexOf (item.collection) === -1) {
            collections.push (item.collection);
        }
        allowedItems [i].collection = collections.indexOf (item.collection);
    })
});

const CollectibleContract = (signerOrProvider, contractAddress) => new ethers.Contract (contractAddress || getNetwork ().contracts ['erc1155'], collectibleContractABI, signerOrProvider);
const MarketplaceContract = (signerOrProvider) => new ethers.Contract (getNetwork ().contracts ['marketplace'], marketplaceContractABI, signerOrProvider);
const UtilityContract = (signerOrProvider) => new ethers.Contract (getNetwork ().contracts ['utility'], utilityContractABI, signerOrProvider);

getWallet ().then (async wallet => {
    provider = wallet.provider;
    collectibleContract = CollectibleContract (provider);
    marketplaceContract = MarketplaceContract (provider);
    utilityContract = UtilityContract (provider);
    console.log ('Statswatch Wallet loaded.');
});

const sliceIntoChunks = (arr, chunkSize) => {
    const res = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice (i, i + chunkSize);
        res.push (chunk);
    }
    return res;
}

const grabCollectibleSales = async (id, start, end) => {
    let startDate = new Date (start || '1970-01-01');
    let endDate = new Date (end || new Date ());
    const sales = await firebase.collection ('sales').where ('itemId', '==', Number (id)).where ('timestamp', '>=', startDate).where ('timestamp', '<=', endDate).get ();
    return sales;
}

const grabCollectibleLastSale = async id => {
    const sales = await firebase.collection ('sales').where ('itemId', '==', Number (id)).orderBy ('timestamp', 'desc').limit (1).get ();
    return sales;
}

const grabCollectibleOwners = async id => {
    try {
        const itemData = await utilityContract.fetchItem (id);
        const { tokenId } = itemData;
        const owners = await collectibleContract.getOwners (tokenId);
        return owners;
        
    } catch (e) {
        console.log (e);
        return [];
    }
}

const grabUserBuys = async (address, start, end) => {
    let startDate = new Date (start || '1970-01-01');
    let endDate = new Date (end || new Date ());
    const buys = await firebase.collection ('sales').where ('buyer', '==', address).where ('timestamp', '>=', startDate).where ('timestamp', '<=', endDate).get ();
    return buys;
}

const grabUserSells = async (address, start, end) => {
    let startDate = new Date (start || '1970-01-01');
    let endDate = new Date (end || new Date ());
    const buys = await firebase.collection ('sales').where ('seller', '==', address).where ('timestamp', '>=', startDate).where ('timestamp', '<=', endDate).get ();
    return buys;
}

const grabCollectionSales = async (id, start, end) => {
    let startDate = new Date (start || '1970-01-01');
    let endDate = new Date (end || new Date ());
    const salesRef = firebase.collection ('sales');
    const itemIds = allowedItems.filter (item => collections [item.collection] === id).map (item => item.id);

    const chunks = sliceIntoChunks (itemIds, 10);
    const promiseArray = chunks.map (chunk => salesRef.where ('itemId', 'in', chunk).where ('timestamp', '>=', startDate).where ('timestamp', '<=', endDate).get ());
    const sales = await Promise.all (promiseArray);
    const flattenedSales = sales.reduce ((acc, curr) => {
        return acc.concat (curr);
    }, []);
    return flattenedSales;
}

const grabCollectionOwners = async id => {
    const itemIds = allowedItems.filter (item => collections [item.collection] === id).map (item => item.id);
    
    const promises = itemIds.map (id => grabCollectibleOwners (id));
    const owners = await Promise.all (promises);
    const flattenedOwners = owners.reduce ((acc, curr) => {
        return acc.concat (curr);
    }
    , []);
    return Array.from (new Set (flattenedOwners));
}

const grabLastCollectionSale = async id => {
    const salesRef = firebase.collection ('sales');
    const itemIds = allowedItems.filter (item => collections [item.collection] === id).map (item => item.id);

    const chunks = sliceIntoChunks (itemIds, 10);
    const promiseArray = chunks.map (chunk => salesRef.where ('itemId', 'in', chunk).orderBy ('timestamp', 'desc').limit (1).get ());
    const sales = await Promise.all (promiseArray);
    const flattenedSales = sales.reduce ((acc, curr) => {
        return acc.concat (curr);
    }, []);
    return flattenedSales;
}

const grabCollectionIds = async id => {
    const itemIds = allowedItems.filter (item => collections [item.collection] === id).map (item => item.id);
    return itemIds;
}

const computeVolumeFromSales = sales => {
    return sales.docs.reduce ((acc, doc) => {
        const sale = doc.data ();
        return acc + (sale.amount * sale.price);
    }, 0);
}

const computeCollectionVolumeFromSales = sales => {
    return sales.map (sale => computeVolumeFromSales (sale)).reduce ((acc, curr) => {
        return acc + curr;
    }, 0);
}

const getCollectibleVolume = async (req, res) => {
    const { id, start, end } = req.params;
    const sales = await grabCollectibleSales (id, start, end);
    const volume = computeVolumeFromSales (sales);

    res?.json ({
        volume
    });
    return volume;
}

const getCollectibleAverage = async (req, res) => {
    const { id, start, end } = req.params;
    const sales = await grabCollectibleSales (id, start, end);

    let average = 0;
    const amounts = sales.docs.map (doc => doc.data ().amount).reduce ((acc, curr) => acc + curr, []);
    for (let sale of sales.docs) {
        const saleData = sale.data ();
        const { amount, price } = saleData;
        const weight = amount * price;
        average += weight;
    }

    const averagePrice = average / amounts;

    res?.json ({
        average: averagePrice || 0
    });

    return averagePrice || 0;
}

const getCollectibleLastSale = async (req, res) => {
    const { id } = req.params;
    const sales = await grabCollectibleLastSale (id);

    const price = sales.docs.at (0)?.data ()?.price;

    res?.json ({
        price: price || 0
    });
    return price || 0;
}

const getCollectibleOwners = async (req, res) => {
    const { id } = req.params;

    const owners = await grabCollectibleOwners (id);

    res?.json ({
        owners
    });

    return owners;
}

const getCollectibleSaleHistory = async (req, res) => {
    const { id, start, end } = req.params;
    const sales = (await grabCollectibleSales (id, start, end)).docs.map (doc => {
        let data = doc.data ();
        return {
            timestamp: data.timestamp.seconds,
            price: data.price,
            amount: data.amount
        }
    });
    res?.json ({
        sales
    });
    return sales;
}

const getCollectibleAllStats = async (req, res) => {
    const sales = (await grabCollectibleSales (req.params.id, req.params.start, req.params.end)).docs;

    const [volume, average, salesAmount, lastSale, owners] = await Promise.all ([
        getCollectibleVolume ({ params: { ...req.params, sales } }, null),
        getCollectibleAverage ({ params: { ...req.params, sales } }, null),
        getCollectibleNumberOfSales ({ params: { ...req.params, sales } }, null),
        getCollectibleLastSale ({ params: { ...req.params, sales } }, null),
        grabCollectibleOwners (req.params.id)
    ]);

    res?.json ({
        volume: Number (volume.toFixed (2)),
        average: Number (average.toFixed (2)),
        salesAmount,
        lastSale: Number (lastSale.toFixed (2)),
        owners: owners.length
    });

    return {
        volume: Number (volume.toFixed (2)),
        average: Number (average.toFixed (2)),
        salesAmount,
        lastSale: Number (lastSale.toFixed (2)),
        owners: owners.length
    };
}

const getCollectionVolume = async (req, res) => {
    const { id, start, end, sales } = req.params;
    const s = sales ? sales : await grabCollectionSales (id, start, end);
    const volume = computeCollectionVolumeFromSales (s);

    res?.json ({
        volume
    });

    return volume;
}

const getCollectionAverage = async (req, res) => {
    const { id, start, end, sales } = req.params;
    const s = sales ? sales : await grabCollectionSales (id, start, end);
    // const salesAmount = s.reduce ((acc, curr) => {
    //     return acc + curr.docs.length;
    // }, 0);
    // const volume = computeCollectionVolumeFromSales (s);
    // const average = volume / salesAmount;

    // flatten documents
    const flattenedSales = s.reduce ((acc, curr) => {
        return acc.concat (curr.docs);
    }, []);


    let average = 0;
    const amounts = flattenedSales.map (doc => doc.data ().amount).reduce ((acc, curr) => acc + curr, []);
    for (let sale of flattenedSales) {
        const { amount, price } = sale.data ();
        const weight = amount * price;
        average += weight;
    }

    const averagePrice = average / amounts;

    res?.json ({
        average: averagePrice || 0
    });

    return averagePrice || 0;
}

const getCollectionLastSale = async (req, res) => {
    const { id, start, end } = req.params;
    const sales = await grabLastCollectionSale (id, start, end);

    let newestTimestamp = 0;
    let newestPrice = 0;

    let s = sales.map (sales => sales.docs).reduce ((acc, curr) => {
        return acc.concat (curr);
    }, []).map (sale => sale.data ());

    s.forEach (sale => {
        if (sale.timestamp._seconds > newestTimestamp) {
            newestTimestamp = sale.timestamp.seconds;
            newestPrice = sale.price;
        }
    });

    res?.json ({
        newestPrice
    });

    return newestPrice;
}

const getCollectionNumberOfSales = async (req, res) => {
    const { id, start, end, sales } = req.params;
    const s = sales ? sales : await grabCollectionSales (id, start, end);
    const salesAmount = s.reduce ((acc, curr) => {
        return acc + curr.docs.length;
    }, 0);

    res?.json ({
        salesAmount
    });

    return salesAmount;
}

const getCollectibleNumberOfSales = async (req, res) => {
    const { id, start, end, sales } = req.params;
    const s = sales ? sales : (await grabCollectibleSales (id, start, end)).docs;
    const salesAmount = s.length;

    res?.json ({
        salesAmount
    });

    return salesAmount;
}

const getCollectionAllStats = async (req, res) => {
    const sales = await grabCollectionSales (req.params.id, req.params.start, req.params.end);

    const itemIds = allowedItems.filter (item => collections [item.collection] === req.params.id);

    const [volume, average, salesAmount, owners] = await Promise.all ([
        getCollectionVolume ({ params: { ...req.params, sales } }, null),
        getCollectionAverage ({ params: { ...req.params, sales } }, null),
        getCollectionNumberOfSales ({ params: { ...req.params, sales } }, null),
        grabCollectionOwners (req.params.id)
    ]);

    res?.json ({
        volume: Number (volume.toFixed (2)),
        average: Number (average.toFixed (2)),
        salesAmount,
        owners: owners.length,
        items: itemIds.length
    });

    return {
        volume: Number (volume.toFixed (2)),
        average: Number (average.toFixed (2)),
        salesAmount,
        owners: owners.length,
        items: itemIds.length
    };
}

const getUserBuyVolume = async (req, res) => {
    const { address, start, end } = req.params;
    const sales = await grabUserBuys (address, start, end);
    const volume = computeVolumeFromSales (sales);

    return res.json ({
        volume
    });
}

const getUserSellVolume = async (req, res) => {
    const { address, start, end } = req.params;
    const sales = await grabUserSells (address, start, end);
    const volume = computeVolumeFromSales (sales);

    return res.json ({
        volume
    });
}

module.exports = () => {
    const router = Router ();

    // Collectible routes
    router.get ('/collectible/:id/volume', getCollectibleVolume);
    router.get ('/collectible/:id/volume/:start/:end', getCollectibleVolume);
    router.get ('/collectible/:id/average', getCollectibleAverage);
    router.get ('/collectible/:id/average/:start/:end', getCollectibleAverage);
    router.get ('/collectible/:id/last-sale', getCollectibleLastSale);
    router.get ('/collectible/:id/sale-history', getCollectibleSaleHistory);
    router.get ('/collectible/:id/sale-history/:start/:end', getCollectibleSaleHistory);
    router.get ('/collectible/:id/owners', getCollectibleOwners);
    router.get ('/collectible/:id/all', getCollectibleAllStats);

    // Collection routes
    router.get ('/collection/:id/volume', getCollectionVolume);
    router.get ('/collection/:id/volume/:start/:end', getCollectionVolume);
    router.get ('/collection/:id/average', getCollectionAverage);
    router.get ('/collection/:id/average/:start/:end', getCollectionAverage);
    router.get ('/collection/:id/last-sale', getCollectionLastSale);
    router.get ('/collection/:id/number-of-sales', getCollectionNumberOfSales);
    router.get ('/collection/:id/all', getCollectionAllStats);

    // User routes
    router.get ('/user/:address/buy-volume', getUserBuyVolume);
    router.get ('/user/:address/buy-volume/:start/:end', getUserBuyVolume);
    router.get ('/user/:address/sell-volume', getUserSellVolume);
    router.get ('/user/:address/sell-volume/:start/:end', getUserSellVolume);
    return router;
}