const { networks, defaultNetwork } = require('../constants');
module.exports = (name) => {
    let net = name||defaultNetwork;
    console.log('getNetwork call=',net, ' options=',Object.keys(networks), name==='reef_testnet');
    console.log('val=',networks[net]);
    console.log('val22=',networks['reef_testnet']);
    return networks[net];
}
