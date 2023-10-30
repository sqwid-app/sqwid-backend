const Typesense = require('typesense');
const getNetwork = require('./getNetwork');
const { defaultNetwork } = require('../constants');
const key = defaultNetwork === 'reef_testnet' ? process.env.TESTNET_TYPESENSE_API_KEY : process.env.MAINNET_TYPESENSE_API_KEY;
//console.log ('typesense k=',key);
const typesense = new Typesense.Client ({
    apiKey: key,
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
