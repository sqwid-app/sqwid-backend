const { Router } = require ('express');
const firebase = require ('../../lib/firebase');

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
    const allowed = await firebase.collection ('blacklists').doc ('collectibles').get ();
    const allowedItems = allowed.data ().allowed;
    const itemIds = allowedItems.filter (item => item.collection === id).map (item => item.id);

    const chunks = sliceIntoChunks (itemIds, 10);
    const promiseArray = chunks.map (chunk => salesRef.where ('itemId', 'in', chunk).where ('timestamp', '>=', startDate).where ('timestamp', '<=', endDate).get ());
    const sales = await Promise.all (promiseArray);
    const flattenedSales = sales.reduce ((acc, curr) => {
        return acc.concat (curr);
    }, []);
    return flattenedSales;
}

const grabLastCollectionSale = async id => {
    const salesRef = firebase.collection ('sales');
    const allowed = await firebase.collection ('blacklists').doc ('collectibles').get ();
    const allowedItems = allowed.data ().allowed;
    const itemIds = allowedItems.filter (item => item.collection === id).map (item => item.id);

    const chunks = sliceIntoChunks (itemIds, 10);
    const promiseArray = chunks.map (chunk => salesRef.where ('itemId', 'in', chunk).orderBy ('timestamp', 'desc').limit (1).get ());
    const sales = await Promise.all (promiseArray);
    const flattenedSales = sales.reduce ((acc, curr) => {
        return acc.concat (curr);
    }, []);
    return flattenedSales;
}

const grabCollectionIds = async id => {
    const allowed = await firebase.collection ('blacklists').doc ('collectibles').get ();
    const allowedItems = allowed.data ().allowed;
    const itemIds = allowedItems.filter (item => item.collection === id).map (item => item.id);
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

    return res.json ({
        volume
    });
}

const getCollectibleAverage = async (req, res) => {
    const { id, start, end } = req.params;
    const sales = await grabCollectibleSales (id, start, end);
    const volume = computeVolumeFromSales (sales);
    const average = volume / sales.docs.length;

    return res.json ({
        average
    });
}

const getCollectibleLastSale = async (req, res) => {
    const { id } = req.params;
    const sales = await grabCollectibleLastSale (id);

    const price = sales.docs.at (0).data ().price;

    return res.json ({
        price
    });
}

const getCollectionVolume = async (req, res) => {
    const { id, start, end } = req.params;
    const sales = await grabCollectionSales (id, start, end);
    const volume = computeCollectionVolumeFromSales (sales);

    return res.json ({
        volume
    });
}

const getCollectionAverage = async (req, res) => {
    const { id, start, end } = req.params;
    const sales = await grabCollectionSales (id, start, end);
    const salesAmount = sales.reduce ((acc, curr) => {
        return acc + curr.docs.length;
    }, 0);
    const volume = computeCollectionVolumeFromSales (sales);
    const average = volume / salesAmount;

    return res.json ({
        average
    });
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

    return res.json ({
        newestPrice
    });
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

    // Collection routes
    router.get ('/collection/:id/volume', getCollectionVolume);
    router.get ('/collection/:id/volume/:start/:end', getCollectionVolume);
    router.get ('/collection/:id/average', getCollectionAverage);
    router.get ('/collection/:id/average/:start/:end', getCollectionAverage);
    router.get ('/collection/:id/last-sale', getCollectionLastSale);

    // User routes
    router.get ('/user/:address/buy-volume', getUserBuyVolume);
    router.get ('/user/:address/buy-volume/:start/:end', getUserBuyVolume);
    router.get ('/user/:address/sell-volume', getUserSellVolume);
    router.get ('/user/:address/sell-volume/:start/:end', getUserSellVolume);
    return router;
}