const { getWallet } = require ('./getWallet');
const ethers = require ('ethers');

const getEVMAddress = async (address) => {
    try {
        const { provider } = await getWallet ();

        address = await provider.api.query.evmAccounts.evmAddresses (address);
        address = (0, ethers.utils.getAddress) (address.toString ());

        return address;
    } catch (e) {
        console.log (e);
        return address;
    }
}

module.exports = { getEVMAddress };