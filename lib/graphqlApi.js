const { default: axios } = require('axios');
const getNetworkConfig = require('./getNetworkConfig');
const ethers = require('ethers');

const marketplaceAxiosClient = axios.create({
    baseURL: getNetworkConfig().graphql_api_marketplace,
});

const explorerAxiosClient = axios.create({
    baseURL: getNetworkConfig().graphql_api_explorer,
});


// Marketplace queries

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
                creator
            }
        }
    `;
    const mapper = (items) => {
        return items.length ? {
            tokenId: Number(items[0].tokenId),
            nftContract: items[0].nftContract,
            creator: items[0].creator,
        } : null;
    }

    return { query, entity, limit, client: marketplaceAxiosClient, mapper };
}

const itemByNftIdQuery = (nftId) => {
    const entity = 'items';
    const limit = 1;
    const query = `
        query {
            ${entity} (
                limit: ${limit}, 
                where: { nftContract_eq: "${getNetworkConfig().contracts.erc1155}", 
                    AND: { tokenId_eq: ${nftId} }
                }
            ) {
                id
                creator
            }
        }
    `;
    const mapper = (items) => {
        return items.length ? {
            id: Number(items[0].id),
            creator: items[0].creator,
        } : null;
    }


    return { query, entity, limit, client: marketplaceAxiosClient, mapper };
}

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

    return { query, entity, limit, client: marketplaceAxiosClient, mapper };
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
    const mapper = (sales) => sales.length ? Number((Number(sales[0].price) / 1e18).toFixed(2)) : 0;
    
    return { query, entity, limit, client: marketplaceAxiosClient, mapper };
}

const withdrawableQuery = (address) => {
    const entity = 'balanceById';
    const limit = 1;
    const query = `
        query {
            ${entity} (
                id: "${address}"
            ) {
                balance
            }
        }
    `;
    const mapper = (items) => items.length ? formatPrice(items[0].balance) : 0;
    
    return { query, entity, limit, client: marketplaceAxiosClient, mapper };
}

const bidsByBidder = (bidderAddress, offset, limit) => {
    const query = `
        query {
            bids (
                where: {
                    bidder_eq: "${bidderAddress}",
                },
                orderBy: timestamp_DESC,
                limit: ${limit},
                offset: ${offset},
            ) {
                value
                position {
                  id
                  amount
                  item {
                    id
                  }
                }
            }
            bidsConnection (
                where: {
                    bidder_eq: "${bidderAddress}",
                },
                orderBy: timestamp_DESC
            ) {
                totalCount
            }
        }
    `;

    const mapper = (data) => {
        return {
            totalCount: data.bidsConnection.totalCount,
            bids: data.bids.map(bid => {
                return {
                    positionId: Number(bid.position.id),
                    itemId: Number(bid.position.item.id),
                    amount: Number(bid.position.amount),
                    bidAmount: Number(bid.value) / 1e18,
                }
            }
        )};
    }

    return { query, entity: null, limit: 1, client: marketplaceAxiosClient, mapper };
}

const positionsByStateQuery = (state, ownerAddress, offset, limit, itemIds,creatorAddress) => {
    const entity = 'positions';
    const formattedItemIds = itemIds.map(itemId => `"${toIndexerId(itemId)}"`).join(', ');
    const query = `
        query {
            ${entity} (
                where: {
                    item: { id_in: [${formattedItemIds}] },
                    state_eq: ${numToState(state)},
                    ${ownerAddress && ownerAddress !== ethers.constants.AddressZero ? `owner_eq: "${ownerAddress}",` : ''}
                    amount_gt: 0,
                    ${creatorAddress && creatorAddress !== ethers.constants.AddressZero ? `AND: {item: {creator_eq: "${creatorAddress}"}},` : ''}
                },
                orderBy: id_DESC,
                limit: ${limit},
                offset: ${offset},
            ) {
                id
                item {
                    id
                    tokenId
                    creator  
                }
                owner
                marketFee
                amount
                price
                state
            }
        }
    `;
    const mapper = (positions) => {
        return positions.map(position => {
            return {
                positionId: Number(position.id),
                itemId: Number(position.item.id),
                itemCreator: position.item.creator,
                tokenId: Number(position.item.tokenId),
                owner: position.owner,
                marketFee: Number(position.marketFee),
                amount: Number(position.amount),
                price: Number(position.price),
                state: stateToNum(position.state)
            }
        });
    }

    return { query, entity, limit: 1, client: marketplaceAxiosClient, mapper };
}


const getCollectionAmountFromUser= (owner,id)=>{
    const entity = 'positions';
    const limit = 1;
    const client = marketplaceAxiosClient;
    const query = `
    query getCount {
        positions(where: {id_eq: "${id}", AND: {owner_eq: "${owner}"}}, limit: 1) {
          amount
        }
      }      
    `
    return {query,entity,limit,client}
}

// Explorer queries

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
                    },
                    balance_gt: 0,
                    evmAddress_not_eq: "${getNetworkConfig().contracts.marketplace}"
                }
            ) {
                totalCount
            }
        }
    `;
    const mapper = (tokenHolders) => {
        return tokenHolders[0].totalCount;
    }

    return { query, entity, limit, client: explorerAxiosClient, mapper };
}


const balanceQuery = (address) => {
    const entity = 'accountById';
    const limit = 1;
    const query = `
        query {
            ${entity} (
                id: "${address}"
            ) {
                freeBalance
            }
        }
    `;
    const mapper = (items) => items.length ? formatPrice(items[0].freeBalance) : 0;

    return { query, entity, limit, client: explorerAxiosClient, mapper };
}

const evmAddressQuery = (address) => {
    const entity = 'accountById';
    const limit = 1;
    const query = `
        query {
            ${entity} (
                id: "${address}"
            ) {
                evmAddress
            }
        }
    `;
    const mapper = (items) => items.length ? items[0].evmAddress : null;

    return { query, entity, limit, client: explorerAxiosClient, mapper };
}

// Helpers

const doQuery = async ({query, entity, limit, client, mapper}) => {
    let moreAvailable = false;
    let offset = 0;
    const data = [];

    do {
        const res = await client.post ("",{
            query: query.replace('{OFFSET}', offset),
        },{
            headers: { "Content-Type": "application/json" },
        });

        if (!entity) return mapper ? mapper(res.data.data) : res.data.data;

        let resData = Array.isArray(res.data.data[entity]) ? res.data.data[entity]
            : res.data.data[entity] ? [res.data.data[entity]] : [];
        data.push(...resData);
        offset += limit;
        moreAvailable = limit > 1 && resData.length === limit;
    } while (moreAvailable);
    return mapper ? mapper(data) : data;
}

const toIndexerId = (value) => value.toString().padStart(9, "0");

const formatPrice = (price) => Number((Number(price) / 1e18).toFixed(2));

const numToState = (num) => {
    switch (num) {
        case 0: return 'Available';
        case 1: return 'RegularSale';
        case 2: return 'Auction';
        case 3: return 'Raffle';
        case 4: return 'Loan';
        case 5: return 'Deleted';
        default: return 'Unknown';
    }
}

const stateToNum = (state) => {
    switch (state) {
        case 'Available': return 0;
        case 'RegularSale': return 1;
        case 'Auction': return 2;
        case 'Raffle': return 3;
        case 'Loan': return 4;
        case 'Deleted': return 5;
        default: return -1;
    }
}

module.exports = {
    doQuery,
    itemQuery,
    itemByNftIdQuery,
    salesQuery,
    lastSaleQuery,
    withdrawableQuery,
    bidsByBidder,
    positionsByStateQuery,
    tokenHoldersCountQuery,
    balanceQuery,
    evmAddressQuery,
    getCollectionAmountFromUser,
    toIndexerId
};
