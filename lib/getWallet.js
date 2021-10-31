const {
    TestAccountSigningKey,
    Provider,
    Signer,
} = require ("@reef-defi/evm-provider");
const { WsProvider, Keyring } = require ("@polkadot/api");

const RPC_URL = process.env.RPC_URL;
const seed = process.env.SEED;

const setup = async () => {
    const provider = new Provider ({
        provider: new WsProvider (RPC_URL),
    });

    await provider.api.isReady;
    
    const keyring = new Keyring ({ type: "sr25519" });
    let pair = keyring.addFromUri (seed);

    const signingKey = new TestAccountSigningKey (provider.api.registry);
    signingKey.addKeyringPair (pair);

    const signer = new Signer (provider, pair.address, signingKey);

    return {
        signer,
        provider,
    };
};

exports.getWallet = setup;