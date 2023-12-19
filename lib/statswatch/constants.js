module.exports = {
    config: {
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
}