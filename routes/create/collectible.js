const { Router } = require ('express');
const firebase = require ('../../lib/firebase');
const { verify } = require ('../../middleware/auth');

const multer = require ('multer');
const { NFTStorage, File } = require ('nft.storage');

const ethers = require ('ethers');

const { getWallet } = require ('../../lib/getWallet');

const { ABI } = require ('../../contracts/SqwidERC1155');

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
}

let addToDb = async (req, res, next) => {
    const userAddress = req.user.address;
    const { metadata } = req.body;
    const { provider } = await getWallet ();

    let evmAddress = await provider.api.query.evmAccounts.evmAddresses (userAddress);
    evmAddress = (0, ethers.utils.getAddress) (evmAddress.toString ());

    const contract = new ethers.Contract (process.env.COLLECTIBLE_CONTRACT_ADDRESS, ABI, provider);

    const currentId = Number (await contract.currentId ());
    console.log (currentId);

    for (let i = currentId; i > Math.max (currentId - 10, 0); i--) {
        const uri = await contract.uri (i);
        console.log (uri, metadata);
        if (uri === metadata) {
            const owners = await contract.getOwners (i);
            console.log (owners);
            if (owners.length === 1 && owners [0] === evmAddress) {
                const collection = firebase.collection ('collectibles');
                const doc = await collection.where ('id', '==', i).get ();
                console.log (doc.size);
                if (doc.empty) {
                    await collection.doc (i.toString (16)).set ({
                        id: i,
                        uri: metadata,
                        creator: userAddress,
                        createdAt: new Date ().toISOString (),
                    });
                    res.status (200).json ({
                        status: 'success',
                        id: i
                    });
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