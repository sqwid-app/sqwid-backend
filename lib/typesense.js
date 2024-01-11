const Typesense = require('typesense');
const getNetworkConfig = require('./getNetworkConfig');
const { defaultNetwork, TESTNET} = require('../constants');
const key = defaultNetwork === TESTNET ? process.env.TESTNET_TYPESENSE_API_KEY : process.env.MAINNET_TYPESENSE_API_KEY;

const typesense = new Typesense.Client({
    apiKey: key,
    nodes: [
        {
            host: getNetworkConfig().typesense.host,
            port: '443',
            protocol: 'https'
        }
    ],
    numRetries: 3,
    connectionTimeoutSeconds: 10
});

module.exports = typesense;
