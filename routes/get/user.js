const { Router } = require ('express');
const firebase = require ('../../lib/firebase');

const getUserOld = async (req, res) => {
    const { identifier } = req.params;
    let user = await firebase.collection ('users').doc (identifier).get ();
    if (user.exists) {
        const data = user.data ();
        delete data.nonce;
        res?.json (data);
        return data;
    } else {
        user = await firebase.collection ('users').where ('evmAddress', '==', identifier).get ();
        if (user.empty) {
            res?.status (404).json ({ error: 'User not found' });
            return null;
        } else {
            const data = user.docs[0].data ();
            delete data.nonce;
            res?.json (data);
            return data;
        }
    }
}

const getUser = async (req, res) => {
    const { identifier } = req.params;
    let userBySubstrateAddress = firebase.collection ('users').doc (identifier).get ();
    let userByEvmAddress = firebase.collection ('users').where ('evmAddress', '==', identifier).get ();
    let user, response;
    try {
        user = await Promise.all ([userBySubstrateAddress, userByEvmAddress]);
    } catch (e) {
        console.log (e);
        res?.status (500).json ({ error: 'Internal server error' });
        return null;
    }
    if (user[0].exists) {
        const data = user[0].data ();
        delete data.nonce;
        response = data;
        // res?.json (data);
        // return data;
    } else if (user[1].empty) {
        res?.status (404).json ({ error: 'User not found' });
        return null;
    } else {
        const data = user[1].docs[0].data ();
        delete data.nonce;
        response = data;
        // res?.json (data);
        // return data;
    }
    res?.json (response);
    return response;
}

module.exports = {
    router: () => {
        const router = Router ();

        router.get ('/:identifier', getUser);
        
        return router;
    },
    getUser
}