const { Router } = require ('express');
// const firebase = require ('../../lib/firebase');
const { verify } = require ('../../middleware/auth');

const multer = require ('multer');
const { newCollection } = require('../../lib/collection');
// const { NFTStorage, File } = require ('nft.storage');

const imageUpload = multer ({
    storage: multer.memoryStorage (),
    limits: {
        fileSize: 30000000
    },
});
/*
const createCollection = async (req, res, next) => {
    const ownerEVMAddress = await getEVMAddress (req.user.address);
    let col = {
        name: req.body.name || '',
        description: req.body.description || '',
        owner: ownerEVMAddress,
        created: new Date ().getTime (),
        image: ''
    }

    const client = new NFTStorage ({ token: process.env.NFT_STORAGE_API_KEY });
    try {
        const metadata = await client.store ({
            name: col.name,
            description: col.description,
            image: new File (
                [req.file.buffer],
                req.file.originalname,
                { type: req.file.mimetype }
            )
        });

        col.image = metadata.data.image.href;

        const collection = await firebase.collection ('collections').add (col);

        res.status (201).json ({
            id: collection.id,
            name: col.name
        });
    } catch (err) {
        next (err);
    }
}
*/

const createCollection = async (req, res, next) => {
    try {
        const collection = await newCollection(
            req.user.address, 
            req.body.name, 
            req.body.description, 
            req.file
        );
        res.status (201).json ({
            id: collection.id,
            name: req.body.name || ''
        });
    } catch (err) {
        next (err);
    }
}

module.exports = () => {
    const router = Router ();

    router.post ('/', [ verify, imageUpload.single ("fileData") ], createCollection);

    return router;
}