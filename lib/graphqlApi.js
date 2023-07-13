const { ApolloClient, InMemoryCache, gql, createHttpLink } = require('@apollo/client/core');
const fetch = require('cross-fetch');
const getNetwork = require('./getNetwork');

const marketplaceApolloClient = new ApolloClient({
    link: createHttpLink({ 
        uri: getNetwork().graphql_api_marketplace,
        fetch
    }),
    cache: new InMemoryCache(),
});

const explorerApolloClient = new ApolloClient({
    link: createHttpLink({ 
        uri: getNetwork().graphql_api_explorer,
        fetch
    }),
    cache: new InMemoryCache(),
});

const salesQuery = (itemId) => {
    const entity = 'sales';
    const limit = 300;
    const query = `
        query {
            ${entity} (
                where: {
                    item: { id_eq: "${toIndexerId(itemId)}" }
                },
                limit: ${limit},
    	        offset: {OFFSET},
            ) {
                amount
                price
                timestamp
            }
        }
    `;
    const mapper = (sales) => {
        return sales.map(sale => {
            return {
                amount: sale.amount,
                price: Number((Number(sale.price) / 1e18).toFixed(2)),
                timestamp: Math.floor(Number(sale.timestamp) / 1000)
            }
        });
    }

    return { query, entity, limit, client: marketplaceApolloClient, mapper };
}

const lastSaleQuery = (itemId) => {
    const entity = 'sales';
    const limit = 1;
    const query = `
        query {
            ${entity} (
                where: {
                    item: { id_eq: "${toIndexerId(itemId)}" }
                },
                orderBy: id_DESC,
                limit: ${limit},
                offset: {OFFSET},
            ) {
                price
            }
        }
    `;
    const mapper = (sales) => {
        return Number((Number(sales[0].price) / 1e18).toFixed(2));
    }

    return { query, entity, limit, client: marketplaceApolloClient, mapper };
}
  
const itemQuery = (itemId) => {
    const entity = 'itemById';
    const limit = 1;
    const query = `
        query {
            ${entity} (
                id: "${toIndexerId(itemId)}"
            ) {
                tokenId
                nftContract
            }
        }
    `;
    const mapper = (items) => {
        return {
            tokenId: Number(items[0].tokenId),
            nftContract: items[0].nftContract
        }
    }

    return { query, entity, limit, client: marketplaceApolloClient, mapper };
}

const tokenHoldersCountQuery = (nftId, nftContract) => {
    const entity = 'tokenHoldersConnection';
    const limit = 1;
    const query = `
        query {
            ${entity} (
                orderBy: id_ASC, 
                where: {
                    nftId_eq: "${toIndexerId(nftId)}", 
                    token: {
                        id_eq: "${nftContract}"
                    }
                }
            ) {
                totalCount
            }
        }
    `;
    const mapper = (tokenHolders) => {
        return tokenHolders[0].totalCount;
    }

    return { query, entity, limit, client: explorerApolloClient, mapper };
}

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
    } while (moreAvailable);

    return mapper ? mapper(data) : data;
}

const toIndexerId = (value) => value.toString().padStart(9, "0");

module.exports = { 
    doQuery,
    salesQuery,
    lastSaleQuery,
    itemQuery,
    tokenHoldersCountQuery 
};