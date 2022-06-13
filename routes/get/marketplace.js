const ethers = require ('ethers');
const { Router } = require ('express');
const utilityContractABI = require ('../../contracts/SqwidUtility').ABI;
const collectibleContractABI = require ('../../contracts/SqwidERC1155').ABI;
const marketplaceContractABI = require ('../../contracts/SqwidMarketplace').ABI;
const { getWallet } = require ('../../lib/getWallet');
const getNetwork = require ('../../lib/getNetwork');
const firebase = require ('../../lib/firebase');
const { FieldPath } = require ('firebase-admin').firestore;
const { fetchCachedCollectibles, cacheCollectibles, fetchCachedCollections, cacheCollections, fetchCachedNames, cacheNames } = require('../../lib/caching');
const UtilityContract = (signerOrProvider) => new ethers.Contract (getNetwork ().contracts ['utility'], utilityContractABI, signerOrProvider);
const CollectibleContract = (signerOrProvider, contractAddress) => new ethers.Contract (contractAddress || getNetwork ().contracts ['erc1155'], collectibleContractABI, signerOrProvider);
const MarketplaceContract = (signerOrProvider) => new ethers.Contract (getNetwork ().contracts ['marketplace'], marketplaceContractABI, signerOrProvider);
const { verify } = require ('../../middleware/auth');
const { getEVMAddress } = require('../../lib/getEVMAddress');
let provider, utilityContract, marketplaceContract;
getWallet ().then (async wallet => {
    provider = wallet.provider;
    utilityContract = UtilityContract (provider);
    marketplaceContract = MarketplaceContract (provider);
    console.log ('Wallet loaded.');
});
let collectionsOfApprovedItems = {};
let approvedIds = {};
let featuredIds = [];

firebase.collection ('blacklists').doc ('collectibles').onSnapshot (snapshot => {
    let data = snapshot.data ();

    if (!data.allowed) {
        approvedIds = [];
        collections = {};
    } else {
        collectionsOfApprovedItems = Array.from (new Set (data.allowed.map (item => item.collection)));
        approvedIds = data.allowed.map (item => { return { id: item.id, collection: collectionsOfApprovedItems.indexOf (item.collection) } });
        approvedIds = approvedIds.sort ((a, b) => a.id - b.id);
    }
});

firebase.collection ('config').doc ('collectibles').onSnapshot (snapshot => {
    if (!snapshot.exists) return;
    let data = snapshot.data ();
    featuredIds = data.featured;
});

const sliceIntoChunks = (arr, chunkSize) => {
    const res = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice (i, i + chunkSize);
        res.push (chunk);
    }
    return res;
}

const setBoolean = (packedBools, boolNumber, value) => value ? packedBools | 1 << boolNumber : packedBools & ~(1) << boolNumber;
const maxOfArray = arr => arr.reduce ((a, b) => Math.max (a, b), -Infinity);
const minOfArray = arr => arr.reduce ((a, b) => Math.min (a, b), Infinity);

const getBoolsArray = arr => {
    const max = arr [arr.length - 1];
    let boolArray = new Array (max + 1).fill (false);
    arr.forEach (i => boolArray [i] = true);
    let packed = [];
    for (let i = max; i > 0; i--) {
        packed [(i / 8) | 0] = setBoolean (packed [(i / 8) | 0] || 0, (i + 0) % 8, boolArray [i])
    }
    return packed;
}

const getSaleData = item => {
    return {
        price: Number (item.price)
    }
}

const getAuctionData = (item, names) => {
    return {
        deadline: Number (item.auctionData.deadline),
        minBid: Number (item.auctionData.minBid),
        highestBid: Number (item.auctionData.highestBid),
        highestBidder: {
            address: item.auctionData.highestBidder,
            name: names [item.auctionData.highestBidder] || item.auctionData.highestBidder
        },
    }
}

const getRaffleData = item => {
    return {
        deadline: Number (item.raffleData.deadline),
        totalValue: Number (item.raffleData.totalValue) * (10 ** 18),
        totalAddresses: Number (item.raffleData.totalAddresses),
    }
}

const getLoanData = (item, names) => {
    return {
        deadline: Number (item.loanData.deadline),
        loanAmount: Number (item.loanData.loanAmount),
        feeAmount: Number (item.loanData.feeAmount),
        numMinutes: Number (item.loanData.numMinutes),
        lender: {
            address: item.loanData.lender,
            name: names [item.loanData.lender] || item.loanData.lender
        }
    }
}

const fetchCollection = async (req, res) => {
    const { collectionId } = req.params;

    let collection = await getDbCollections ([collectionId]);

    if (!collection.length) return res.status (404).send ({ error: 'Collection does not exist.' });
    collection = collection [0].data;
    let user = await getNamesByEVMAddresses ([collection.owner]);
    user = user [0];

    let collectionResponse = {
        name: collection.name,
        creator: {
            id: user.address,
            name: user.name,
            thumb: `https://avatars.dicebear.com/api/identicon/${user.address}.svg`
        },
        thumb: collection.image
    }

    res?.json (collectionResponse);
    return collectionResponse;
};

const fetchPosition = async (req, res) => {
    const { positionId } = req.params;
    try {
        const item = await utilityContract.fetchPosition (positionId);

        if (!Number (item.amount)) return res?.status (404).send ({ error: 'Position does not exist.' });
        const collectibleContract = CollectibleContract (provider, item.item.nftContract);
        
        let collectibleData = await getDbCollectibles ([Number (item.item.itemId)]);

        if (!collectibleData.length) throw new Error (`Collectible does not exist.`);
        
        collectibleData = collectibleData [0];

        const collectionPromise = getDbCollections ([collectibleData.collectionId]);
        const namesPromise = getNamesByEVMAddresses (Array.from (new Set ([item.item.creator, item.owner, item.auctionData.highestBidder, item.loanData.lender])));
        const itemMetaPromise = collectibleContract.uri (item.item.tokenId);
        const itemRoyaltiesPromise = collectibleContract.royaltyInfo (item.item.tokenId, 100);
        
        const [collection, names, itemMeta, itemRoyalty] = await Promise.all ([collectionPromise, namesPromise, itemMetaPromise, itemRoyaltiesPromise]);

        let namesObj = {};
        names.forEach (name => {
            namesObj = { ...namesObj, [name.address]: name.name };
        });

        const itemObject = {
            approved: collectibleData.approved,
            positionId: Number (item.positionId),
            itemId: Number (item.item.itemId),
            tokenId: Number (item.item.tokenId),
            collection: {
                ...collection [0].data,
                id: collection [0].id
            },
            creator: {
                address: item.item.creator,
                avatar: `https://avatars.dicebear.com/api/identicon/${item.item.creator}.svg`,
                name: namesObj [item.item.creator] || item.item.creator,
                royalty: itemRoyalty.royaltyAmount.toNumber ()
            },
            owner: {
                address: item.owner,
                avatar: `https://avatars.dicebear.com/api/identicon/${item.owner}.svg`,
                name: namesObj [item.owner] || item.owner
            },
            amount: Number (item.amount),
            sale: item.state === 1 ? getSaleData (item) : null,
            auction: item.state === 2 ? getAuctionData (item, namesObj) : null,
            raffle: item.state === 3 ? getRaffleData (item) : null,
            loan: item.state === 4 ? getLoanData (item, namesObj) : null,
            marketFee: Number (item.marketFee),
            state: item.state,
            meta: { ...collectibleData.meta, uri: itemMeta, tokenContract: item.item.nftContract },
        }
        res?.status (200).json (itemObject);
        return itemObject;
    } catch (err) {
        console.log (err);
        res?.json ({
            error: err.toString ()
        });
        return null;
    }
}


const getDbCollectibles = async (items) => {
    // get from cache
    const { cached, leftoverItems } = await fetchCachedCollectibles (items);
    if (leftoverItems.length === 0) return cached;
    items = leftoverItems;
    // firebase read
    const collectiblesRef = firebase.collection ('collectibles');
    const chunks = sliceIntoChunks (items, 10);
    const promiseArray = chunks.map (chunk => collectiblesRef.where ('id', 'in', chunk).get ());
    const collectibles = await Promise.allSettled (promiseArray);
    const fResult = collectibles
        .filter (chunk => chunk.status === 'fulfilled')
        .map (chunk => chunk.value.docs)
        .reduce ((acc, curr) => [...acc, ...curr], [])
        .map (doc => doc.data ());

    // set cache
    cacheCollectibles (fResult);
    return cached.concat (fResult);
}

const getDbCollections = async (items) => {
    // get from cache
    const { cached, leftoverItems } = await fetchCachedCollections (items);
    if (leftoverItems.length === 0) return cached;
    items = leftoverItems;
    // firebase read
    const collectionsRef = firebase.collection ('collections');
    const chunks = sliceIntoChunks (items, 10);
    const promiseArray = chunks.map (chunk => collectionsRef.where (FieldPath.documentId (), 'in', chunk).get ());
    const collections = await Promise.allSettled (promiseArray);
    const fResult = collections
        .filter (chunk => chunk.status === 'fulfilled')
        .map (chunk => chunk.value.docs)
        .reduce ((acc, curr) => [...acc, ...curr], [])
        .map (doc => { return { id: doc.id, data: doc.data () }});

    // set cache
    cacheCollections (fResult);

    return cached.concat (fResult);
}

const getNamesByEVMAddresses = async (addresses) => {
    const { cached, leftoverItems } = await fetchCachedNames (addresses);
    if (leftoverItems.length === 0) return cached;
    addresses = leftoverItems;

    const usersRef = firebase.collection ('users');
    const chunks = sliceIntoChunks (addresses, 10);
    const promiseArray = chunks.map (chunk => usersRef.where ('evmAddress', 'in', chunk).get ());
    const users = await Promise.allSettled (promiseArray);
    const fResult = users
        .filter (chunk => chunk.status === 'fulfilled')
        .map (chunk => chunk.value.docs)
        .reduce ((acc, curr) => [...acc, ...curr], [])
        .map (doc => { return { name: doc.data ().displayName, address: doc.data ().evmAddress }});
    
    cacheNames (fResult);
    
    return cached.concat (fResult);
}

const buildObjectsFromItems = async (items) => {
    const itemIds = Array.from (new Set (items.map (item => Number (item.item.itemId))));
    const collectionsSet = new Set (items.map (item => collectionsOfApprovedItems [approvedIds.find (i => i.id === Number (item.item.itemId)).collection]));
    const addresses = new Set (items.reduce ((acc, item) => [...acc, item.owner, item.item.creator, item.loanData.lender, item.auctionData.highestBidder], []));
    const collectiblesPromise = getDbCollectibles (itemIds);
    const namesPromise = getNamesByEVMAddresses (Array.from (addresses));
    const collectionsPromise = getDbCollections (Array.from (collectionsSet));
    const [collectibles, names, collections] = await Promise.all ([collectiblesPromise, namesPromise, collectionsPromise]);

    const collectiblesObject = collectibles.reduce ((acc, curr) => {
        acc [curr.id] = curr;
        return acc;
    }, {});

    const collectionsObject = collections.reduce ((acc, collection) => {
        return { ...acc, [collection.id]: { ...collection.data, id: collection.id } };
    }, {});
    let namesObj;
    names.forEach (name => {
        namesObj = { ...namesObj, [name.address]: name.name };
    });
    
    return {
        collectibles: collectiblesObject,
        collections: collectionsObject,
        names: namesObj
    }
}

const constructAllowedBytes = (collectionId = null) => {
    let allowedBytes = [];
    if (collectionId) {
        let idsInCollection = [];
        for (let i = 0; i < approvedIds.length; i++) {
            if (collectionsOfApprovedItems [approvedIds [i].collection] === collectionId) {
                idsInCollection.push (approvedIds [i].id);
            }
        }
        if (idsInCollection.length > 0) allowedBytes = getBoolsArray (idsInCollection);
        else return [];
    } else {
        if (approvedIds.length > 0) allowedBytes = getBoolsArray (approvedIds.map (item => item.id));
        else return [];
    }
    return allowedBytes;
}

const fetchSummary = async (req, res) => {
    try {
        let allowedBytes = constructAllowedBytes ();
        if (!allowedBytes.length) return res.status (200).json ({
            sale: [],
            auction: [],
            raffle: [],
            loan: []
        });
        const allRawItems = await Promise.all (
            new Array (4)
            .fill (null)
            .map ((_, i) => utilityContract.fetchPositions (
                i + 1, // state
                ethers.constants.AddressZero, // owner
                0, // startFrom
                4, // limit
                allowedBytes
            ))
        );

        const allRawItemsFlat = allRawItems.reduce ((acc, curr) => [...acc, ...curr], []);
        let rawItems = allRawItemsFlat.filter (item => Number (item.amount) > 0);

        const { collectibles, collections, names } = await buildObjectsFromItems (rawItems);

        let newObject = {
            sale: [],
            auction: [],
            raffle: [],
            loan: []
        }
        let keys = Object.keys (newObject);
        rawItems.forEach (item => {
            const itemObject = {
                positionId: Number (item.positionId),
                itemId: Number (item.item.itemId),
                tokenId: Number (item.item.tokenId),
                collection: collections [collectionsOfApprovedItems [approvedIds.find (i => i.id === Number (item.item.itemId)).collection]],
                creator: {
                    address: item.item.creator,
                    avatar: `https://avatars.dicebear.com/api/identicon/${item.item.creator}.svg`,
                    name: names [item.item.creator] || item.item.creator
                },
                owner: {
                    address: item.owner,
                    avatar: `https://avatars.dicebear.com/api/identicon/${item.owner}.svg`,
                    name: names [item.owner] || item.owner
                },
                amount: Number (item.amount),
                sale: item.state === 1 ? getSaleData (item) : null,
                auction: item.state === 2 ? getAuctionData (item, names) : null,
                raffle: item.state === 3 ? getRaffleData (item) : null,
                loan: item.state === 4 ? getLoanData (item, names) : null,
                marketFee: Number (item.marketFee),
                state: item.state,
                meta: collectibles [item.item.itemId.toString ()].meta,
            }
            newObject [keys [item.state - 1]].push (itemObject);
        });

        res.status (200).json ({
            ...newObject
        });
    } catch (err) {
        console.log (err);
        res.json ({
            error: err.toString ()
        });
    }
}

const fetchFeatured = async (req, res) => {
    try {
        const featuredPromises = featuredIds.map (id => fetchPosition ({ params: { positionId: id } }));
        let featured = await Promise.all (featuredPromises);
        featured = featured.filter (item => item);
        res.status (200).json ({
            featured
        });
    } catch (err) {
        console.log (err);
        res.json ({
            error: err.toString ()
        });
    }
}

const fetchPositions = async (req, res) => {
    const { type, ownerAddress, collectionId } = req.params;
    const startFrom = Number (req.query.startFrom) || 0;
    const limit = Math.min (Number (req.query.limit), 100) || 10;
    try {
        let allowedBytes = constructAllowedBytes (collectionId);
        if (!allowedBytes.length) return res.status (200).json ({
            items: [],
            pagination: {
                lowest: 0,
                limit
            }
        });

        const allRawItems = await utilityContract.fetchPositions (Number (type), ownerAddress || ethers.constants.AddressZero, startFrom, startFrom ? Math.min (limit, startFrom) : limit, allowedBytes);
        let rawItems = allRawItems.filter (item => Number (item.positionId) > 0);

        const { collectibles, collections, names } = await buildObjectsFromItems (rawItems);
        const items = [];
        for (let i = 0; i < rawItems.length; i++) {
            const item = rawItems [i];
            items.push ({
                positionId: Number (item.positionId),
                itemId: Number (item.item.itemId),
                tokenId: Number (item.item.tokenId),
                collection: collections [collectionsOfApprovedItems [approvedIds.find (i => i.id === Number (item.item.itemId)).collection]],
                creator: {
                    address: item.item.creator,
                    avatar: `https://avatars.dicebear.com/api/identicon/${item.item.creator}.svg`,
                    name: names [item.item.creator] || item.item.creator
                },
                owner: {
                    address: item.owner,
                    avatar: `https://avatars.dicebear.com/api/identicon/${item.owner}.svg`,
                    name: names [item.owner] || item.owner
                },
                amount: Number (item.amount),
                sale: item.state === 1 ? getSaleData (item) : null,
                auction: item.state === 2 ? getAuctionData (item, names) : null,
                raffle: item.state === 3 ? getRaffleData (item) : null,
                loan: item.state === 4 ? getLoanData (item, names) : null,
                marketFee: Number (item.marketFee),
                state: item.state,
                meta: collectibles [item.item.itemId.toString ()].meta,
            });
        }
        res.status (200).json ({
            items,
            pagination: {
                lowest: minOfArray (items.map (item => item.positionId)),
                limit
            }
        });
    } catch (err) {
        console.log (err);
        res.json ({
            error: err.toString ()
        });
    }
};

const fetchBalance = async (req, res) => {
    const { address } = req.user;
    const { provider } = await getWallet ();

    try {
        let { data: { free: bn } } = await provider.api.query.system.account (address);
        let balance = (+ethers.utils.formatEther (bn.toString ())).toFixed (2);
    
        res.status (200).json ({
            balance
        });
    } catch (err) {
        console.log (err);
        res.json ({
            error: err.toString ()
        });
    }
}

const fetchWithdrawable = async (req, res) => {
    let { evmAddress, address } = req.user;
    try {
        if (!evmAddress) evmAddress = await getEVMAddress (address);
        const balance = await marketplaceContract.addressBalance (evmAddress);
        res.status (200).json ({
            balance: (+ethers.utils.formatEther (balance.toString ())).toFixed (2)
        });
    } catch (err) {
        console.log (err);
        res.json ({
            error: err.toString ()
        });
    }
}

module.exports = {
    router: () => {
        const router = Router ();
        router.get ('/featured', fetchFeatured);
        router.get ('/summary', fetchSummary);
        router.get ('/all/:type', fetchPositions);
        router.get ('/by-owner/:ownerAddress/:type', fetchPositions);
        router.get ('/by-collection/:collectionId/:type', fetchPositions);
        router.get ('/position/:positionId', fetchPosition);
        router.get ('/collection/:collectionId', fetchCollection);
        router.get ('/balance', verify, fetchBalance);
        router.get ('/withdrawable', verify, fetchWithdrawable);
        return router;
    },
    getDbCollections,
    getDbCollectibles
}