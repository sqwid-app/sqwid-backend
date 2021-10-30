const { Router } = require ('express');

const { verify } = require ('../../middleware/auth');

const multer = require ('multer');
const { NFTStorage, File } = require ('nft.storage');

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

module.exports = () => {
    const router = Router ();

    router.post ('/', [ verify, mediaUpload.fields ([{ name: 'fileData', maxCount: 1 }, { name: 'coverData', maxCount: 1 }]) ], upload);

    return router;
}