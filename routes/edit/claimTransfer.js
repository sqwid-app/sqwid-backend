const { Router } = require ('express');
const firebase = require ('../../lib/firebase');
const { verify } = require ('../../middleware/auth');

const claimTokens = async (req, res) => {
    const { evmAddress } = req.user;
    const { tokenId } = req.params;
    const { remove } = req.body;
    console.log (evmAddress, tokenId);
    const q = await firebase.collection ('transfers').where ('to', '==', evmAddress).where ('tokenId', '==', Number (tokenId)).get ();
    if (q.empty) {
        res.status (404).json ({
            error: 'Transfer not found'
        });
    } else {
        q.forEach (async doc => {
            if (remove) {
                await doc.ref.delete ();
            } else {
                await doc.ref.update ({
                    claimable: false
                }, { merge: true });
            }
        });
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