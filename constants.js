const networks = {
    reef_testnet: {
        rpc: 'wss://rpc-testnet.reefscan.com/ws',
        contracts: {
            marketplace: '0xd3202Ee6077C7cc25eAea3aE11bec2cD731D19FC',
			erc1155: '0xE3c13deC43Ad58F95f964Acd0461450AD0C35649',
			utility: '0x08925246669D150d5D4597D756A3C788eae2834B',
        },
        useCache: true,
    },
    reef_mainnet: {
        rpc: 'wss://rpc.reefscan.com/ws',
        contracts: {
            marketplace: '0xe3f2740452A860c6441456aDF86D6d0be715ae82',
            erc1155: '0xa1957161Ee6Cb6D86Ae7A9cE12A30C40Dc9F1B68',
            utility: '0xffb12A5f69AFBD58Dc49b4AE9044D8F20D131733'
        },
        useCache: true
    }
}

module.exports = {
    networks,
    defaultNetwork: process.env.DEFAULT_NETWORK || 'reef_mainnet'
}