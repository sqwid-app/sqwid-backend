const TESTNET = "reef_testnet";
const MAINNET = "reef_mainnet";

const networks = {
  [TESTNET]: {
    rpc: "wss://rpc-testnet.reefscan.com/ws",
    contracts: {
      marketplace: "0x614b7B6382524C32dDF4ff1f4187Bc0BAAC1ed11",
      erc1155: "0x9b9a32c56c8F5C131000Acb420734882Cc601d39",
      utility: "0xEf1c5ad26cE1B42315113C3561B4b2abA0Ba64B3",
      multicall: "0x399d847d3D8F6b9F9A30e4Dc9C89F65a4EF65821",
    },
    typesense: {
      collections: {
        collections: "testnet_collections",
        users: "testnet_users",
        collectibles: "testnet_collectibles",
      },
      host: "search.sqwid.app",
    },
    useCache: false,
    graphql_api_explorer:
      "https://squid.subsquid.io/reef-explorer-testnet/graphql",
    graphql_api_marketplace:
      "https://reef.squids.live/sqwid-marketplace-testnet:prod/api/graphql",
  },
  [MAINNET]: {
    rpc: "wss://rpc.reefscan.com/ws",
    contracts: {
      marketplace: "0xB13Be9656B243600C86922708C20606f5EA89218",
      erc1155: "0x0601202b75C96A61CDb9A99D4e2285E43c6e60e4",
      utility: "0xffb12A5f69AFBD58Dc49b4AE9044D8F20D131733",
      multicall: "0x137A7237e2a5f7f2eEE1C1471fbb26d0be8Fcc60",
    },
    typesense: {
      collections: {
        collections: "mainnet_collections",
        users: "mainnet_users",
        collectibles: "mainnet_collectibles",
      },
      host: "search.sqwid.app",
    },
    useCache: false,
    graphql_api_explorer: "https://squid.subsquid.io/reef-explorer/graphql",
    graphql_api_marketplace:
      "https://squid.subsquid.io/sqwid-marketplace/graphql",
  },
};

const TEMP_PATH = "./temp-uploads/";

const config = {
  testnet: {
    marketplaceContractAddress: "0x614b7B6382524C32dDF4ff1f4187Bc0BAAC1ed11",
    nftContractAddress: "0x9b9a32c56c8F5C131000Acb420734882Cc601d39",
    explorerGraphqlUrl:
      "https://squid.subsquid.io/reef-explorer-testnet/graphql",
    marketplaceGraphqlUrl:
      "https://reef.squids.live/sqwid-marketplace-testnet:prod/api/graphql",
  },
  mainnet: {
    marketplaceContractAddress: "0xB13Be9656B243600C86922708C20606f5EA89218",
    nftContractAddress: "0x0601202b75C96A61CDb9A99D4e2285E43c6e60e4",
    explorerGraphqlUrl: "https://squid.subsquid.io/reef-explorer/graphql",
    marketplaceGraphqlUrl:
      "https://squid.subsquid.io/sqwid-marketplace/graphql",
  },
};

const envNetwork = Object.keys(networks).find(
  (prop) => prop === process.env.NETWORK
);

if (!envNetwork) {
  throw new Error(
    "process.env.NETWORK value=" +
      process.env.NETWORK +
      " not a property name of " +
      Object.keys(networks)
  );
}

const moderators = process.env.MODERATORS?.split(',')??[];

module.exports = {
    networks,
    defaultNetwork: process.env.NETWORK,
    defaultCollectionId: 'ASwOXeRM5DfghnURP4g2',
    moderators,
    TEMP_PATH,
    config,
    TESTNET,
    MAINNET
};
