const {reefState, network} = require("@reef-chain/util-lib");
const {defaultNetwork, TESTNET} = require("../constants");
const {firstValueFrom, skipWhile, map} = require("rxjs");


let provider;
const setup = async () => {

    if (!provider) {

        let net = defaultNetwork === TESTNET ? network.AVAILABLE_NETWORKS['testnet'] : network.AVAILABLE_NETWORKS['mainnet'];
        reefState.initReefState({
            network: net
        });
        provider = await firstValueFrom(reefState.selectedProvider$.pipe(
            map(v=>console.log('PPPPP=',v)),
            skipWhile(v => !v)));
    }
    return {
        provider,
    };
};

exports.getWallet = setup;
