const { Router } = require ('express');
const { verify } = require ('../../middleware/auth');
const firebase = require ('../../lib/firebase');
const multer = require ('multer');
const { generateLogo, generateThumbnail, uploadToIPFS } = require('../../lib/collection');

const imageUpload = multer ({
    storage: multer.memoryStorage (),
    limits: {
        fileSize: 30000000
    },
});

const deleteCollection = async (req, res) => {
    const { collectionId } = req.params;
    const { evmAddress } = req.user;
    const collection = await firebase.collection ('collections').doc (collectionId).get ();
    if (collection.exists) {
        const collectionData = collection.data ();
        if (collectionData.creator.toLowerCase () !== evmAddress.toLowerCase ()) {
            return res.status (403).json ({ error: 'You are not the creator of this collection' });
        }
        try {
            const collectibleCount = await firebase.collection ('collectibles').where ('collectionId', '==', collectionId).count ().get ();
            if (collectibleCount.data ().count === 0) {
                await firebase.collection ('collections').doc (collectionId).delete ();
                return res.status (200).json ({ success: true });
            } else {
                return res.status (400).json ({ error: 'Collection has collectibles' });
            }
        } catch (e) {
            console.log (e);
            return res.status (500).send ('Error deleting collection');
        }
    } else {
        return res.status (404).json ({ error: 'Collection not found' });
    }
}

const updateCollection = async (req, res) => {
    const { collectionId } = req.params;
    const { evmAddress } = req.user;
    let { name, description } = req.body;
    const collection = await firebase.collection ('collections').doc (collectionId).get ();
    if (collection.exists) {
        const collectionData = collection.data ();
        if (collectionData.creator.toLowerCase () !== evmAddress.toLowerCase ()) {
            return res.status (403).json ({ error: 'You are not the creator of this collection' });
        }
        try {
            if (!name) name = collectionData.name;
            if (!description) description = collectionData.description;
            await firebase.collection ('collections').doc (collectionId).update ({
                name,
                description
            }, { merge: true });
            return res.status (200).json ({ success: true });
        } catch (e) {
            console.log (e);
            return res.status (500).send ('Error updating collection');
        }
    } else {
        return res.status (404).json ({ error: 'Collection not found' });
    }
}

const updateCollectionImage = async (req, res) => {
    const { collectionId } = req.params;
    const { evmAddress } = req.user;
    const collection = await firebase.collection ('collections').doc (collectionId).get ();
    if (collection.exists) {
        const collectionData = collection.data ();
        if (collectionData.creator.toLowerCase () !== evmAddress.toLowerCase ()) {
            return res.status (403).json ({ error: 'You are not the creator of this collection' });
        }
        try {
            const image = req.file;
            const logoPromise = generateLogo (image.buffer);
            const thumbnailPromise = generateThumbnail (image.buffer);

            const [logo, thumbnail] = await Promise.all ([logoPromise, thumbnailPromise]);

            const [logoHash, thumbnailHash] = await Promise.all ([uploadToIPFS (logo), uploadToIPFS (thumbnail)]);

            await firebase.collection ('collections').doc (collectionId).update ({
                image: `ipfs://${logoHash}`,
                thumbnail: `ipfs://${thumbnailHash}`
            }, { merge: true });

            return res.status (200).json ({ success: true });
        } catch (e) {
            console.log (e);
            return res.status (500).send ('Error updating collection image');
        }
    } else {
        return res.status (404).json ({ error: 'Collection not found' });
    }
}

module.exports = () => {
    const router = Router ();

    router.post ('/delete/:collectionId', verify, deleteCollection);
    router.post ('/id/:collectionId/info', verify, updateCollection);
    router.post ('/id/:collectionId/image', [verify, imageUpload.single ("fileData")], updateCollectionImage);
    
    return router;
}