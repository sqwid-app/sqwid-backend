const { Router } = require ('express');
const { moderators } = require('../../constants');

const isModerator = async (req, res) => {
    try {
        const address = req.params.address;
        
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