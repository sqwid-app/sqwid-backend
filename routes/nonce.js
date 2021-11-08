const { Router } = require ('express');
const firebase = require ('../lib/firebase');
const generateNonce = require ('../lib/nonce');
const { getWallet } = require ('../lib/getWallet');

let nonce = (req, res) => {
    firebase
    .collection ('users')
    .doc (req.query.address)
    .get ()
    .then (async (doc) => {
        if (doc.exists) {
            res.json ({
                nonce: doc.data ().nonce,
            });
        } else {
            let nonce = generateNonce ();
            const { provider } = await getWallet ();
            let evmAddress
            
            try {
                evmAddress = await provider.api.query.evmAccounts.evmAddresses (req.query.address);
                evmAddress = (0, ethers.utils.getAddress) (evmAddress.toString ());
            } catch (e) {
                evmAddress = req.query.address;
            }

            firebase.collection ('users').doc (req.query.address).set ({
                address: req.query.address,
                nonce,
                evmAddress,
                displayName: evmAddress,
                bio: ''
            }).then (() => {
                res.json ({
                    nonce
                });
            }).catch ((err) => {
                console.log (err);
            });
        }
    })
    .catch ((error) => {
      res.json ({ error });
    });
}

module.exports = () => {
    const router = Router ();

    router.get ('/', nonce);

    return router;
}