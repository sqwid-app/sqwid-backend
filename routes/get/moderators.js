const { Router } = require ('express');
const firebase = require("../../lib/firebase")

const getModerators = async () => {
    try {
        const configRef = firebase.collection('config');
        const moderatorsDoc = await configRef.doc('content_moderators').get();
        return moderatorsDoc.data()?.addresses || [];
    } catch (error) {
        console.error('Error fetching moderators from Firebase:', error);
        return [];
    }
};

const isModerator = async (req, res) => {
    try {
        const address = req.params.address;

        const moderators = await getModerators();
        
        return res.json ({
            data:moderators.includes(address),
            error:null
        });
    } catch (error) {
        return res.json ({
            data:false,
            error:error.message
        }); 
    }
}

module.exports = {
    router: () => {
        const router = Router ();
        router.get ('/:address', isModerator);
        return router;
    },
    isModerator:isModerator
}