const { Router } = require ('express');
const firebase = require ('../../lib/firebase');
const { verify } = require ('../../middleware/auth');

const { getWallet } = require ('../../lib/getWallet');

const changeEvmAddress = async (req, res) => {
    const { address } = req.user;
    const { provider } = await getWallet ();
    let evmAddress
    try {
        evmAddress = await provider.api.query.evmAccounts.evmAddresses (req.query.address);
        evmAddress = (0, ethers.utils.getAddress) (evmAddress.toString ());
    } catch (e) {
        evmAddress = req.query.address;
    }

    const user = await firebase.collection ('users').doc (address).get ();
    if (user.exists) {
        await user.ref.update ({
            evmAddress
        });
        res.status (200).json ({
            success: true
        });
    } else {
        res.status (404).json ({
            error: 'User not found'
        });
    }
}

module.exports = () => {
    const router = Router ();

    // router.post ('/', verify, changeEvmAddress);
    
    return router;
}