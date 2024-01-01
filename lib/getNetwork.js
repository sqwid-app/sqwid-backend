const { networks, defaultNetwork } = require('../constants');
module.exports = (name) => {
    let net = name||defaultNetwork;
    console.log('getNetwork call=',net, ' options=',Object.keys(networks), name==='reef_testnet');
    return networks[net];
}
