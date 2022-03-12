const networks = {
    reef_testnet: {
        rpc: 'wss://rpc-testnet.reefscan.com/ws',
        contracts: {
            marketplace: '0xB2871bF369ce67cc0E251b449fc21A6DbAe93c2e',
			erc1155: '0x49aC7Dc3ddCAb2e08dCb8ED1F18a0E0369515E47',
			utility: '0x98BCbedbBd3c84232d19584fE822FaC85b45885E',
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