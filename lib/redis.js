const { createClient } = require ('redis');
let client = null;
(async () => {
    client = createClient ({
        socket: {
            port: process.env.REDIS_PORT,
            host: process.env.REDIS_HOST
        },
        password: process.env.REDIS_PASS
    });

    client.on ('error', (error) => { console.log ('Redis error', error); });

    await client.connect ();
}) ();

module.exports = client;