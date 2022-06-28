const { CID } = require ('multiformats/cid');
const getCloudflareURL = (url) => `https://cloudflare-ipfs.com/ipfs/${url.replace ("ipfs://", "")}`;

const getDwebURL = (url) => {
	let [randomAssString, filename] = url.replace ("ipfs://", "").split("/")
	return `https://${randomAssString}.ipfs.dweb.link/${filename}`
}

const getCIDv1 = url =>
	CID.parse(url.replace("ipfs://", "")).toV1().toString();


// const getInfuraURL = (url) => {
// 	let [randomAssString, filename] = url.replace ("ipfs://", "").split("/")
// 	return `https://ipfs.infura.io/ipfs/${randomAssString}/${filename}`
// }

const getInfuraURL = url =>
	`https://${getCIDv1(url)}.ipfs.infura-ipfs.io/`;

module.exports = {
	getCloudflareURL,
	getDwebURL,
	getInfuraURL
}