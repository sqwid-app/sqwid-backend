const { Router } = require ('express');
const firebase = require ('../../lib/firebase');
const { verify } = require ('../../middleware/auth');

const multer = require ('multer');
const { NFTStorage, File } = require ('nft.storage');

// const ethers = require ('ethers');

// const { getWallet } = require ('../../lib/getWallet');

// const { ABI } = require ('../../contracts/SqwidERC1155');

// const { getCloudflareURL } = require ('../../lib/getIPFSURL');
// const { default: axios } = require('axios');

const { getEVMAddress } = require ('../../lib/getEVMAddress');
const cors = require ('cors');

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

    let col = req.body.collection || "Sqwid";
    const collection = await firebase.collection ('collections').doc (col).get ();
    let creator = await getEVMAddress (req.user.address);
    // console.log (creator);

    if (collection.exists) {
        if (collection.data ().owner === req.user.address || col === "Sqwid") {
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

module.exports = () => {
    const router = Router ();
    router.use (cors ());

    router.post ('/', [ verify, mediaUpload.fields ([{ name: 'fileData', maxCount: 1 }, { name: 'coverData', maxCount: 1 }]) ], upload);
    router.get ('/sync', sync);

    return router;
}