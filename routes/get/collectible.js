const { Router } = require ('express');
const firebase = require ('../../lib/firebase');

const getCollectible = async (req, res) => {
    const id = req.params.id;

    const collectible = await firebase.collection ('collectibles').doc (id).get ();

    if (!collectible.exists) {
        return res.status (404).json ({
            error: 'Collectible not found'
        });
    }

    return res.json (collectible.data ());
}

module.exports = () => {
    const router = Router ();

    // router.get ('/:id', getCollectible);
    
    return router;
}