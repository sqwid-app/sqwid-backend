require ( 'console-stamp' ) ( console );
console.log('Started Statswatch');
const Pusher = require ('pusher-js');
const { doQuery, transfersQuery, hasAvailablePositionsQuery, nftBalanceQuery, salesQuery, marketplaceHeightQuery, explorerHeightQuery } = require ('./gql');
const {config} = require('../../constants');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MarketItemSoldEvent = '0x245843c5d83f5834a63f6f98486094cecafdd601444424c083e66fd55f82c51d';

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

const sync = async (network) => {
    const explorerBlockHeight = await doQuery (explorerHeightQuery (network));
    await onNftContractEvent (explorerBlockHeight, network);

    const marketplaceBlockHeight = await doQuery (marketplaceHeightQuery (network));
    await onMarketItemSold (marketplaceBlockHeight, network);
}

const createSubscriptionClient = (network) => {
    console.log('Start Pusher', network);
    const pusher = new Pusher(process.env.PUSHER_KEY, {
        cluster: process.env.PUSHER_CLUSTER || "eu",
    });
    const channel = pusher.subscribe(process.env.PUSHER_CHANNEL);

    channel.bind(config [network].pusherEventExplorer, async (data) => {
        if (process.env.DEBUG) {
            console.log('event from pusher=',process.env.PUSHER_CHANNEL, ' data=',data);
        }
        if (data.updatedContracts.includes (config [network].marketplaceContractAddress) ||
            data.updatedContracts.includes (config [network].nftContractAddress)
        ) {
            await onNftContractEvent (data.blockHeight, network);
        }
    });

    channel.bind(config [network].pusherEventMarketplace, async (data) => {
        if (data.events.includes(MarketItemSoldEvent)) {
            await onMarketItemSold (data.blockHeight, network);
        }
    });
}

// Checks for new NFT transfers and updates claims accordingly
const onNftContractEvent = async (blockHeight, network,fire) => {
    if (blockHeight <= lastUpdatedBlock[network]) return;

    const transfers = await doQuery(transfersQuery (lastUpdatedBlock[network], network));
    if (!transfers.length) return;

    let index = 0;
    for (const transfer of transfers) {
        index++;
        if(process.env.DEBUG){
            console.log (`processing transfer ${index} of ${transfers.length} for block ${blockHeight} on ${network}`);
        }

        if (transfer.toEvmAddress !== ZERO_ADDRESS) {
            const toClaimSnapshot = await fire.collection ('claims')
                .where ('nftId', '==', transfer.nftId)
                .where ('owner', '==', transfer.toEvmAddress).get ();
            if (toClaimSnapshot.empty) {
                const hasAvailablePositions = await doQuery (hasAvailablePositionsQuery (transfer.toEvmAddress, transfer.nftId, network));
                const claim = {
                    nftId: transfer.nftId,
                    owner: transfer.toEvmAddress,
                    claimed: hasAvailablePositions,
                    amount: hasAvailablePositions ? 0 : await doQuery (nftBalanceQuery (transfer.toNativeAddress, transfer.nftId, network))
                };
                await fire.collection ('claims').add (claim);
            } else if (!toClaimSnapshot.docs [0].data ().claimed) {
                await toClaimSnapshot.docs [0].ref.update ({
                    amount: await doQuery (nftBalanceQuery (transfer.toNativeAddress, transfer.nftId, network))
                });
            }
        }

        if (transfer.fromEvmAddress !== ZERO_ADDRESS) {
            const fromClaimSnapshot = await fire.collection ('claims')
                .where ('nftId', '==', transfer.nftId)
                .where ('owner', '==', transfer.fromEvmAddress)
                .where ('claimed', '==', false).get ();
            if (!fromClaimSnapshot.empty) {
                const balance = await doQuery (nftBalanceQuery (transfer.fromNativeAddress, transfer.nftId, network));
                if (!balance) {
                    await fromClaimSnapshot.docs [0].ref.delete ();
                } else {
                    await fromClaimSnapshot.docs [0].ref.update ({
                        amount: balance
                    });
                }
            }
        }
    }

    await fire.collection ('statswatch-info').doc ('block').set ({ lastUpdated: blockHeight }, { merge: true });
    lastUpdatedBlock[network] = blockHeight;
}

// Updates collection stats for new marketplace sales data
const onMarketItemSold = async (blockHeight, network,fire) => {
    if (blockHeight <= lastUpdatedCollectionStats[network]) return;

    const sales = await doQuery (salesQuery (lastUpdatedCollectionStats[network], network));
    if (!sales.length) return;

    const collections = {};
    for (const sale of sales) {
        if (collections.hasOwnProperty (allowedItems [network] [Number (sale.itemId)])) {
            collections [allowedItems [network] [sale.itemId]].sales.push (sale);
        } else {
            collections [allowedItems [network] [sale.itemId]] = {
                sales: [sale]
            };
        }
    }

    await processCollectionStats (fire, network, collections);
    await fire.collection ('statswatch-info').doc ('collection-stats').set ({ lastUpdated: blockHeight }, { merge: true });
    lastUpdatedCollectionStats[network] = blockHeight;
}

const processCollectionStats = async (fire, network, collections) => {
    for (let collection in collections) {
        const col = await fire.collection ('collections').doc (collection).get ();
        if (col.exists) {
            let data = col.data ();
            let { sales } = collections [collection];
            let itemsSold = 0;
            let volume = 0;
            let itemSales = 0;
            if (data.stats) {
                if (process.env.DEBUG) {
                    console.log (`updating collection stats ${collection} on ${network}`);
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
                    items: allowedItems [network].filter (item => item === collection).length,
                    lastUpdated: sales [sales.length - 1].blockHeight
                }
            } else {
                if (process.env.DEBUG) {
                    console.log (`new collection stats ${collection} on ${network}`);
                }
                for (let i = 0; i < sales.length; i++) {
                    itemsSold += sales [i].amount;
                    volume += sales [i].price * sales [i].amount;
                }
                data.stats = {
                    itemsSold,
                    volume,
                    average: volume / itemsSold,
                    items: allowedItems [network].filter (item => item === collection).length,
                    lastUpdated: sales [sales.length - 1].blockHeight
                }
            }
            await fire.collection ('collections').doc (collection).set (data, { merge: true });
        }
    }
}


const doResetStats = async (network,fire) => {

    console.log (`resetting stats on ${network}...`);

    // Set last updated block to 0
    const collectionStatsSnapshot = await fire.collection ('statswatch-info').doc ('collection-stats').get ();
    if (collectionStatsSnapshot.exists) {
        await fire.collection ('statswatch-info').doc ('collection-stats').set ({ lastUpdated: 0 });
    }

    // Delete stats from every collection
    const collections = await fire.collection ('collections').get ();
    for (const collection of collections.docs) {
        await collection.ref.update ({ stats: null });
    }

    console.log (`stats reset on ${network}`);
}

const doResetClaims = async (network,fire) => {

    console.log (`resetting claims on ${network}...`);

    // Set last updated block to 0
    const collectionStatsSnapshot = await fire.collection ('statswatch-info').doc ('block').get ();
    if (collectionStatsSnapshot.exists) {
        await fire.collection ('statswatch-info').doc ('block').set ({ lastUpdated: 0 });
    }

    // Delete all claims
    const claims = await fire.collection ('claims').get ();
    for (const claim of claims.docs) {
        await claim.ref.delete ();
    }

    console.log (`claims reset on ${network}`);
}


const init = async (network, resetStats, resetClaims,fire) => {
    if (process.env.DEBUG) {
        console.log('init started for=', network, resetStats, resetClaims);
    }

    fire.collection ('blacklists').doc ('collectibles').onSnapshot (snapshot => {
        let data = snapshot.data ();
        if (!data.allowed) {
            allowedItems [network] = [];
        } else {
            for (let i = 0; i < data.allowed.length; i++) {
                allowedItems [network] [data.allowed [i].id] = data.allowed [i].collection;
            }
        }
    }, (error) => {
        console.log('init starting collectibles .onSnapshot ERR=',error);
    });

    // wait for allowedItems to be populated
    while (Object.keys (allowedItems [network]).length === 0) {
        await new Promise (resolve => setTimeout (resolve, 1000));
    }

    if (resetStats) await doResetStats (network);
    if (resetClaims) await doResetClaims (network);

    const collectionStatsSnapshot = await fire.collection ('statswatch-info').doc ('collection-stats').get ();
    if (collectionStatsSnapshot.exists) {
        lastUpdatedCollectionStats[network] = collectionStatsSnapshot.data ().lastUpdated || 0;
    } else {
        lastUpdatedCollectionStats[network] = 0;
        await fire.collection ('statswatch-info').doc ('collection-stats').set ({ lastUpdated: 0 });
    }

    const blockSnapshot = await fire.collection ('statswatch-info').doc ('block').get ();
    if (blockSnapshot.exists) {
        lastUpdatedBlock[network] = blockSnapshot.data ().lastUpdated || 0;
    } else {
        lastUpdatedBlock[network] = 0;
        await fire.collection ('statswatch-info').doc ('block').set ({ lastUpdated: 0 });
    }

    // Create claims collection if it doesn't exist
    const claimsSnapshot = await fire.collection ('claims').get ();
    if (claimsSnapshot.empty) {
        await fire.collection ('claims').add ({
            nftId: 0,
            owner: ZERO_ADDRESS,
            claimed: false,
            amount: 0
        });
    }

    await sync(network);

    createSubscriptionClient (network);
    if (process.env.DEBUG) {
        console.log('init complete for=', network);
    }
};

module.exports = {init};