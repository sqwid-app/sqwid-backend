const { Router } = require ('express');
const firebase = require ('../lib/firebase');

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
            firebase.collection ('users').doc (req.query.address).set ({
                address: req.query.address,
                nonce
            }).then (() => {
                res.json ({
                    nonce
                });
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