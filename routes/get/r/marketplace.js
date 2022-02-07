const ethers = require ('ethers');
const { Router } = require ('express');
// const collectibleContractABI = require ('../../../contracts/SqwidERC1155').ABI;
const marketplaceContractABI = require ('../../../contracts/SqwidMarketplace').ABI;
const axios = require ('axios');
const { getWallet } = require ('../../../lib/getWallet');
const { byId } = require ('../collections');
const getNetwork = require ('../../../lib/getNetwork');
const firebase = require ('../../../lib/firebase');
// const collectibleContract = (signerOrProvider, address = null) => new ethers.Contract (address || getNetwork ().contracts ['erc1155'], collectibleContractABI, signerOrProvider);
const marketplaceContract = (signerOrProvider) => new ethers.Contract (getNetwork ().contracts ['marketplace'], marketplaceContractABI, signerOrProvider);

const getNameByEVMAddress = async (address) => {
    const res = await firebase.collection ('users').where ('evmAddress', '==', address).get ();
    if (!res.empty) return res.docs [0].data ().displayName;
    else return address;
}

const getSaleData = item => {
    return {
        price: Number (item.price)
    }
}

const getAuctionData = item => {
    return {
        deadline: Number (item.auctionData.deadline),
        minBid: Number (item.auctionData.minBid),
        highestBid: Number (item.auctionData.highestBid),
        highestBidder: item.auctionData.highestBidder
    }
}

const getRaffleData = item => {
    return {
        deadline: Number (item.raffleData.deadline),
        totalValue: Number (item.raffleData.totalValue),
        totalAddresses: Number (item.raffleData.totalAddresses),
    }
}

const getLoanData = item => {
    return {
        deadline: Number (item.loanData.deadline),
        loanAmount: Number (item.loanData.loanAmount),
        feeAmount: Number (item.loanData.feeAmount),
        numMinutes: Number (item.loanData.numMinutes),
        lender: item.loanData.lender,
    }
}

const fetchMetaAndCollection = async (itemId) => {
    const collectible = await firebase.collection ('collectibles').doc (itemId.toString ()).get ();

    if (!collectible.exists) throw new Error (`Collectible does not exist.`);
    const collectibleData = collectible.data ();
    if (!collectibleData.approved) throw new Error (`Collectible is not approved.`);
    const collectionData = await byId ({ params: { id: collectibleData.collectionId } });

    return {
        meta: collectibleData.meta,
        collection: collectionData.collection.data
    }
}

const fetchCollectionData = async (collectionId) => {
    const collection = await firebase.collection ('collections').doc (collectionId).get ();
    if (!collection.exists) throw new Error (`Collection does not exist.`);

    return { ...collection.data (), id: collectionId };
};

const fetchPosition = async (req, res) => {
    const { provider } = await getWallet ();
    const { positionId } = req.params;
    const marketContract = await marketplaceContract (provider);

    try {
        const item = await marketContract.fetchPosition (positionId);
        let itemMeta = null;
        let itemCollection = null;
        try {
            let { meta, collection } = await fetchMetaAndCollection (item.item.itemId.toString ());
            itemMeta = meta;
            itemCollection = collection;
        } catch (err) {
            console.log (err);
        };
        if (!itemMeta) {
            return res.status (404).json ({
                error: 'Item not found'
            });
        }
        let names = await Promise.allSettled (Array.from (new Set ([item.item.creator, item.owner])).map (async address => {
            return { name: await getNameByEVMAddress (address), address };
        }));
        let namesObj;
        
        names.filter (name => name.status === 'fulfilled').forEach (name => {
            namesObj = { ...namesObj, [name.value.address]: name.value.name };
        });
        const itemObject = {
            positionId: Number (item.positionId),
            itemId: Number (item.item.itemId),
            tokenId: Number (item.item.tokenId),
            collection: itemCollection,
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
            auction: item.state === 2 ? getAuctionData (item) : null,
            raffle: item.state === 3 ? getRaffleData (item) : null,
            loan: item.state === 4 ? getLoanData (item) : null,
            marketFee: Number (item.marketFee),
            state: item.state,
            meta: itemMeta
        }
        res.status (200).json (itemObject);
    } catch (err) {
        // console.log (err);
        res.json ({
            error: err
        });
    }
}

const fetchPositions = async (req, res) => {
    const { provider } = await getWallet ();
    const { type, ownerAddress, collectionId } = req.params;
    const page = Number (req.query.page) || 1;
    const perPage = Math.min (Number (req.query.perPage), 100) || 10;
    const marketContract = await marketplaceContract (provider);
    try {
        const collectiblesRef = firebase.collection ('collectibles');

        console.time ('fetch items');
        const snapshotPromise = collectiblesRef.where ('approved', '==', true).get ();
        const allRawItemsPromise = type ? marketContract.fetchPositionsByState (Number (type)) : marketContract.fetchAddressPositions (ownerAddress);
        const [snapshot, allRawItems] = await Promise.allSettled ([snapshotPromise, allRawItemsPromise]);
        console.timeEnd ('fetch items');
        if (snapshot.status === 'rejected') throw new Error (snapshot.reason);
        if (allRawItems.status === 'rejected') throw new Error (allRawItems.reason);

        const validItems = snapshot.value.docs;
        let rawItems = allRawItems.value;

        // filter by owner
        rawItems = ownerAddress ? rawItems.filter (item => item.owner === ownerAddress) : rawItems;
        // filter by verified 
        let validItemsObject = {};
        validItems.forEach (item => {
            let data = item.data ();
            if (collectionId) {
                if (data.collectionId === collectionId) {
                    validItemsObject = { ...validItemsObject, [data.id]: data };
                }
            } else {
                validItemsObject = { ...validItemsObject, [data.id]: data };
            }
        });
        rawItems = rawItems.filter (item => item.item.itemId.toString () in validItemsObject);

        // pagination
        rawItems = rawItems.slice ((page - 1) * perPage, page * perPage);

        const addresses = new Set (rawItems.reduce ((acc, item) => [...acc, item.owner, item.item.creator], []));
        const collectionsSet = new Set (rawItems.map (item => validItemsObject [item.item.itemId.toString ()].collectionId));

        console.time ('fetch collections and names');
        const collectionsPromise = Promise.allSettled (Array.from (collectionsSet).map (fetchCollectionData));
        const namesPromise = Promise.allSettled (Array.from (addresses).map (async address => {
            return { name: await getNameByEVMAddress (address), address };
        }));
        const [collections, names] = await Promise.allSettled ([collectionsPromise, namesPromise]);
        console.timeEnd ('fetch collections and names');

        if (collections.status === 'rejected') throw new Error (collections.reason);
        if (names.status === 'rejected') throw new Error (names.reason);

        const collectionsObject = collections.value.filter (collection => collection.status === 'fulfilled').reduce ((acc, collection) => {
            return { ...acc, [collection.value.id]: collection.value };
        }, {});
        let namesObj;
        names.value.filter (name => name.status === 'fulfilled').forEach (name => {
            namesObj = { ...namesObj, [name.value.address]: name.value.name };
        });
        const items = [];
        for (let i = 0; i < rawItems.length; i++) {
            const item = rawItems [i];
            items.push ({
                positionId: Number (item.positionId),
                itemId: Number (item.item.itemId),
                tokenId: Number (item.item.tokenId),
                collection: collectionsObject [validItemsObject [item.item.itemId.toString ()].collectionId],
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
                auction: item.state === 2 ? getAuctionData (item) : null,
                raffle: item.state === 3 ? getRaffleData (item) : null,
                loan: item.state === 4 ? getLoanData (item) : null,
                marketFee: Number (item.marketFee),
                state: item.state,
                meta: validItemsObject [item.item.itemId.toString ()].meta,
            });
        }
        res.status (200).json ({
            items,
            pagination: {
                page,
                perPage,
            }
        });
    } catch (err) {
        console.log (err);
        res.json ({
            error: err
        });
    }
};

module.exports = {
    router: () => {
        const router = Router ();
        router.get ('/all/:type', fetchPositions);
        router.get ('/by-owner/:ownerAddress', fetchPositions);
        router.get ('/by-owner/:ownerAddress/:type', fetchPositions);
        router.get ('/by-collection/:collectionId/:type', fetchPositions);
        router.get ('/position/:positionId', fetchPosition);
        return router;
    }
}