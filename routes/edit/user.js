const { Router } = require ('express');
const firebase = require ('../../lib/firebase');
const { verify } = require ('../../middleware/auth');
const { sanitize, checkAllowed, checkSize } = require('../../middleware/socials');

const getUser = async (req, res) => {
    const { address } = req.query;
    const user = await firebase.collection ('users').doc (address).get ();
    if (user.exists) {
        const data = user.data ();
        delete data.nonce;
        res.json (data);
    } else {
        res.status (404).send ({
            error: 'User not found'
        });
    }
}

const changeDisplayName = async (req, res) => {
    const { displayName } = req.body;
    const { address } = req.user;
    const user = await firebase.collection ('users').doc (address).get ();
    if (user.exists) {
        await user.ref.update ({
            displayName
        });
        res.status (200).send ({
            success: true
        });
    } else {
        res.status (404).send ({
            error: 'User not found'
        });
    }
}

const changeBio = async (req, res) => {
    const { bio } = req.body;
    const { address } = req.user;
    const user = await firebase.collection ('users').doc (address).get ();
    if (user.exists) {
        await user.ref.update ({
            bio
        });
        res.status (200).json ({
            success: true
        });
    } else {
        res.status (404).json ({
            error: 'User not found'
        });
    }
}

const socials = async (req, res) => {
    const { social } = req.params;
    const { address } = req.user;
    if (!req.body [social] && req.body [social] !== '') {
        res.status (400).json ({
            error: 'Missing social'
        });
        return;
    }
    const user = await firebase.collection ('users').doc (address).get ();
    if (user.exists) {
        await user.ref.update ({
            socials: {
                ...user.data ().socials,
                [social]: req.body[social]
            }
        });
        res.status (200).json ({
            success: true
        });
    } else {
        res.status (404).json ({
            error: 'User not found'
        });
    }
}

module.exports = () => {
    const router = Router ();

    router.post ('/displayName', verify, sanitize, checkSize, changeDisplayName);
    router.post ('/bio', verify, sanitize, checkSize, changeBio);
    router.post ('/socials/:social', verify, sanitize, checkAllowed, checkSize, socials);
    
    return router;
}