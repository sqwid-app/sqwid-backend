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
const getNetwork = require ('../../../lib/getNetwork');

const collectibleContract = (signerOrProvider, address = null) => new ethers.Contract (address || getNetwork ().contracts ['erc1155'], collectibleContractABI, signerOrProvider);
const marketplaceContract = (signerOrProvider) => new ethers.Contract (getNetwork ().contracts ['marketplace'], marketplaceContractABI, signerOrProvider);
const utilityContract = (signerOrProvider) => new ethers.Contract (getNetwork ().contracts ['utility'], utilityContractABI, signerOrProvider);

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
/*
const _fetchMarketplaceItems = async (req, res) => {
    const { provider } = await getWallet ();
    const mContract = marketplaceContract (provider);
    const cContract = collectibleContract (provider);
    const items = await mContract.fetchMarketItems ();
    const itemsWithDetails = [];
    console.log ('wot');
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
                    type: meta.properties.mimetype,
                    url: getDwebURL (meta.properties.media)
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
*/

const generateItemsDetails = async (items, collectionId = null) => {
    let itemsWithDetails = [];
    let metaURLs = [];
    let metas = [];
    items = items.filter (item => item.itemId && item.uri.length);
    for (let item of items) {
        metaURLs.push (getCloudflareURL (item.uri));
    }
    // console.time ('fetchMetas');
    try {
        // let promises = metaURLs.map ((uri, index) => new Promise ((resolve, reject) => {
        //     axios (uri).then (res => {
        //         resolve ({ 
        //             index,
        //             data: res.data
        //         });
        //     });
        // }));
        // const res = await Promise.all (promises);
        // res.forEach (r => metas [r.index] = r.data);
        // metas = await axios.all (metaURLs.map (uri => axios (uri)));
        metas = await Promise.all (metaURLs.map (uri => {
            return new Promise (resolve => {
                axios (uri).then (res => {
                    resolve (res.data);
                }).catch (err => {
                    resolve (null);
                });
            })
        }));
        // metas = metas.map (r => r.data);
    } catch (err) {
        console.log (err);
        return {
            error: err
        }
    }
    // console.timeEnd ('fetchMetas');

    // if (collectionId) {
    //     let newItems = [];
    //     let newMetas = [];
    //     for (let i = 0; i < items.length; i++) {
    //         if (metas [i].properties.collection === collectionId) {
    //             newItems.push (items [i]);
    //             newMetas.push (metas [i]);
    //         }
    //     }
    //     items = newItems;
    //     metas = newMetas;
    // }

    let newItems = [];
    let newMetas = [];
    for (let i = 0; i < items.length; i++) {
        if (metas [i]) {
            if (collectionId) {
                if (metas [i].properties.collection === collectionId) {
                    newItems.push (items [i]);
                    newMetas.push (metas [i]);
                }
            } else {
                newItems.push (items [i]);
                newMetas.push (metas [i]);
            }
        }
        
    }
    items = newItems;
    metas = newMetas;

    let collectionIds = [];
    let addresses = {};
    for (let i = 0; i < items.length; i++) {
        collectionIds.push (metas [i].properties.collection);
        addresses [items [i].currentOwner] = items [i].currentOwner;
        addresses [metas [i].properties.creator] = metas [i].properties.creator;
    }
    // console.time ('fetchCollections');
    let collections = [];
    try {
        collections = await Promise.all (collectionIds.map (id => byId ({ params: { id } })));
    } catch (err) {
        return {
            error: err
        }
    }
    collections = collections.map (c => c.collection.data);
    // console.timeEnd ('fetchCollections');

    let userIds = Object.keys (addresses);

    // console.time ('fetchUsers');
    let userNames = [];
    try {
        userNames = await Promise.all (userIds.map (id => getNameByAddress (id)));
    } catch (err) {
        return {
            error: err
        }
    }
    // console.timeEnd ('fetchUsers');

    for (let i = 0; i < items.length; i++) {
        let media = '';
        let mime = metas [i].properties.mimetype;
        if (mime.startsWith ('audio')) {
            media = getCloudflareURL (metas [i].image);
            metas [i].properties.mimetype = 'image';
        } else if (mime.startsWith ('video')) {
            media = getDwebURL (metas [i].properties.media);
        } else if (mime.startsWith ('image')) {
            media = getCloudflareURL (metas [i].image);
        }

        let obj = {
            id: items [i].itemId.toString (),
            name: metas [i].name,
            isOnSale: items [i].isOnSale,
            collection: {
                thumb: getCloudflareURL (collections [i].image),
                name: collections [i].name,
                id: metas [i].properties.collection
            },
            owner: {
                thumb: `https://avatars.dicebear.com/api/identicon/${items [i].currentOwner}.svg`,
                name: userNames [userIds.indexOf (items [i].currentOwner)],
                id: items [i].currentOwner,
                others: 1
            },
            creator: {
                thumb: `https://avatars.dicebear.com/api/identicon/${metas [i].properties.creator}.svg`,
                name: userNames [userIds.indexOf (metas [i].properties.creator)],
                id: metas [i].properties.creator,
            },
            media: {
                type: mime,
                url: media
            },
            price: (Number (items [i].price) / (10 ** 18)).toString (),
            highestBid: (Number (items [i].highestBid) / (10 ** 18)).toString (),
            quantity: {
                available: Number (items [i].currentOwnerBalance),
                total: Number (items [i].totalSupply)
            }
        }
        itemsWithDetails.push (obj);
    }
    return itemsWithDetails;
}

const fetchMarketItemsFromSeller = async (req, res) => {
    const { provider } = await getWallet ();
    const { address } = req.params;

    const utilContract = utilityContract (provider);

    const items = await utilContract.fetchMarketItemsByOwner (address);

    const itemsWithDetails = await generateItemsDetails (items);
    res?.json (itemsWithDetails);
    return itemsWithDetails;
};

const fetchMarketplaceItems = async (req, res) => {
    const { provider } = await getWallet ();
    const { collectionId } = req.params;
    // console.time ('fetchMarketplaceItem');
    const utilContract = utilityContract (provider);

    const items = await utilContract.fetchMarketItems ();
    // console.timeEnd ('fetchMarketplaceItem');
    
    const itemsWithDetails = await generateItemsDetails (items, collectionId);
    
    res?.json (itemsWithDetails);
    return itemsWithDetails;
};

const fetchCollection = async (req, res) => {
    const { collectionId } = req.params;

    colres = await byId ({ params: { id: collectionId } });
    const items = await fetchMarketplaceItems ({ params: { collectionId } });

    const ownerAddress = await getEVMAddress (colres.collection.data.owner);
    let collection = {
        name: colres.collection.data.name,
        creator: {
            id: ownerAddress,
            name: await getNameByAddress (colres.collection.data.owner),
            thumb: `https://avatars.dicebear.com/api/identicon/${ownerAddress}.svg`
        },
        thumb: getCloudflareURL (colres.collection.data.image),
        content: items
    }

    res?.json (collection);
    return collection;
};

const fetchMarketplaceItem = async (req, res) => {
    const { itemId } = req.params;
    const { provider } = await getWallet ();
    const utilContract = utilityContract (provider);
    // console.time ('fetchMarketplaceItem');
    try {
        const item = await utilContract.fetchMarketItem (itemId);
        // console.timeLog ('fetchMarketplaceItem');
        if (Number (item.itemId) === 0) {
            res.json ({ error: 'item does not exist' });
            return;
        }
        
        const metaURI = getCloudflareURL (item.uri);
        // console.timeLog ('fetchMarketplaceItem');
        const mres = await axios (metaURI);
        // console.timeEnd ('fetchMarketplaceItem');
        const meta = mres.data;
        const creatorEVMAddress = meta.properties.creator;
    
        const collection = await byId ({ params: { id: meta.properties.collection } });
        const collectionData = collection.collection.data;
        let info = {
            itemId: Number (item.itemId),
            isOnSale: item.isOnSale,
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
            media: {
                cover: getCloudflareURL (meta.image),
                type: meta.properties.mimetype,
                url: meta.properties.mimetype.startsWith ('image') ? getCloudflareURL (meta.properties.media) : getDwebURL (meta.properties.media)
            },
            properties: Object.keys (meta.properties.custom).map (key => {
                return {
                    key,
                    value: meta.properties.custom [key]
                }
            }),
            highestBid: (Number (item.highestBid) / (10 ** 18)).toString (),
            royalty: (Number (item.royalty) / 100).toString ()
        };
    
        res.json (info);
    } catch (err) {
        console.log (err);
        res.json ({ error: "there's been an error eh" });
    }
}

const marketplaceItemExists = async (itemId) => {
    // const { provider } = await Interact ();
    // const mContract = marketplaceContract (provider);
    // const item = await mContract.fetchMarketItem (itemId);
    // return Number (item.itemId) !== 0;
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

const formatBids = async (bids) => {
    bids = bids.filter (bid => bid.active === true);
    const formatted = await Promise.all (bids.map (async bid => {
        return {
            id: Number (bid.bidId),
            bidder: {
                name: await getNameByAddress (bid.bidder),
                id: bid.bidder,
                thumb: `https://avatars.dicebear.com/api/identicon/${bid.bidder}.svg`
            },
            price: (Number (bid.price) / (10 ** 18)).toString (),
            copies: Number (bid.amount).toString (),
        }
    }));
    return formatted;
};

// fetch all bids for an item
const fetchBids = async (req, res) => {
    const { provider } = await getWallet ();
    const { itemId } = req.params;
    const mContract = marketplaceContract (provider);

    try {
        const bids = await mContract.fetchBids (Number (itemId));
        const formatted = await formatBids (bids);
        // console.log (bids);
        res.json (formatted);

    } catch (err) {
        console.log (err);
        res.json ({
            error: err
        });
    }
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
        router.get ('/fetchMarketItems/collection/:collectionId', fetchCollection);
        router.get ('/fetchMarketItems/owner/:address', fetchMarketItemsFromSeller);
        router.get ('/fetchMarketItem/:itemId', fetchMarketplaceItem);
        router.get ('/bids/:itemId', fetchBids);
        
        return router;
    }
}