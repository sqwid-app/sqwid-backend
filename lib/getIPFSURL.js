const getCloudflareURL = (url) => `https://cloudflare-ipfs.com/ipfs/${url.replace ("ipfs://", "")}`;

const getDwebURL = (url) => {
	let [randomAssString, filename] = url.replace ("ipfs://", "").split("/")
	return `https://${randomAssString}.ipfs.dweb.link/${filename}`
}

module.exports = {
	getCloudflareURL,
	getDwebURL
}