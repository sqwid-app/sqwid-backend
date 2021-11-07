const { Provider } = require ("@reef-defi/evm-provider");
const { WsProvider } = require ("@polkadot/api");

const RPC_URL = process.env.RPC_URL;

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