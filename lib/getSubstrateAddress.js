const { getWallet } = require ('./getWallet');
const ethers = require ('ethers');

// don't use
const getSubstrateAddress = async (address) => {
    try {
        const { provider } = await getWallet ();

        provider.api.query.uniques.account (address).then (address => {
            console.log (address);
        }).catch (err => {
            console.log ('getSubsAddr ERR=',err);
        });
        // console.log (provider.api.query.evmAccounts.evmAddresses (address));
        // address = await provider.api.query.evmAccounts
        // console.log (address);
        // address = (0, ethers.utils.getAddress) (address.toString ());

        return address;
    } catch (e) {
        return address;
    }
}

module.exports = { getSubstrateAddress };
