const ethers = require ('ethers');
const { Router } = require ('express');
const collectibleContractABI = require ('../../../contracts/SqwidERC1155').ABI;
const marketplaceContractABI = require ('../../../contracts/SqwidMarketplace').ABI;
const utilityContractABI = require ('../../../contracts/SqwidUtility').ABI;
const { getDwebURL, getCloudflareURL } = require ('../../../lib/getIPFSURL');
const axios = require ('axios');
const { getWallet } = require ('../../../lib/getWallet');
const { byId } = require ('../collections');
const { getUser } = require ('../user');

const collectibleContract = (signerOrProvider, address = null) => new ethers.Contract (address || process.env.COLLECTIBLE_CONTRACT_ADDRESS, collectibleContractABI, signerOrProvider);
const marketplaceContract = (signerOrProvider) => new ethers.Contract (process.env.MARKETPLACE_CONTRACT_ADDRESS, marketplaceContractABI, signerOrProvider);
const utilityContract = (signerOrProvider) => new ethers.Contract (process.env.UTILITY_CONTRACT_ADDRESS, utilityContractABI, signerOrProvider);

const getNameByAddress = async (address) => {
    try {
        const res = await getUser ({ params: { identifier: address } });
        return res.displayName;
    } catch (e) {
        return address;
    }
}

const getEVMAddress = async (address) => {
    try {
        const { provider } = await getWallet ();

        address = await provider.api.query.evmAccounts.evmAddresses (address);
        address = (0, ethers.utils.getAddress) (address.toString ());

        return address;
    } catch (e) {
        return address;
    }
}

// returns all marketplace items
const fetchMarketplaceItems = async (req, res) => {
    const { provider } = await getWallet ();
    const mContract = marketplaceContract (provider);
    const cContract = collectibleContract (provider);
    const items = await mContract.fetchMarketItems ();
    const itemsWithDetails = [];
    for (let item of items) {
        try {
            let highestBid = await mContract.fetchHighestBid (item.itemId);
            let metaURI = await cContract.uri (item.tokenId);
            let res = await axios (getDwebURL (metaURI));
            let meta = res.data;
            res = await byId ({ params: { id: meta.properties.collection } });
            if (!res) continue;
            let collection = res.collection.data;
            // console.log (collection);
            let obj = {
                itemId: Number (item.itemId),
                onSale: item.onSale,
                price: Number (item.price),
                seller: item.seller,
                creator: item.royaltyReceiver,
                highestBid: Number (highestBid.price),
                collection: {
                    name: collection.name,
                    image: getDwebURL (collection.image),
                },
                title: meta.name,
                media: {
                    cover: getDwebURL (meta.image),
                    mimeType: meta.properties.mimetype,
                    media: getDwebURL (meta.properties.media)
                }
            }
            console.log (obj);
            itemsWithDetails.push (obj);
        } catch (err) {
            // process err
        }
    }
    console.log (itemsWithDetails);
    // return itemsWithDetails;
    res.json (itemsWithDetails);
};

const marketplaceItemExists = async (itemId) => {
    const { provider } = await Interact ();
    const mContract = marketplaceContract (provider);
    const item = await mContract.fetchMarketItem (itemId);
    return Number (item.itemId) !== 0;
};
const fetchMarketplaceItem = async (req, res) => {
    console.time ('fetchMarketplaceItem');
    const { itemId } = req.params;
    const { provider } = await getWallet ();
    const utilContract = utilityContract (provider);

    const item = await utilContract.fetchMarketItem (itemId);
    console.timeLog ('fetchMarketplaceItem');

    if (Number (item.itemId) === 0) {
        res.json ({ error: 'item does not exist' });
        return;
    }

    const metaURI = getCloudflareURL (item.uri);
    const mres = await axios (metaURI);
    const meta = mres.data;
    const creatorEVMAddress = meta.properties.creator;

    const collection = await byId ({ params: { id: meta.properties.collection } });
    const collectionData = collection.collection.data;

    console.timeLog ('fetchMarketplaceItem');

    let info = {
        itemId: Number (item.itemId),
        isOnSale: item.onSale,
        price: (Number (item.price) / (10 ** 18)).toString (),
        owners: {
            current: {
                id: item.currentOwner,
                name: await getNameByAddress (item.currentOwner),
                quantity: {
                    owns: Number (item.currentOwnerBalance),
                    total: Number (item.totalSupply)
                }
            },
            total: 1
        },
        creator: {
            id: creatorEVMAddress,
            name: await getNameByAddress (creatorEVMAddress)
        },
        collection: {
            name: collectionData.name,
            id: meta.properties.collection,
            cover: getCloudflareURL (collectionData.image),
        },
        title: meta.name,
        description: meta.description.length > 0 ? meta.description : 'No description',
        contentURL: getDwebURL (meta.properties.media),
        properties: Object.keys (meta.properties.custom).map (key => {
            return {
                key,
                value: meta.properties.custom [key]
            }
        }),
        highestBid: (Number (item.highestBid) / (10 ** 18)).toString (),
        royalty: (Number (item.royalty) / 100).toString ()
    };

    console.timeEnd ('fetchMarketplaceItem');

    res.json (info);
}
// returns a certain marketplace item
const fetchMarketplaceItem_old = async (req, res) => {
    const itemId = req.params.itemId;
    const { provider } = await getWallet ();
    const mContract = marketplaceContract (provider);
    const cContract = collectibleContract (provider);
    const item = await mContract.fetchMarketItem (itemId);
    if (Number (item.itemId) === 0) {
        res.json ({ error: 'item does not exist' });
        return;
    }
    let info;
    try {
        let metaURI = await cContract.uri (item.tokenId);
        let res = await axios (getDwebURL (metaURI));
        let meta = res.data;
        const creator = meta.properties.creator;
        res = await byId ({ params: { id: meta.properties.collection } });
        let collection = res.collection.data;
        if (!res) {
            res.json ({ error: "item doesn't exist" });
            return;
        }
        const owners = await cContract.getOwners (Number (item.tokenId));
        const creatorEVMAddress = await getEVMAddress (creator);
        info = {
            itemId: Number (item.itemId),
            isOnSale: item.onSale,
            price: (Number (item.price) / 10 ** 18).toString (),
            owners: {
                current: {
                    id: item.seller,
                    name: await getNameByAddress (item.seller),
                    quantity: {
                        owns: (await cContract.balanceOf (creatorEVMAddress, Number (item.tokenId))).toString (),
                        total: (await cContract.getTokenSupply (Number (item.tokenId))).toString ()
                    }
                },
                total: owners.length.toString ()
            },
            creator: {
                id: creatorEVMAddress,
                name: await getNameByAddress (creator)
            },
            collection: {
                name: collection.name,
                id: meta.properties.collection,
                cover: getDwebURL (collection.image),
            },
            title: meta.name,
            description: meta.description.length > 0 ? meta.description : 'No description',
            contentURL: getDwebURL (meta.properties.media),
            properties: Object.keys (meta.properties.custom).map (key => {
                return {
                    key,
                    value: meta.properties.custom[key]
                }
            }),
            highestBid: (await mContract.fetchHighestBid (itemId)) [4].toString (),
            royalty: Number ((await cContract.royaltyInfo (Number (item.tokenId), 10000)) [1] / 100).toString (),
        }
    } catch (err) {
        console.log (err);
        // handle err
        res.json ({ error: "item doesn't exist" });
    }

    res.json (info);
};

// puts an item up for sale (owner only)
const putOnSale = async (itemId, price) => {

};

// removes an item from sale (owner / seller only)
const removeFromSale = async (itemId) => {

};

// buy an item for asking price
const buyNow = async (itemId) => {

};

// fetch all bids for an item
const fetchBids = async (itemId) => {

};

// add a bid to an item
const addBid = async (itemId, price) => {

};

// removes a bid (bidder only)
const removeBid = async (itemId, bidId) => {

};

// accepts a bid (seller only)
const acceptBid = async (itemId, bidId) => {

};

// returns the highest bid for a certain item
const fetchHighestBid = async (itemId) => {

};

// returns the total number of tokens in existence
const getTokenSupply = async (tokenId) => {

};

// returns the total number of tokens in existence by itemId
const getTokenSupplyByItemId = async (itemId) => {

};

module.exports = {
    marketplaceItemExists,
    fetchMarketplaceItems,
    fetchMarketplaceItem,
    putOnSale,
    removeFromSale,
    buyNow,
    fetchBids,
    addBid,
    removeBid,
    acceptBid,
    fetchHighestBid,
    getTokenSupply,
    getTokenSupplyByItemId,
    router: () => {
        const router = Router ();
    
        router.get ('/fetchMarketItems', fetchMarketplaceItems);
        router.get ('/fetchMarketItem/:itemId', fetchMarketplaceItem);
        
        return router;
    }
}