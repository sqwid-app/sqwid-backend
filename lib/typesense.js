const Typesense = require('typesense');
const getNetwork = require('./getNetwork');
const typesense = new Typesense.Client ({
    apiKey: process.env.TESTNET_TYPESENSE_API_KEY,
    nodes: [
        {
            host: getNetwork ().typesense.host,
            port: '443',
            protocol: 'https'
        }
    ],
    numRetries: 3,
    connectionTimeoutSeconds: 10
});

module.exports = typesense;