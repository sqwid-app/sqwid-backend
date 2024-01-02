const { networks, defaultNetwork } = require('../constants');
module.exports = () => {
    let networkConfig = networks[defaultNetwork];
    if (!networkConfig) {
        throw new Error('Network config not found for='+defaultNetwork + " config networks="+Object.keys(networks))
    }
    return networkConfig;
}
