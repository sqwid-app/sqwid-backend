require('console-stamp')(console);
console.log('Started Statswatch');
const {
    doQuery,
    transfersQuery,
    hasAvailablePositionsQuery,
    nftBalanceQuery,
    salesQuery,
    marketplaceHeightQuery,
    explorerHeightQuery,
} = require('./gql');
const {config} = require('../../constants');
const firebase = require('../firebase');
const {reefState, network} = require('@reef-chain/util-lib');
const {getWallet} = require("../getWallet");

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MarketItemSoldEvent = '0x245843c5d83f5834a63f6f98486094cecafdd601444424c083e66fd55f82c51d';
const collectionName = "events-emitted";

let allowedItems = {
    mainnet: [],
    testnet: []
};

let lastUpdatedBlock = {
    mainnet: 0,
    testnet: 0
}

let lastUpdatedCollectionStats = {
    mainnet: 0,
    testnet: 0
}

const sync = async (_network, fire) => {
    await doResetClaimSyncErrors(_network, fire);
    const explorerBlockHeight = await doQuery(explorerHeightQuery(_network));
    await onNftContractEvent(explorerBlockHeight, _network, fire);

    const marketplaceBlockHeight = await doQuery(marketplaceHeightQuery(_network));
    await onMarketItemSold(marketplaceBlockHeight, _network, fire);
}

const createSubscriptionClient = async (_network, fire) => {
    try {
        network.getLatestBlockContractEvents$([config[_network].marketplaceContractAddress, config[_network].nftContractAddress]).subscribe(async data => {
            if (process.env.DEBUG) {
                console.log('NFT contract event=', data);
            }
            if (data && data.blockHeight) {
                await onNftContractEvent(data.blockHeight, _network, fire);
            }
        });
    } catch (error) {
        console.log("Error in setting nw in reefState", error)
    }
    firebase.collection(collectionName).onSnapshot((querySnapshot) => {
        querySnapshot.forEach(async (doc) => {
            if (doc.data().events && doc.data().events.includes(MarketItemSoldEvent)) {
                await onMarketItemSold(doc.id, _network, fire);
            }
        });
    }, (error) => {
        console.error("Error listening for documents:", error);
    });

}

// Checks for new NFT transfers and updates claims accordingly
const onNftContractEvent = async (blockHeight, _network, fire) => {
    if (blockHeight <= lastUpdatedBlock[_network]) return;

    const transfers = await doQuery(transfersQuery(lastUpdatedBlock[_network], _network));
    if (!transfers.length) return;

    let index = 0;
    for (const transfer of transfers) {
        index++;
        if (process.env.DEBUG) {
            console.log(`processing transfer ${index} of ${transfers.length} for block ${blockHeight} on ${_network}`);
        }

        try {
            if (transfer.toEvmAddress !== ZERO_ADDRESS) {
                const toClaimSnapshot = await fire.collection('claims')
                    .where('nftId', '==', transfer.nftId)
                    .where('owner', '==', transfer.toEvmAddress).get();
                if (toClaimSnapshot.empty) {
                    const hasAvailablePositions = await doQuery(hasAvailablePositionsQuery(transfer.toEvmAddress, transfer.nftId, _network));
                    const claim = {
                        nftId: transfer.nftId,
                        owner: transfer.toEvmAddress,
                        claimed: hasAvailablePositions,
                        amount: hasAvailablePositions ? 0 : await doQuery(nftBalanceQuery(transfer.toNativeAddress, transfer.nftId, _network))
                    };
                    await fire.collection('claims').add(claim);
                } else if (!toClaimSnapshot.docs [0].data().claimed) {
                    await toClaimSnapshot.docs [0].ref.update({
                        amount: await doQuery(nftBalanceQuery(transfer.toNativeAddress, transfer.nftId, _network))
                    });
                }
            }

            if (transfer.fromEvmAddress !== ZERO_ADDRESS) {
                const fromClaimSnapshot = await fire.collection('claims')
                    .where('nftId', '==', transfer.nftId)
                    .where('owner', '==', transfer.fromEvmAddress)
                    .where('claimed', '==', false).get();
                if (!fromClaimSnapshot.empty) {
                    const balance = await doQuery(nftBalanceQuery(transfer.fromNativeAddress, transfer.nftId, _network));
                    if (!balance) {
                        await fromClaimSnapshot.docs [0].ref.delete();
                    } else {
                        await fromClaimSnapshot.docs [0].ref.update({
                            amount: balance
                        });
                    }
                }
            }
        } catch (error) {
            let err;
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                console.log('ERROR TRANSFER SYNC RES data=', error.response.data);
                console.log('ERROR TRANSFER SYNC RES status=', error.response.status);
                console.log('ERROR TRANSFER SYNC RES headers=', error.response.headers);
                err = error.response.data;
            } else if (error.request) {
                // The request was made but no response was received
                // `error.request` is an instance of XMLHttpRequest in the browser
                // and an instance of http.ClientRequest in node.js
                console.log('ERROR TRANSFER SYNC REQ=', error.request);
            } else {
                // Something happened in setting up the request that triggered an Error
                console.log('ERROR TRANSFER SYNC=', error.message);
                err = error.message;
            }
            console.log('ERROR TRANSFER ID=', transfer.id);
            await fire.collection('error-transfers-sync').add({transferId: transfer.id, err});
        }
    }

    await fire.collection('statswatch-info').doc('block').set({lastUpdated: blockHeight}, {merge: true});
    lastUpdatedBlock[_network] = blockHeight;
}

// Updates collection stats for new marketplace sales data
const onMarketItemSold = async (blockHeight, _network, fire) => {
    if (blockHeight <= lastUpdatedCollectionStats[_network]) return;

    const sales = await doQuery(salesQuery(lastUpdatedCollectionStats[_network], _network));
    if (!sales.length) return;

    const collections = {};
    for (const sale of sales) {
        if (collections.hasOwnProperty(allowedItems [_network] [Number(sale.itemId)])) {
            collections [allowedItems [_network] [sale.itemId]].sales.push(sale);
        } else {
            collections [allowedItems [_network] [sale.itemId]] = {
                sales: [sale]
            };
        }
    }

    await processCollectionStats(fire, _network, collections);
    await fire.collection('statswatch-info').doc('collection-stats').set({lastUpdated: blockHeight}, {merge: true});
    lastUpdatedCollectionStats[_network] = blockHeight;
}

const processCollectionStats = async (fire, _network, collections) => {
    for (let collection in collections) {
        const col = await fire.collection('collections').doc(collection).get();
        if (col.exists) {
            let data = col.data();
            let {sales} = collections [collection];
            let itemsSold = 0;
            let volume = 0;
            let itemSales = 0;
            if (data.stats) {
                if (process.env.DEBUG) {
                    console.log(`updating collection stats ${collection} on ${_network}`);
                }
                let lastUpdate = data.stats.lastUpdated;
                for (let i = 0; i < sales.length; i++) {
                    if (sales [i].blockHeight > lastUpdate) {
                        itemsSold += sales [i].amount;
                        volume += sales [i].price * sales [i].amount;
                        itemSales += 1;
                    }
                }
                data.stats = {
                    itemsSold: data.stats.itemsSold + itemsSold,
                    volume: data.stats.volume + volume,
                    average: (data.stats.volume + volume) / (data.stats.itemsSold + itemsSold),
                    items: allowedItems [_network].filter(item => item === collection).length,
                    lastUpdated: sales [sales.length - 1].blockHeight
                }
            } else {
                if (process.env.DEBUG) {
                    console.log(`new collection stats ${collection} on ${_network}`);
                }
                for (let i = 0; i < sales.length; i++) {
                    itemsSold += sales [i].amount;
                    volume += sales [i].price * sales [i].amount;
                }
                data.stats = {
                    itemsSold,
                    volume,
                    average: volume / itemsSold,
                    items: allowedItems [_network].filter(item => item === collection).length,
                    lastUpdated: sales [sales.length - 1].blockHeight
                }
            }
            await fire.collection('collections').doc(collection).set(data, {merge: true});
        }
    }
}


const doResetStats = async (_network, fire) => {

    console.log(`resetting stats on ${_network}...`);

    // Set last updated block to 0
    const collectionStatsSnapshot = await fire.collection('statswatch-info').doc('collection-stats').get();
    if (collectionStatsSnapshot.exists) {
        await fire.collection('statswatch-info').doc('collection-stats').set({lastUpdated: 0});
    }

    // Delete stats from every collection
    const collections = await fire.collection('collections').get();
    for (const collection of collections.docs) {
        await collection.ref.update({stats: null});
    }

    console.log(`stats reset on ${_network}`);
}

const doResetClaims = async (_network, fire) => {

    console.log(`resetting claims on ${_network}...`);

    // Set last updated block to 0
    const collectionStatsSnapshot = await fire.collection('statswatch-info').doc('block').get();
    if (collectionStatsSnapshot.exists) {
        await fire.collection('statswatch-info').doc('block').set({lastUpdated: 0});
    }

    // Delete all claims
    const claims = await fire.collection('claims').get();
    for (const claim of claims.docs) {
        await claim.ref.delete();
    }

    console.log(`claims reset on ${_network}`);
}

const doResetClaimSyncErrors = async (_network, fire) => {

    console.log(`resetting claim sync errors on ${_network}...`);

    // Delete all errors
    const errors = await fire.collection('error-transfers-sync').get();
    for (const err of errors.docs) {
        await err.ref.delete();
    }

    console.log(` claim sync errors reset on ${_network}`);
}


const init = async (_network, resetStats, resetClaims, fire) => {
    if (process.env.DEBUG) {
        console.log('init started for=', _network, resetStats, resetClaims);
    }

    fire.collection('blacklists').doc('collectibles').onSnapshot(snapshot => {
        let data = snapshot.data();
        if (!data.allowed) {
            allowedItems [_network] = [];
        } else {
            for (let i = 0; i < data.allowed.length; i++) {
                allowedItems [_network] [data.allowed [i].id] = data.allowed [i].collection;
            }
        }
    }, (error) => {
        console.log('init starting collectibles .onSnapshot ERR=', error);
    });

    // wait for allowedItems to be populated
    while (Object.keys(allowedItems [_network]).length === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (resetStats) await doResetStats(_network, fire);
    if (resetClaims) await doResetClaims(_network, fire);

    const collectionStatsSnapshot = await fire.collection('statswatch-info').doc('collection-stats').get();
    if (collectionStatsSnapshot.exists) {
        lastUpdatedCollectionStats[_network] = collectionStatsSnapshot.data().lastUpdated || 0;
    } else {
        lastUpdatedCollectionStats[_network] = 0;
        await fire.collection('statswatch-info').doc('collection-stats').set({lastUpdated: 0});
    }

    const blockSnapshot = await fire.collection('statswatch-info').doc('block').get();
    if (blockSnapshot.exists) {
        lastUpdatedBlock[_network] = blockSnapshot.data().lastUpdated || 0;
    } else {
        lastUpdatedBlock[_network] = 0;
        await fire.collection('statswatch-info').doc('block').set({lastUpdated: 0});
    }

    // Create claims collection if it doesn't exist
    const claimsSnapshot = await fire.collection('claims').get();
    if (claimsSnapshot.empty) {
        await fire.collection('claims').add({
            nftId: 0,
            owner: ZERO_ADDRESS,
            claimed: false,
            amount: 0
        });
    }

    await sync(_network, fire);

    createSubscriptionClient(_network, fire);
    if (process.env.DEBUG) {
        console.log('init complete for=', _network);
    }
};

module.exports = {init};
