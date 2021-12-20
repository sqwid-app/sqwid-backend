const { networks } = require ('../constants');
module.exports = (name = 'reef_testnet') => {
    return networks [name];
}