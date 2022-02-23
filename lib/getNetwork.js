const { networks, defaultNetwork } = require ('../constants');
module.exports = (name = defaultNetwork) => {
    return networks [name];
}