const networks = {
    reef_testnet: {
        rpc: 'wss://rpc-testnet.reefscan.com/ws',
        contracts: {
            marketplace: '0xbfe17d89845F2dCA11EE8C26e98ea59a67631Df3',
			erc1155: '0xA9EF55E0987E12F82D05A01c72b683Af43c70938',
			utility: '0x7AB030fA1953074762484167D0BA48C1bEd20CF7',
        },
        useCache: true,
    },
    reef_mainnet: {
        rpc: 'wss://rpc.reefscan.com/ws',
        contracts: {
            marketplace: '',
            erc1155: '',
        },
        useCache: true
    }
}

module.exports = {
    networks,
    defaultNetwork: 'reef_testnet'
}