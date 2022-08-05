const { Router } = require ('express');
const { cacheCollectibles } = require('../../lib/caching');
const firebase = require ('../../lib/firebase');
const { getEVMAddress } = require('../../lib/getEVMAddress');
const { verify } = require ('../../middleware/auth');
const { getDbCollectibles } = require('../get/marketplace');

const getHearts = async (req, res) => {
    const { collectible } = req.params;
    const item = await getDbCollectibles ([collectible]);
    if (item.exists) {
        const hearts = item.hearts || [];
        res?.status (200).json ({
            hearts
        });
        return hearts;
    } else {
        res?.status (404).json ({
            error: 'Collectible not found'
        });
        return [];
    }
}

const doHeart = async (req, res) => {
    const { collectible } = req.params;
    const { address } = req.user;
    const evmAddressPromise = getEVMAddress (address);
    const itemPromise = firebase.collection ('collectibles').where ('id', '==', Number (collectible)).get ();
    const [item, evmAddress] = await Promise.all ([itemPromise, evmAddressPromise]);
    if (!item.empty) {
        const hearts = item.docs [0].data ().hearts || [];
        if (hearts.includes (evmAddress)) {
            hearts.splice (hearts.indexOf (evmAddress), 1);
        } else {
            hearts.push (evmAddress);
        }
        const newData = {
            ...item.docs [0].data (),
            hearts
        }
        await Promise.all ([item.docs [0].ref.update ({ hearts }), cacheCollectibles ([newData])]);
        res.status (200).json ({
            success: true,
            hearts
        });
    } else {
        res.status (404).json ({
            error: 'Collectible not found'
        });
    }
}

module.exports = {
    router: () => {
        const router = Router ();
    
        router.get ('/:collectible', getHearts);
        router.post ('/:collectible', verify, doHeart);
        
        return router;
    },
    getHearts
}