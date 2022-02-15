const ethers = require ('ethers');
const { Router } = require ('express');
// const collectibleContractABI = require ('../../../contracts/SqwidERC1155').ABI;
const marketplaceContractABI = require ('../../../contracts/SqwidMarketplace').ABI;
const utilityContractABI = require ('../../../contracts/SqwidUtility').ABI;
const axios = require ('axios');
const { getWallet } = require ('../../../lib/getWallet');
const { byId } = require ('../collections');
const getNetwork = require ('../../../lib/getNetwork');
const firebase = require ('../../../lib/firebase');
const { FieldPath } = require ('firebase-admin').firestore;
const redisClient = require ('../../../lib/redis');
const { getUser } = require('../user');
const { getCloudflareURL } = require('../../../lib/getIPFSURL');
const client = require('../../../lib/redis');
const { getSubstrateAddress } = require('../../../lib/getSubstrateAddress');
const { getEVMAddress } = require('../../../lib/getEVMAddress');
// const collectibleContract = (signerOrProvider, address = null) => new ethers.Contract (address || getNetwork ().contracts ['erc1155'], collectibleContractABI, signerOrProvider);
const marketplaceContract = (signerOrProvider) => new ethers.Contract (getNetwork ().contracts ['marketplace'], marketplaceContractABI, signerOrProvider);
const utilityContract = (signerOrProvider) => new ethers.Contract (getNetwork ().contracts ['utility'], utilityContractABI, signerOrProvider);

const getNameByEVMAddress = async (address) => {
    const res = await firebase.collection ('users').where ('evmAddress', '==', address).get ();
    if (!res.empty) return res.docs [0].data ().displayName;
    else return address;
}


const getUserBySubstrateAddress = async (address) => {
    try {
        const res = await getUser ({ params: { identifier: address } });
        return {
            evmAddress: res.evmAddress,
            displayName: res.displayName,
        };
    } catch (e) {
        return {
            evmAddress: address,
            displayName: address,
        }
    }
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

const fetchCollectionData = async (collectionId) => {
    const collection = await firebase.collection ('collections').doc (collectionId).get ();
    if (!collection.exists) throw new Error (`Collection does not exist.`);

    return { ...collection.data (), id: collectionId };
};

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
    const { provider } = await getWallet ();
    const { positionId } = req.params;
    const marketContract = await utilityContract (provider);
    try {
        const item = await marketContract.fetchPosition (positionId);

        let collectibleData = await getDbCollectibles ([Number (item.item.itemId)]);

        if (!collectibleData.length) throw new Error (`Collectible does not exist.`);
        
        collectibleData = collectibleData [0];

        const collectionPromise = getDbCollections ([collectibleData.collectionId]);
        const namesPromise = getNamesByEVMAddresses (Array.from (new Set ([item.item.creator, item.owner, item.auctionData.highestBidder, item.loanData.lender])));
        
        const [collection, names] = await Promise.all ([collectionPromise, namesPromise]);

        let namesObj = {};
        names.forEach (name => {
            namesObj = { ...namesObj, [name.address]: name.name };
        });

        const itemObject = {
            approved: collectibleData.approved,
            positionId: Number (item.positionId),
            itemId: Number (item.item.itemId),
            tokenId: Number (item.item.tokenId),
            collection: collection [0].data,
            creator: {
                address: item.item.creator,
                avatar: `https://avatars.dicebear.com/api/identicon/${item.item.creator}.svg`,
                name: namesObj [item.item.creator] || item.item.creator
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
            meta: collectibleData.meta
        }
        res.status (200).json (itemObject);
    } catch (err) {
        console.log (err);
        res.json ({
            error: err.toString ()
        });
    }
}

const sliceIntoChunks = (arr, chunkSize) => {
    const res = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice (i, i + chunkSize);
        res.push (chunk);
    }
    return res;
}

const getDbCollectibles = async (items) => {
    // get from cache
    const redisGetQuery = client.multi ();
    items.forEach (item => redisGetQuery.get (`collectible:${item}`));
    const cachedItems = await redisGetQuery.exec ();
    const res = [];
    for (let i = 0; i < items.length; i++) {
        if (cachedItems [i]) {
            res.push (JSON.parse (cachedItems [i]));
            items [i] = null;
        }
    }
    items = items.filter (item => item);
    if (!items.length) return res;
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
    const redisSetQuery = client.multi ();
    fResult.forEach (item => {
        delete item ['createdAt'];
        if (item.approved) {
            redisSetQuery.set (`collectible:${item.id}`, JSON.stringify (item));
        } else {
            redisSetQuery.set (`collectible:${item.id}`, JSON.stringify (item), {
                EX: 60 * 5 // 5 minutes
            });
        }
    });
    redisSetQuery.exec ();
    
    return res.concat (fResult);
}

const getDbApprovedIds = async () => {
    const ids = await firebase.collection ('blacklists').doc ('collectibles').get ();
    return ids.data ().allowed;
}

const getDbCollections = async (items) => {
    // get from cache
    const redisGetQuery = client.multi ();
    items.forEach (item => redisGetQuery.get (`collection:${item}`));
    const cachedItems = await redisGetQuery.exec ();
    const res = [];
    for (let i = 0; i < items.length; i++) {
        if (cachedItems [i]) {
            res.push ({ id: items [i], data: JSON.parse (cachedItems [i]) });
            items [i] = null;
        }
    }
    items = items.filter (item => item);
    if (!items.length) return res;
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
    const redisSetQuery = client.multi ();
    fResult.forEach (collection => {
        delete collection.data ['created'];
        redisSetQuery.set (`collection:${collection.id}`, JSON.stringify (collection.data));
    });
    redisSetQuery.exec ();

    return res.concat (fResult);
}

const getNamesByEVMAddresses = async (addresses) => {
    const redisGetQuery = client.multi ();
    addresses = addresses.filter (address => Number (address) !== 0);
    addresses.forEach (address => redisGetQuery.get (`displayNames:${address}`));
    const names = await redisGetQuery.exec ();

    let result = [];
    for (let i = 0; i < addresses.length; i++) {
        if (names [i]) {
            result.push ({
                address: addresses [i],
                name: names [i]
            });
            addresses [i] = null;
        }
    }

    addresses = addresses.filter (address => address);
    if (!addresses.length) return result;

    const usersRef = firebase.collection ('users');
    const chunks = sliceIntoChunks (addresses, 10);
    const promiseArray = chunks.map (chunk => usersRef.where ('evmAddress', 'in', chunk).get ());
    const users = await Promise.allSettled (promiseArray);
    const fResult = users
        .filter (chunk => chunk.status === 'fulfilled')
        .map (chunk => chunk.value.docs)
        .reduce ((acc, curr) => [...acc, ...curr], [])
        .map (doc => { return { name: doc.data ().displayName, address: doc.data ().evmAddress }});
    
    const redisSetQuery = client.multi ();
    fResult.forEach (user => {
        redisSetQuery.set (`displayNames:${user.address}`, user.name, {
            EX: 60 * 10 // 10 minutes
        });
    });

    redisSetQuery.exec ();
    
    return result.concat (fResult);
}

const buildObjectsFromItems = async (items, validItems) => {
    const itemIds = Array.from (new Set (items.map (item => Number (item.item.itemId))));
    const collectionsSet = new Set (items.map (item => validItems [item.item.itemId.toString ()].collection));
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

const fetchSummary = async (req, res) => {
    const { provider } = await getWallet ();
    const marketContract = await utilityContract (provider);
    try {
        const validIdsPromise = getDbApprovedIds ()
        const rawItemsPromises = Promise.all (new Array (4).fill (null).map ((_, i) => marketContract.fetchPositionsByState (i + 1)));
        const [allowedIds, allRawItems] = await Promise.all ([validIdsPromise, rawItemsPromises]);

        const validItems = allowedIds.reduce ((acc, curr) => {
            acc [curr.id] = curr;
            return acc;
        }, {});

        // flatten array
        const allRawItemsFlat = allRawItems.reduce ((acc, curr) => [...acc, ...curr], []);
        // filter out items that are not approved
        let rawItems = allRawItemsFlat.filter (item => (
            Number (item.amount) > 0 &&
            item.item.itemId.toString () in validItems
        ));
        rawItems = rawItems.reverse ();
        let newItems = [];
        let foundTotal = 0;
        let found = new Array (4).fill (0);
        for (let i = 0; i < rawItems.length; i++) {
            if (foundTotal >= 4 * 4) break;
            if (found [rawItems [i].state - 1] >= 4) continue;
            found [rawItems [i].state - 1]++;
            foundTotal++;
            newItems.push (rawItems [i]);
        }

        const { collectibles, collections, names } = await buildObjectsFromItems (newItems, validItems);

        let newObject = {
            sale: [],
            auction: [],
            raffle: [],
            loan: []
        }
        let keys = Object.keys (newObject);
        newItems.forEach (item => {
            const itemObject = {
                positionId: Number (item.positionId),
                itemId: Number (item.item.itemId),
                tokenId: Number (item.item.tokenId),
                collection: collections [validItems [item.item.itemId.toString ()].collection],
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

const fetchPositions = async (req, res) => {
    const { provider } = await getWallet ();
    const { type, ownerAddress, collectionId } = req.params;
    const page = Number (req.query.page) || 1;
    const perPage = Math.min (Number (req.query.perPage), 100) || 10;
    const marketContract = await utilityContract (provider);
    try {
        const validIdsPromise = getDbApprovedIds ()
        const allRawItemsPromise = type ? marketContract.fetchPositionsByState (Number (type)) : marketContract.fetchAddressPositions (ownerAddress);
        const [allowedIds, allRawItems] = await Promise.all ([validIdsPromise, allRawItemsPromise]);

        const validItems = allowedIds.reduce ((acc, curr) => {
            acc [curr.id] = curr;
            return acc;
        }, {});

        // filter by verified, owner, and collection
        let rawItems = allRawItems.filter (item => (
            Number (item.amount) > 0 &&
            item.item.itemId.toString () in validItems &&
            (ownerAddress ? (item.owner === ownerAddress) : true) &&
            (collectionId ? (validItems [item.item.itemId].collection === collectionId) : true)
            )
        );

        let totalItems = rawItems.length;
        // pagination
        rawItems = rawItems.reverse ().slice ((page - 1) * perPage, page * perPage);

        const { collectibles, collections, names } = await buildObjectsFromItems (rawItems, validItems);
        const items = [];
        for (let i = 0; i < rawItems.length; i++) {
            const item = rawItems [i];
            items.push ({
                positionId: Number (item.positionId),
                itemId: Number (item.item.itemId),
                tokenId: Number (item.item.tokenId),
                collection: collections [validItems [item.item.itemId.toString ()].collection],
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
                page,
                perPage,
                totalItems
            }
        });
    } catch (err) {
        console.log (err);
        res.json ({
            error: err.toString ()
        });
    }
};

module.exports = {
    router: () => {
        const router = Router ();
        router.get ('/summary', fetchSummary);
        router.get ('/all/:type', fetchPositions);
        router.get ('/by-owner/:ownerAddress', fetchPositions);
        router.get ('/by-owner/:ownerAddress/:type', fetchPositions);
        router.get ('/by-collection/:collectionId/:type', fetchPositions);
        router.get ('/position/:positionId', fetchPosition);
        router.get ('/collection/:collectionId', fetchCollection);
        return router;
    },
    getDbCollections
}