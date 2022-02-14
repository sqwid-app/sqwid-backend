const { Router } = require ('express');
const firebase = require ('../../lib/firebase');
const { verify } = require ('../../middleware/auth');
const ethers = require ('ethers');
const multer = require ('multer');
const { NFTStorage, File } = require ('nft.storage');
const getNetwork = require('../../lib/getNetwork');
const { FieldValue } = require ('firebase-admin').firestore;

const collectibleContractABI = require ('../../contracts/SqwidERC1155').ABI;
const marketplaceContractABI = require ('../../contracts/SqwidMarketplace').ABI;
const utilityContractABI = require ('../../contracts/SqwidUtility').ABI;

const { getEVMAddress } = require ('../../lib/getEVMAddress');
const cors = require ('cors');
const { getWallet } = require('../../lib/getWallet');
const { getCloudflareURL } = require('../../lib/getIPFSURL');
const axios = require ('axios');

const collectibleContract = (signerOrProvider, address = null) => new ethers.Contract (address || getNetwork ().contracts ['erc1155'], collectibleContractABI, signerOrProvider);
const marketplaceContract = (signerOrProvider) => new ethers.Contract (getNetwork ().contracts ['marketplace'], marketplaceContractABI, signerOrProvider);
const utilityContract = (signerOrProvider) => new ethers.Contract (getNetwork ().contracts ['utility'], utilityContractABI, signerOrProvider);

const mediaUpload = multer ({
    storage: multer.memoryStorage (),
    limits: {
        fileSize: 30000000
    },
});

let upload = async (req, res, next) => {
    res.setHeader ('Access-Control-Allow-Origin', '*');
    const client = new NFTStorage ({ token: process.env.NFT_STORAGE_API_KEY });
    const cover = req.files.coverData ? req.files.coverData [0] : req.files.fileData [0];
    const file = (req.files.coverData && (req.files.coverData [0] === req.files.fileData [0])) ? null : req.files.fileData [0];

    let col = req.body.collection || "ASwOXeRM5DfghnURP4g2";
    const collection = await firebase.collection ('collections').doc (col).get ();
    let creator = await getEVMAddress (req.user.address);

    if (collection.exists) {
        if (collection.data ().owner === req.user.address || col === "ASwOXeRM5DfghnURP4g2") {
            try {
                const metadata = await client.store ({
                    name: req.body.name || "Empty Sqwid",
                    description: req.body.description || "",
                    properties: {
                        custom: JSON.parse (req.body.properties) || {},
                        mimetype: file ? file.mimetype : null,
                        creator: creator,
                        media: file ? (new File ([file.buffer], file.originalname, { type: file.mimetype })) : null,
                        collection: col,
                    },
                    image: new File (
                        [cover.buffer],
                        cover.originalname,
                        { type: cover.mimetype }
                    ),
                })
                res.status (200).send (metadata.url);
            } catch (err) {
                next (err);
            }
        } else {
            return res.status (403).json ({
                error: 'You are not the owner of this collection.'
            });
        }
    } else {
        return res.status (404).json ({
            error: 'Collection not found.'
        });
    }
}

let sync = async (req, res, next) => {
    // const { provider } = await getWallet ();
    // const contract = new ethers.Contract (process.env.COLLECTIBLE_CONTRACT_ADDRESS, ABI, provider);

    // const currentId = Number (await contract.currentId ());

    // const dbCollection = firebase.collection ('collectibles');

    // for (let i = currentId; i > Math.max (currentId - 5, 0); i--) {
    //     const uri = await contract.uri (i);
    //     let url = getCloudflareURL (uri);
    //     const doc = await dbCollection.where ('id', '==', i).get ();
    //     if (doc.empty) {
    //         try {
    //             const response = await axios (url);
    //             const json = await response.data;
    //             const { name, properties } = json;
    //             const { collection, creator } = properties;
    
    //             const data = {
    //                 id: i,
    //                 uri,
    //                 collection: collection || "Sqwid",
    //                 createdAt: new Date (),
    //                 creator,
    //                 name
    //             };
    //             await dbCollection.doc (i.toString ()).set (data);
    //         } catch (err) {
    //             console.log (err);
    //         }
    //     }
    // }
    res.status (200).json ({
        message: 'Sync complete.'
    });
}

const verifyItem = async (req, res, next) => {
    const { provider } = await getWallet ();
    const marketContract = await utilityContract (provider);
    const tokenContract = await collectibleContract (provider);
    const { id, collection } = req.body;
    const collectionId = collection || 'ASwOXeRM5DfghnURP4g2';
    
    const creatorProimse = getEVMAddress (req.user.address);
    const collectionDocPromise = firebase.collection ('collections').doc (collectionId).get ();
    const collectiblePromise = firebase.collection ('collectibles').where ('id', '==', id).get ();
    const [creator, collectionDoc, collectible] = await Promise.all ([creatorProimse, collectionDocPromise, collectiblePromise]);
    
    if (!collectible.empty) return res.status (400).json ({
        error: 'Collectible already verified.'
    });
    // verify user owns collection
    if (collectionDoc.exists && (collectionDoc.data ().owner === req.user.address || collectionId === "ASwOXeRM5DfghnURP4g2")) {
        try {
            const item = await marketContract.fetchItem (id);
            let ipfsURI;
            if (item.creator === creator) {
                ipfsURI = await tokenContract.uri (item.tokenId);
                let meta = {};
                try {
                    const response = await axios (getCloudflareURL (ipfsURI));
                    meta = response.data;
                } catch (err) {}

                let addItem = firebase.collection ('collectibles').add ({
                    id,
                    uri: ipfsURI,
                    collectionId,
                    createdAt: new Date (),
                    creator,
                    meta,
                    approved: true
                });

                // for now, we're just going to approve the item
                let allowItem = firebase.collection ('blacklists').doc ('collectibles').update ({
                    allowed: FieldValue.arrayUnion ({
                        id,
                        collection: collectionId
                    })
                });

                await Promise.all ([addItem, allowItem]);

                res.status (200).json ({
                    message: 'Item verified.'
                });
            } else {
                res.status (403).json ({
                    error: 'You are not the owner of this item.'
                });
            }
        } catch (err) {
            next (err);
        }
    } else {
        return res.status (403).json ({
            error: 'You are not the owner of this collection.'
        });
    }
}

module.exports = () => {
    const router = Router ();
    router.use (cors ());

    // router.post ('/', [ verify, mediaUpload.fields ([{ name: 'fileData', maxCount: 1 }, { name: 'coverData', maxCount: 1 }]), cors ({ origin: '*' }) ], upload);
    // router.get ('/sync', sync);
    router.post ('/verify', verify, verifyItem);

    return router;
}
