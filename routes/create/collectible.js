const { Router } = require ('express');
const firebase = require ('../../lib/firebase');
const { verify } = require ('../../middleware/auth');

const multer = require ('multer');
const { NFTStorage, File } = require ('nft.storage');

const ethers = require ('ethers');

const { getWallet } = require ('../../lib/getWallet');

const { ABI } = require ('../../contracts/SqwidERC1155');

const { getCloudflareURL } = require ('../../lib/getIPFSURL');
const { default: axios } = require('axios');

const mediaUpload = multer ({
    storage: multer.memoryStorage (),
    limits: {
        fileSize: 30000000
    },
});

let upload = async (req, res, next) => {
    const client = new NFTStorage ({ token: process.env.NFT_STORAGE_API_KEY });
    const cover = req.files.coverData ? req.files.coverData [0] : req.files.fileData [0];
    const file = (req.files.coverData && (req.files.coverData [0] === req.files.fileData [0])) ? null : req.files.fileData [0];

    const collection = await firebase.collection ('collections').doc (req.body.collection).get ();

    if (collection.exists) {
        if (collection.data ().owner === req.user.address) {
            try {
                const metadata = await client.store ({
                    name: req.body.name || "Empty Sqwid",
                    description: req.body.description || "",
                    collection: req.body.collection || "Sqwid",
                    media: file ? (new File ([file.buffer], file.originalname, { type: file.mimetype })) : null,
                    properties: JSON.parse (req.body.properties) || {},
                    mimetype: file ? file.mimetype : null,
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

let addToDb = async (req, res, next) => {
    const userAddress = req.user.address;
    const { metadata } = req.body;
    const { provider } = await getWallet ();

    let evmAddress = await provider.api.query.evmAccounts.evmAddresses (userAddress);
    evmAddress = (0, ethers.utils.getAddress) (evmAddress.toString ());

    const contract = new ethers.Contract (process.env.COLLECTIBLE_CONTRACT_ADDRESS, ABI, provider);

    const currentId = Number (await contract.currentId ());

    for (let i = currentId; i > Math.max (currentId - 10, 0); i--) {
        const uri = await contract.uri (i);
        if (uri === metadata) {
            const owners = await contract.getOwners (i);
            if (owners.length === 1 && owners [0] === evmAddress) {
                const dbCollection = firebase.collection ('collectibles');
                const doc = await dbCollection.where ('id', '==', i).get ();
                if (doc.empty) {
                    let url = getCloudflareURL (metadata);
                    try {
                        const re = await axios (url);
                        const json = await re.data;
                        
                        const { name, collection } = json;
                        const data = {
                            id: i,
                            uri: metadata,
                            collection: collection,
                            createdAt: new Date (),
                            creator: userAddress,
                            name: name
                        };

                        await dbCollection.doc (i.toString ()).set (data);
                        res.status (200).json ({
                            status: 'success',
                            id: i
                        });
                    } catch (err) {
                        next (err);
                    }
                } else {
                    res.status (400).json ({
                        status: 'error',
                        message: 'Collectible already exists'
                    });
                }
                return;
            } else {
                res.status (403).send ('Not allowed');
                return;
            }
        } else {
            continue;
        }
    }
    res.status (400).json ({
        status: 'error',
        message: 'Collectible not found'
    });
}

module.exports = () => {
    const router = Router ();

    router.post ('/', [ verify, mediaUpload.fields ([{ name: 'fileData', maxCount: 1 }, { name: 'coverData', maxCount: 1 }]) ], upload);
    router.post ('/db', verify, addToDb);

    return router;
}