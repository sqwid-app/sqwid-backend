const { createClient } = require ('redis');
const retryStrategy = require ("node-redis-retry-strategy");
let client = null;
(async () => {
    client = createClient ({
        socket: {
            port: process.env.REDIS_PORT,
            host: process.env.REDIS_HOST,
            reconnectStrategy: retries => Math.min (retries * 50, 500)
        },
        password: process.env.REDIS_PASS,
    });

    client.on ('ready', () => console.log ('Redis client connected'));
    client.on ('error', (error) => { console.log ('Redis error', error); });

    await client.connect ();
}) ();

module.exports = client;