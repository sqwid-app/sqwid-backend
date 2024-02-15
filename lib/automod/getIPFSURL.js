const { getCIDv1 } = require("./getCIDv1");

module.exports = {
    getCloudflareURL: (url) => `https://cloudflare-ipfs.com/ipfs/${url.replace("ipfs://", "")}`,
    getDwebURL: (url) => `https://${getCIDv1(url)}.ipfs.dweb.link/`,
    getInfuraURL: (url) => `https://reef.infura-ipfs.io/ipfs/${url.replace("ipfs://", "")}`
}
