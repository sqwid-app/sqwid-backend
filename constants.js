const networks = {
    reef_testnet: {
        rpc: 'wss://rpc-testnet.reefscan.info/ws',
        contracts: {
            marketplace: '0xB4630116Dca95650C1E56F3dD39c7edeb1075B38',
			erc1155: '0xc2F3BE4636A0a1ddf3b4D63ef22014DD41114336',
			utility: '0x30eDebE433702029C00544615aCC4E1b445939BA',
            multicall: '0x79cFCD43AA37A20187F4000BF4e3E4275356B109'
        },
        typesense: {
            collections: {
                collections: 'testnet_collections',
                users: 'testnet_users',
                collectibles: 'testnet_collectibles',
            },
            host: 'search.sqwid.app'
        },
        useCache: true,
        graphql_api_explorer: 'https://squid.subsquid.io/reef-explorer-testnet/graphql',
        graphql_api_marketplace: 'https://squid.subsquid.io/sqwid-marketplace-testnet/graphql',
    },
    reef_mainnet: {
        rpc: 'wss://rpc.reefscan.info/ws',
        contracts: {
            marketplace: "0xB13Be9656B243600C86922708C20606f5EA89218",
			erc1155: "0x0601202b75C96A61CDb9A99D4e2285E43c6e60e4",
			utility: "0xffb12A5f69AFBD58Dc49b4AE9044D8F20D131733",
            multicall: "0x137A7237e2a5f7f2eEE1C1471fbb26d0be8Fcc60"
        },
        typesense: {
            collections: {
                collections: 'mainnet_collections',
                users: 'mainnet_users',
                collectibles: 'mainnet_collectibles',
            },
            host: 'search.sqwid.app'
        },
        useCache: true,
        graphql_api_explorer: 'https://squid.subsquid.io/reef-explorer/graphql',
        graphql_api_marketplace: 'https://squid.subsquid.io/sqwid-marketplace/graphql',
    }
}

const TEMP_PATH = "./temp-uploads/";

module.exports = {
    networks,
    defaultNetwork: process.env.DEFAULT_NETWORK || 'reef_mainnet',
    defaultCollectionId: 'ASwOXeRM5DfghnURP4g2',
    TEMP_PATH
}
