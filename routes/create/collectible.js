const { Router } = require ('express');

const { verify } = require ('../../middleware/auth');

const multer = require ('multer');
const { NFTStorage, File } = require ('nft.storage');

const imageUpload = multer ({
    storage: multer.memoryStorage (),
    limits: {
        fileSize: 30000000
    },
});

let upload = async (req, res, next) => {
    const client = new NFTStorage ({ token: process.env.NFT_STORAGE_API_KEY });
    try {
        const metadata = await client.store ({
            name: req.body.name || "Empty Sqwid",
            description: req.body.description || "",
            collection: req.body.collection || "Sqwid",
            image: new File (
                [req.file.buffer],
                req.file.originalname,
                { type: req.file.mimetype }
            ),
            properties: req.body.properties || {},
        })
        res.status (200).send (metadata.data);
    } catch (err) {
        next (err);
    }
}

module.exports = () => {
    const router = Router ();

    router.post ('/', [ verify, imageUpload.single ("fileData") ], upload);

    return router;
}