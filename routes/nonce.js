const { Router } = require ('express');
const firebase = require ('../lib/firebase');
const generateNonce = require ('../lib/nonce');

let nonce = (req, res) => {
    firebase
    .collection ('users')
    .doc (req.query.address)
    .get ()
    .then ((doc) => {
        if (doc.exists) {
            res.json ({
                nonce: doc.data ().nonce
            });
        } else {
            let nonce = generateNonce ();
            console.log (nonce);
            firebase.collection ('users').doc (req.query.address).set ({
                address: req.query.address,
                nonce,
                displayName: req.query.address,
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