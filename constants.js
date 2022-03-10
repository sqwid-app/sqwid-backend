const networks = {
    reef_testnet: {
        rpc: 'wss://rpc-testnet.reefscan.com/ws',
        contracts: {
            marketplace: '0xbfe17d89845F2dCA11EE8C26e98ea59a67631Df3',
			erc1155: '0x4B36bA56C20e73d6803b218189a5cc20eaeB9bd5',
			utility: '0x4Ce7D1b40a25ab112DB5Dd608aE182F6156AdD19',
        },
        useCache: true,
    },
    reef_mainnet: {
        rpc: 'wss://rpc.reefscan.com/ws',
        contracts: {
            marketplace: '0xe124E8bD72Df842189e6E0762558191f267E5E9d',
            erc1155: '0x5728847Ca5d2466dE6AcD33597D874f480acdAdB',
            utility: '0x52CD9d5B4A9a3610Bd87668B5158B7d7259CA430'
        },
        useCache: true
    }
}

module.exports = {
    networks,
    defaultNetwork: process.env.DEFAULT_NETWORK || 'reef_mainnet'
}