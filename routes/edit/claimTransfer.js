const { Router } = require ('express');
const firebase = require ('../../lib/firebase');
const { verify } = require ('../../middleware/auth');

const claimTokens = async (req, res) => {
    const { evmAddress } = req.user;
    const { tokenId } = req.params;
    const q = await firebase.collection ('claims')
        .where ('owner', '==', evmAddress)
        .where ('nftId', '==', Number (tokenId))
        .where ('claimed', '==', false).get ();
    if (q.empty) {
        res.status (404).json ({
            error: 'Claim not found'
        });
    } else {
        await q[0].ref.update ({
            claimable: false
        }, { merge: true });

        res.status (200).json ({
            success: true
        });
    }
}

module.exports = {
    router: () => {
        const router = Router ();

        router.post ('/:tokenId', verify, claimTokens);
        
        return router;
    }
}