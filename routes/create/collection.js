const { Router } = require ('express');
const firebase = require ('../../lib/firebase');
const { verify } = require ('../../middleware/auth');

const multer = require ('multer');
const { NFTStorage, File } = require ('nft.storage');

const imageUpload = multer ({
    storage: multer.memoryStorage (),
    limits: {
        fileSize: 30000000
    },
});

const createCollection = async (req, res, next) => {
    let col = {
        name: req.body.name || '',
        description: req.body.description || '',
        owner: req.user.address,
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

module.exports = () => {
    const router = Router ();

    router.post ('/', [ verify, imageUpload.single ("fileData") ], createCollection);

    return router;
}