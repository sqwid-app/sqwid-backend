const ipfsClient = require ('ipfs-http-client');

const infuraAuth =
    'Basic ' + Buffer.from(process.env.INFURA_IPFS_PROJECT_ID + ':' + process.env.INFURA_IPFS_PROJECT_SECRET).toString('base64');

const initIpfs = () => {
  return ipfsClient.create({
      host: 'ipfs.infura.io',
      port: 5001,
      protocol: 'https',
      headers: {
          authorization: infuraAuth,
      },
  });
}

module.exports = { initIpfs };