const { Provider } = require ("@reef-defi/evm-provider");
const { WsProvider } = require ("@polkadot/api");
const getNetwork = require ('./getNetwork');

const RPC_URL = getNetwork ().rpc;

const provider = new Provider ({
    provider: new WsProvider (RPC_URL),
});

const setup = async () => {
    await provider.api.isReady;

    return {
        provider,
    };
};

exports.getWallet = setup;