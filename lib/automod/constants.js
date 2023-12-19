const gql = require ('graphql-tag');
module.exports = {
    clients: {
        testnet: {
            wsurl: 'wss://testnet.reefscan.com/graphql',
            abi: [
                'event ItemCreated(uint256 indexed itemId,address indexed nftContract,uint256 indexed tokenId,address creator);',
                'event PositionUpdate(uint256 indexed positionId,uint256 indexed itemId,address indexed owner,uint256 amount,uint256 price,uint256 marketFee,uint8 state);'
            ],
            query: gql`
            subscription evmEvents ($where: evm_event_bool_exp) {
                evm_event(where: $where, order_by: { block_id: desc, event_id: desc }, limit: 1) {
                    data_raw
                }
              }`,
            variables: {
                where: {
                    contract_address: {
                        _eq: "0xb4a9E2655c52a523711966cd0804df697fB71A47"
                    }
                }
            },
            eventObjectName: 'evm_event',
            dataObjectName: 'data_raw'
        },
        mainnet: {
            wsurl: 'wss://reefscan.com/api/v3',
            abi: [
                'event ItemCreated(uint256 indexed itemId,address indexed nftContract,uint256 indexed tokenId,address creator);',
                'event PositionUpdate(uint256 indexed positionId,uint256 indexed itemId,address indexed owner,uint256 amount,uint256 price,uint256 marketFee,uint8 state);'
            ],
            query: gql`
            subscription events(
              $blockNumber: bigint
              $perPage: Int!
              $offset: Int!
              $contractAddressFilter: String!
            ) {
              event(
                limit: $perPage
                offset: $offset
                where: {block_number: { _eq: $blockNumber }, section: { _eq: "evm" }, method: { _eq: "Log" }, data: {_like: $contractAddressFilter}}
                order_by: { block_number: desc, event_index: desc }
              ) {
                block_number
                event_index
                data
                method
                phase
                section
                timestamp
              }
            }
          `,
            variables: {
                perPage: 1,
                offset: 0,
                contractAddressFilter: `[{"address":"0x2aed20ada48d32e82250e2ac017b68fdd2bcb2fa"%`
            },
            eventObjectName: 'event',
            dataObjectName: 'data'
        }
    }
}