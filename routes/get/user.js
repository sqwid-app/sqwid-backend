const { Router } = require ('express');
const firebase = require ('../../lib/firebase');

const getUser = async (req, res) => {
    const { identifier } = req.params;
    let user = await firebase.collection ('users').doc (identifier).get ();
    if (user.exists) {
        const data = user.data ();
        delete data.nonce;
        res.json (data);
    } else {
        user = await firebase.collection ('users').where ('displayName', '==', identifier).get ();
        if (user.empty) {
            res.status (404).json ({ error: 'User not found' });
        } else {
            const data = user.docs[0].data ();
            delete data.nonce;
            res.json (data);
        }
    }
}

module.exports = () => {
    const router = Router ();

    router.get ('/:identifier', getUser);
    
    return router;
}