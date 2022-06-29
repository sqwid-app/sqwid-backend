const { Router } = require ('express');
const firebase = require ('../../lib/firebase');
const { verify } = require ('../../middleware/auth');

const multer = require ('multer');
const sharp = require ('sharp');
// const { NFTStorage, File } = require ('nft.storage');
const { getEVMAddress } = require('../../lib/getEVMAddress');

const ipfsClient = require ('ipfs-http-client');

const infuraAuth =
    'Basic ' + Buffer.from(process.env.INFURA_IPFS_PROJECT_ID + ':' + process.env.INFURA_IPFS_PROJECT_SECRET).toString('base64');

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

const generateLogo = async file => {
    const data = await sharp (file)
        .resize ({
            width: 128,
            height: 128,
            fit: sharp.fit.inside,
            withoutEnlargement: true
        })
        .webp ()
        .toBuffer ();
    return data;
}

const generateThumbnail = async file => {
    const data = await sharp (file)
        .resize ({
            width: 512,
            height: 512,
            fit: sharp.fit.inside,
            withoutEnlargement: true
        })
        .webp ()
        .toBuffer ();
    return data;
}

const uploadToIPFS = async file => {
    const ipfs = ipfsClient.create ({
        host: "ipfs.infura.io",
        port: 5001,
        protocol: "https",
        headers: {
            authorization: infuraAuth,
        }
    });
    const buffer = file.arrayBuffer ? await file.arrayBuffer() : file;
    const addedFile = await ipfs.add(buffer);
    await ipfs.pin.add (addedFile.path);
    return addedFile.path;
}

const createCollection = async (req, res, next) => {
    const ownerEVMAddress = await getEVMAddress (req.user.address);
    let col = {
        name: req.body.name || '',
        description: req.body.description || '',
        owner: ownerEVMAddress,
        created: new Date ().getTime (),
        image: ''
    }

    try {
        const logoPromise = generateLogo (req.file.buffer);
        const thumbnailPromise = generateThumbnail (req.file.buffer);

        const [logo, thumbnail] = await Promise.all ([logoPromise, thumbnailPromise]);

        const [logoHash, thumbnailHash] = await Promise.all ([uploadToIPFS (logo), uploadToIPFS (thumbnail)]);

        col.image = `ipfs://${logoHash}`;
        col.thumbnail = `ipfs://${thumbnailHash}`;

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