const { ApolloClient, InMemoryCache, gql, createHttpLink } = require('@apollo/client/core');
const fetch = require('node-fetch');
const {config} = require('./../../constants');
const { default: axios } = require('axios');

// process.env ['NODE_TLS_REJECT_UNAUTHORIZED'] = 0; // What is this for?

const initApolloClient = (url) => {
    return new ApolloClient({
        link: createHttpLink({
            uri: url,
            fetch
        }),
        cache: new InMemoryCache(),
    });
}

const clients = {
    mainnet: {
        marketplace: initApolloClient(config ['mainnet'].marketplaceGraphqlUrl),
        explorer: initApolloClient(config ['mainnet'].explorerGraphqlUrl),
    },
    testnet: {
        marketplace: initApolloClient(config ['testnet'].marketplaceGraphqlUrl),
        explorer: initApolloClient(config ['testnet'].explorerGraphqlUrl),
    }
};

const initAxiosClient =(url)=> axios.create({
    baseURL: url,
});


const axiosClients = {
    mainnet: {
        marketplace: initAxiosClient(config ['mainnet'].marketplaceGraphqlUrl),
        explorer: initAxiosClient(config ['mainnet'].explorerGraphqlUrl),
    },
    testnet: {
        marketplace: initAxiosClient(config ['testnet'].marketplaceGraphqlUrl),
        explorer: initAxiosClient(config ['testnet'].explorerGraphqlUrl),
    }
};

// Marketplace queries

const salesQuery = (blockHeight, network) => {
    const entity = 'sales';
    const limit = 150;
    const query = `
        query {
            ${entity} (
                limit: ${limit},
                offset: {OFFSET},
                orderBy: blockHeight_ASC,
                where: {
                    blockHeight_gt: ${blockHeight}
                }
            ) {
                item { id }
                amount
                price
                blockHeight
            }
        }
    `;
    const mapper = (sales) => {
        return sales.map(sale => {
            return {
                itemId: Number(sale.item.id),
                amount: Number(sale.amount),
                price: Number((Number(sale.price) / 1e18).toFixed(2)),
                blockHeight: Number(sale.blockHeight)
            }
        });
    }

    return { query, entity, limit, client: clients [network].marketplace, mapper };
}

const hasAvailablePositionsQuery = (ownerAddress, nftId, network) => {
    const entity = 'positionsConnection';
    const limit = 1;
    const query = `
        query {
            ${entity} (
                orderBy: id_ASC, 
                where: { 
                    owner_eq: "${ownerAddress}", 
                    AND: { item: {
                        nftContract_eq: "${config [network].nftContractAddress}", 
                        AND: { tokenId_eq: ${nftId} } },
                            AND: { state_eq: Available, 
                                AND: { amount_gt: 0 }
                            }
                    }
                }
            ) {
                totalCount
            }
        }
    `;
    const mapper = (availablePositions) => availablePositions[0].totalCount > 0;

    return { query, entity, limit, client: clients [network].marketplace, mapper };
}

const marketplaceHeightQuery = (network) => {
    const entity = 'squidStatus';
    const limit = 1;
    const query = `
        query {
            ${entity} {
                height
            }
        }
    `;
    const mapper = (result) => result[0].height;

    return { query, entity, limit, client: axiosClients [network].marketplace, mapper };
}

// Explorer queries

const transfersQuery = (fromBlock, network) => {
    const entity = 'transfers';
    const limit = 100;
    const query = `
        query {
            ${entity} (
                limit: ${limit},
                offset: {OFFSET}, 
                where: {
                    token: { id_eq: "${config [network].nftContractAddress}" }, 
                    AND: { blockHeight_gt: ${fromBlock} ,
                        AND: { fromEvmAddress_not_eq: "${config [network].marketplaceContractAddress}", 
                            AND: { toEvmAddress_not_eq: "${config [network].marketplaceContractAddress}" }
                        }
                    }
                }
            ) {
                nftId
                fromEvmAddress
                from { id }
                toEvmAddress
                to { id }
            }
        }
    `;
    const mapper = (transfers) => {
        return transfers.map(transfer => {
            return {
                nftId: Number(transfer.nftId),
                fromEvmAddress: transfer.fromEvmAddress,
                fromNativeAddress: transfer.from.id,
                toEvmAddress: transfer.toEvmAddress,
                toNativeAddress: transfer.to.id
            }
        });
    }

    return { query, entity, limit, client: clients [network].explorer, mapper };
}

const nftBalanceQuery = (owner, nftId, network) => {
    const entity = 'tokenHolderById';
    const limit = 1;
    const query = `
        query {
            ${entity} (
                id: "${config [network].nftContractAddress}-${owner}-${nftId}",
            ) {
                balance
            }
        }
    `;
    const mapper = (nftBalance) =>  nftBalance.length && nftBalance[0] ? Number(nftBalance[0].balance || 0) : 0;

    return { query, entity, limit, client: clients [network].explorer, mapper };
}

const explorerHeightQuery = (network) => {
    const entity = 'squidStatus';
    const limit = 1;
    const query = `
        query {
            ${entity} {
                height
            }
        }
    `;
    const mapper = (result) => result[0].height;

    return { query, entity, limit, client: clients [network].explorer, mapper };
}

// Helpers

const doQuery = async ({query, entity, limit, client, mapper}) => {
    let moreAvailable = false;
    let offset = 0;
    const data = [];

    do {
        const res = await client.query ({
            query: gql(query.replace('{OFFSET}', offset)),
        });
        let resData = Array.isArray(res.data[entity]) ? res.data[entity] : [res.data[entity]];
        data.push(...resData);
        moreAvailable = limit > 1 && resData.length === limit;
        offset += limit;
    } while (moreAvailable);

    return mapper ? mapper(data) : data;
}

//TODO: anukulpandey replace this with doQuery
const doQuery2 = async ({query, entity, limit, client, mapper}) => {
    let moreAvailable = false;
    let offset = 0;
    const data = [];

    do {
        const res = await client.post ("",{
            query: (query.replace('{OFFSET}', offset)),
        },{
            headers: { "Content-Type": "application/json" },
        });
        let resData = Array.isArray(res.data.data[entity]) ? res.data.data[entity] : [res.data.data[entity]];
        data.push(...resData);
        moreAvailable = limit > 1 && resData.length === limit;
        offset += limit;
    } while (moreAvailable);
    console.log(data)

    return mapper ? mapper(data) : data;
}

module.exports = {
    doQuery,
    salesQuery,
    hasAvailablePositionsQuery,
    marketplaceHeightQuery,
    transfersQuery,
    nftBalanceQuery,
    explorerHeightQuery,
    doQuery2
};
