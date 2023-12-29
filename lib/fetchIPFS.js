const axios = require('axios');
const { getCloudflareURL, getDwebURL, getInfuraURL } = require('./getIPFSURL');

module.exports = {
    race: hash => {
        return Promise.any([
            axios.get(getCloudflareURL(hash)),
            axios.get(getDwebURL(hash)),
            axios.get(getInfuraURL(hash))
        ]);
    }
}
