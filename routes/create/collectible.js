const { Router } = require ('express');
const { FieldValue } = require ('firebase-admin').firestore;
const firebase = require ('../../lib/firebase');
const { verify } = require ('../../middleware/auth');
const ethers = require ('ethers');
const multer = require ('multer');
const getNetwork = require('../../lib/getNetwork');

const collectibleContractABI = require ('../../contracts/SqwidERC1155').ABI;
const utilityContractABI = require ('../../contracts/SqwidUtility').ABI;

const { getEVMAddress } = require ('../../lib/getEVMAddress');
const cors = require ('cors');
const { getWallet } = require('../../lib/getWallet');
const { getInfuraURL } = require('../../lib/getIPFSURL');
const axios = require ('axios');
const { getDbCollections, getDbCollectibles } = require('../get/marketplace');

const collectibleContract = (signerOrProvider, address = null) => new ethers.Contract (address || getNetwork ().contracts ['erc1155'], collectibleContractABI, signerOrProvider);
const utilityContract = (signerOrProvider) => new ethers.Contract (getNetwork ().contracts ['utility'], utilityContractABI, signerOrProvider);

const { syncTraitsToCollection } = require('../../lib/synctraits');
const { generateThumbnail, generateSmallSize } = require('../../lib/resizeFile');
const { initIpfs } = require('../../lib/IPFS');

const skipModeration = process.env.SKIP_MODERATION === 'true';

const verifyItem = async (req, res, next) => {
    const { provider } = await getWallet ();
    const marketContract = utilityContract (provider);
    const tokenContract = collectibleContract (provider);
    const { id, collection } = req.body;
    const collectionId = collection || 'ASwOXeRM5DfghnURP4g2';
    
    const creatorPromise = getEVMAddress (req.user.address);
    const collectionDocPromise = getDbCollections ([collectionId]);
    const collectiblePromise = getDbCollectibles ([id]);
    const [creator, collectionDoc, collectible] = await Promise.all ([creatorPromise, collectionDocPromise, collectiblePromise]);
    if (collectible.length) return res.status (400).json ({
        error: 'Collectible already verified.'
    });
    // verify user owns collection
    if (collectionDoc.length && (collectionDoc [0].data.owner === creator || collectionId === "ASwOXeRM5DfghnURP4g2")) {
        try {
            const item = await marketContract.fetchItem (id);
            let ipfsURI;
            if (item.creator === creator) {
                let meta = {};
                try {
                    ipfsURI = await tokenContract.uri (item.tokenId);
                    const response = await axios (getInfuraURL (ipfsURI));
                    meta = response.data;
                } catch (err) {
                    console.log (err);
                }

                if (!meta.name) return res.status (400).json ({
                    error: 'Blockchain item not found'
                });

                const attributes = meta?.attributes || [];
                const traits = {};
                if (collectionId !== 'ASwOXeRM5DfghnURP4g2') {
                    attributes.forEach (attr => traits [`trait:${attr.trait_type.toUpperCase ()}`] = attr.value.toUpperCase ())
                }

                if (!meta.mimetype) {
                    const h = await axios.head (getInfuraURL (meta.media));
                    const mimetype = h.headers ['content-type'];
                    meta.mimetype = mimetype;
                }

                await Promise.all ([
                    firebase.collection ('collectibles').add ({
                        id,
                        tokenId: item.tokenId.toNumber (),
                        uri: ipfsURI,
                        collectionId,
                        createdAt: new Date (),
                        creator,
                        meta,
                        approved: skipModeration ? true : null,
                        ...traits
                    }),
                    syncTraitsToCollection (collectionId, traits)
                ]);

                if (skipModeration) {
                    await firebase.collection ('blacklists').doc ('collectibles').update ({
                        allowed: FieldValue.arrayUnion ({
                            id,
                            collection: collectionId
                        })
                    });
                }

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

const uploadToIPFS = async file => {
    const ipfs = initIpfs();
    const buffer = file.arrayBuffer ? await file.arrayBuffer() : file;
    const addedFile = await ipfs.add(buffer);
    await ipfs.pin.add (addedFile.path);
    return addedFile.path;
}

const mediaUpload = multer ({
    storage: multer.memoryStorage (),
    limits: {
        fileSize: 100000000
    },
});

let upload = async (req, res, next) => {
    res.setHeader ('Access-Control-Allow-Origin', '*');
    const cover = req.files.coverData ? req.files.coverData [0] : req.files.fileData [0];
    const file = (req.files.coverData && (req.files.coverData [0] === req.files.fileData [0])) ? null : req.files.fileData [0];

    let collectionId = req.body.collection || "ASwOXeRM5DfghnURP4g2";

    const creatorPromise = getEVMAddress (req.user.address);
    const collectionDocPromise = getDbCollections ([collectionId]);

    const [creator, collectionDoc] = await Promise.all ([creatorPromise, collectionDocPromise]);

    if (collectionDoc.length) {
        if (collectionDoc [0].data.owner === creator || collectionId === "ASwOXeRM5DfghnURP4g2") {
            try {
                let uploadsArray = [];

                if (cover.mimetype.startsWith ('video')) uploadsArray = [uploadToIPFS (cover.buffer)]
                else {
                    const thumbnailPromise = generateThumbnail (cover.buffer);
                    const smallSizePromise = generateSmallSize (cover.buffer);
    
                    const [thumbnail, small] = await Promise.all ([thumbnailPromise, smallSizePromise]);
    
                    uploadsArray = [uploadToIPFS (thumbnail), uploadToIPFS (small), uploadToIPFS (cover.buffer)];
                    if (req.files.coverData) uploadsArray.push (uploadToIPFS (file.buffer));
                }

                let uploads = await Promise.all (uploadsArray);

                for (let i = 1; i < 3; i++) {
                    if (!uploads [i]) uploads [i] = uploads [i - 1];
                }

                const metadata = {
                    name: req.body.name || 'Empty Sqwid',
                    description: req.body.description || "",
                    image: `ipfs://${uploads [1]}`,
                    media: `ipfs://${uploads [3] || uploads [2]}`,
                    thumbnail: `ipfs://${uploads [0]}`,
                    attributes: JSON.parse (req.body.properties),
                    mimetype: file.mimetype
                }

                const meta = await uploadToIPFS (JSON.stringify (metadata));

                res.status (200).json ({
                    metadata: 'ipfs://' + meta
                });
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

module.exports = () => {
    const router = Router ();
    router.use (cors ());

    router.post ('/verify', verify, verifyItem);
    router.post ('/upload', verify, mediaUpload.fields ([{ name: 'coverData', maxCount: 1 }, { name: 'fileData', maxCount: 1 }]), upload);

    return router;
}
