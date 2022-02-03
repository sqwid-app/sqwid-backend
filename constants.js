const networks = {
    reef_testnet: {
        rpc: 'wss://rpc-testnet.reefscan.com/ws',
        contracts: {
            marketplace: '0xb4a9E2655c52a523711966cd0804df697fB71A47',
            erc1155: '0x5646C5AE729b456a164414CdA57CDF41074A5478',
            utility: '0x5Ba166aC0F513ec08F35CfD661760Db4928b815B',
            wrapper: '0x7b9eE96d67D4352ce5b7129f11387128BA9c2Db4'
        }
    },
    reef_mainnet: {},
    godwoken: {}
}

module.exports = {
    networks
}