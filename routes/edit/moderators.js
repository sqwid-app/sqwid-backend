const { Router } = require ('express');
const { moderators } = require('../../constants');
const { isValidSignature } = require('../../lib/verify');
const firebase = require('../../lib/firebase');
const { getWallet } = require('../../lib/getWallet');
const { FieldValue } = require ('firebase-admin').firestore;

const approveBlacklistedCollectionById = async (req, res) => {
    try {
        const {
            moderatorSignature,moderatorAddress,address,
            itemId,collectionId} = req.body;

        //check if moderator address is the correct evm address of the native address sent
        const {provider} = await getWallet();

        const addressResolutionResult = await provider.api.query.evmAccounts.accounts(moderatorAddress);

        if(addressResolutionResult.toString()!=address){
            return res.json({
                data: false,
                error:"Incorrect nativeAddress-evmAddress pair"
            })
        }
        

        // check if moderator is in array of moderators
        const isValidModerator = moderators.includes(moderatorAddress);
        if(!isValidModerator){
            return res.json({
                data: false,
                error:"Not a valid moderator"
            })
        }

        // check if signature is valid or not
        const message = "verify-moderator";

        const isValid = isValidSignature(message,moderatorSignature,address);

        if(!isValid){
            return res.json ({
                data:false,
                error:"Signature is not valid"
            });
        }

        // force approve by moderator
        firebase
        .collection('collectibles')
        .where('id', '==', itemId)
        .where('collectionId', '==', collectionId)
        .get()
        .then((querySnapshot) => {
            if (querySnapshot.empty) {
            console.log('No matching documents found.');
            return;
            }
            querySnapshot.forEach((doc) => {
            doc.ref
                .update({
                approved: true
                })
                .then(() => {
                console.log(`Collectible with ID ${doc.id} approved successfully.`);
                })
                .catch((error) => {
                console.error(`Error updating document with ID ${doc.id}:`, error);
                });
            });
        })
        .catch((error) => {
            console.error('Error finding document:', error);
        });


        await firebase.collection ('blacklists').doc ('collectibles').update ({
            allowed: FieldValue.arrayUnion ({
                id:itemId,
                collection: collectionId
            })
        });

        return res.json ({
            data:true,
            error:null
        });
    } catch (error) {
        return res.json ({
            data:false,
            error:error.message
        }); 
    }
}

module.exports = ()=>{
    const router = Router ();
    router.post ('/', approveBlacklistedCollectionById);
    return router;
}