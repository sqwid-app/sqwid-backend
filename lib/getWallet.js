const {Provider} = require( "@reef-chain/evm-provider");
const { WsProvider } = require( "@polkadot/api");

const {reefState, network} = require("@reef-chain/util-lib");
const {defaultNetwork, TESTNET} = require("../constants");
const {firstValueFrom, skipWhile, map} = require("rxjs");

async function initProvider(
    providerUrl,
    providerConnStateSubj
) {
    console.log('sqw iPROV=',providerUrl);
    const newProvider = new Provider({
        provider: new WsProvider(providerUrl),
        types: {
            AccountInfo: "AccountInfoWithTripleRefCount",
        },
    });
    try {
        newProvider.api.on("connected", v =>
            providerConnStateSubj?.next({
                isConnected: true,
                status: {
                    value: "connected",
                    timestamp: new Date().getTime(),
                    data: v,
                },
            })
        );
        newProvider.api.on("error", v =>
            providerConnStateSubj?.next({
                isConnected: false,
                status: { value: "error", timestamp: new Date().getTime(), data: v },
            })
        );
        newProvider.api.on("disconnected", v =>
            providerConnStateSubj?.next({
                isConnected: false,
                status: {
                    value: "disconnected",
                    timestamp: new Date().getTime(),
                    data: v,
                },
            })
        );
        newProvider.api.on("ready", v =>
            providerConnStateSubj?.next({
                isConnected: true,
                status: {
                    value: "connected",
                    timestamp: new Date().getTime(),
                    data: v,
                },
            })
        );
        await newProvider.api.isReadyOrError;
    } catch (e) {
        console.log("Provider isReadyOrError ERROR=", e);
        throw e;
    }
    providerConnStateSubj.subscribe(v=>{
        console.log('providerStatus=',v);
    })
    return newProvider;
}

let provider;
const setup = async () => {

    if (!provider) {

        let net = defaultNetwork === TESTNET ? network.AVAILABLE_NETWORKS['testnet'] : network.AVAILABLE_NETWORKS['mainnet'];
        net.options = { initProvider };
        reefState.initReefState({
            network: net
        });
        provider = await firstValueFrom(reefState.selectedProvider$.pipe(
            skipWhile(v => !v)));
    }
    return {
        provider,
    };
};



exports.getWallet = setup;
