const { evmAddressQuery, doQuery } = require('./graphqlApi');

const getEVMAddress = async (address) => {
    try {
        return await doQuery (evmAddressQuery (address));
    } catch (e) {
        return address;
    }
}

module.exports = { getEVMAddress };