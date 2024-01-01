
const networks = {
    'reef_testnet': {
        rpc: 'wss://rpc-testnet.reefscan.info/ws',
        contracts: {
            marketplace: '0x31939DF5c6A5ac0b574EDE6E610Fd30c08788A53',
	    erc1155: '0x9FdEb478A27E216f80DaEE0967dc426338eD02f2',
	    utility: '0x8E7Ef6bD28cD9bDb6DBf105140958ac03EeC371A',
            multicall: '0x399d847d3D8F6b9F9A30e4Dc9C89F65a4EF65821'
        },
        typesense: {
            collections: {
                collections: 'testnet_collections',
                users: 'testnet_users',
                collectibles: 'testnet_collectibles',
            },
            host: 'search.sqwid.app'
        },
        useCache: false,
        graphql_api_explorer: 'https://squid.subsquid.io/reef-explorer-testnet/graphql',
        graphql_api_marketplace: 'https://squid.subsquid.io/sqwid-marketplace-testnet/graphql',
    },
    'reef_mainnet': {
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
        useCache: false,
        graphql_api_explorer: 'https://squid.subsquid.io/reef-explorer/graphql',
        graphql_api_marketplace: 'https://squid.subsquid.io/sqwid-marketplace/graphql',
    }
}

const TEMP_PATH = "./temp-uploads/";

const config = {
        testnet: {
            marketplaceContractAddress: '0xB4630116Dca95650C1E56F3dD39c7edeb1075B38',
            nftContractAddress: '0xc2F3BE4636A0a1ddf3b4D63ef22014DD41114336',
            explorerGraphqlUrl: 'https://squid.subsquid.io/reef-explorer-testnet/graphql',
            marketplaceGraphqlUrl: 'https://squid.subsquid.io/sqwid-marketplace-testnet/graphql',
            pusherEventExplorer: 'block-finalised-testnet',
            pusherEventMarketplace: 'sqwid-events-emitted-testnet'
          },
          mainnet: {
            marketplaceContractAddress: '0xB13Be9656B243600C86922708C20606f5EA89218',
            nftContractAddress: '0x0601202b75C96A61CDb9A99D4e2285E43c6e60e4',
            explorerGraphqlUrl: 'https://squid.subsquid.io/reef-explorer/graphql',
            marketplaceGraphqlUrl: 'https://squid.subsquid.io/sqwid-marketplace/graphql',
            pusherEventExplorer: 'block-finalised',
            pusherEventMarketplace: 'sqwid-events-emitted'
          }
    }

const envNetwork = Object.keys(networks).find((prop)=>propπ===process.env.NETWORK);

if (!envNetwork) {
    throw new Error('process.env.NETWORK value=', process.env.NETWORK,' not a property name of ', Object.keys(networks));
}

module.exports = {
    networks,
    defaultNetwork: process.env.NETWORK,
    defaultCollectionId: 'ASwOXeRM5DfghnURP4g2',
    TEMP_PATH,
    config,
};
