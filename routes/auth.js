const { Router } = require ('express');
const firebase = require ('../lib/firebase');
const { isValidSignature } = require ('../lib/verify');
const generateNonce = require ('../lib/nonce');
const generateToken = require ('../lib/jwt');
const { getEVMAddress } = require('../lib/getEVMAddress');

let auth = (req, res) => {
    firebase
    .collection ('users')
    .doc (req.body.address)
    .get ()
    .then (async doc => {
        if (doc.exists) {
            const user = doc.data ();
            const { nonce } = user;
            const { address, signature, evmAddress } = req.body;

            if (isValidSignature (nonce, signature, address)) {
                const _evmAddress = await getEVMAddress (address);
                let jwt = generateToken (address, _evmAddress);
                doc.ref.set ({
                    nonce: generateNonce (),
                    evmAddress: _evmAddress,
                    created: user.created || new Date ()
                }, { merge: true }).then (() => {
                    res.status (200).send ({
                        status: 'success',
                        token: jwt,
                        message: 'Valid signature'
                    });
                });

            } else {
                res.status (400).send ({
                    status: 'error',
                    message: 'Invalid signature'
                });
            }
        } else {
            res.status (401).send ({
                status: 'error',
                message: 'User not found'
            });
        }
    })
    .catch (err => {
        res.status (402).send ({
            status: 'error',
            message: err.message
        });
    });
}

// const auth = async (req, res) => {
//     console.log("heree")
//     const { address, signature, evmAddress } = req.body;

//     // Input validation
//     if (!address || !signature || !evmAddress) {
//         return res.status(400).send({
//             status: 'error',
//             message: 'Missing required fields'
//         });
//     }

//     try {
//         console.log("here in try of auth")
//         const firestore = firebase; // Your Firestore instance

//         // Log all collections and documents
//         const collections = await firestore.listCollections();
//         console.log('Collections in Firestore:');
//         for (const collection of collections) {
//             console.log(`Collection: ${collection.id}`);
            
//             // Fetch all documents in the collection
//             const snapshot = await collection.get();
//             snapshot.docs.forEach(doc => {
//                 console.log(`  Document: ${doc.id}`, doc.data());
//             });
//         }

//         // Fetch user from Firestore
//         const userDoc = await firestore.collection('users').doc(address).get();

//         if (!userDoc.exists) {
//             return res.status(401).send({
//                 status: 'error',
//                 message: 'User not found'
//             });
//         }

//         const user = userDoc.data();
//         const { nonce } = user;

//         // Validate signature
//         if (!isValidSignature(nonce, signature, address)) {
//             return res.status(400).send({
//                 status: 'error',
//                 message: 'Invalid signature'
//             });
//         }

//         // Get EVM address
//         const _evmAddress = await getEVMAddress(address);

//         // Generate JWT token
//         const jwt = generateToken(address, _evmAddress);

//         // Update Firestore
//         await userDoc.ref.set({
//             nonce: generateNonce(),
//             evmAddress: _evmAddress,
//             created: user.created || new Date()
//         }, { merge: true });

//         res.status(200).send({
//             status: 'success',
//             token: jwt,
//             message: 'Valid signature'
//         });
//     } catch (err) {
//         console.error('Auth error:', err.message);
//         res.status(500).send({
//             status: 'error',
//             message: 'Internal Server Error'
//         });
//     }
// };


module.exports = () => {
    const router = Router ();

    router.post ('/', auth);

    return router;
}