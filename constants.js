const networks = {
    reef_testnet: {
        rpc: 'wss://rpc-testnet.reefscan.info/ws',
        contracts: {
            marketplace: '0xCA864F5BBc03072F70620A359D8CD6f272665DC4',
			erc1155: '0x02fA6e000B4Ba18fbd17552E5c5cf91b03F2e542',
			utility: '0x5B74AcCeB8260B4ae60CF521F6b70571c453cae6',
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