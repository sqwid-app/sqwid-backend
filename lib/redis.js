const { createClient } = require ('redis');
const getNetwork = require("./getNetwork");
const useCache = getNetwork ().useCache;
let client = null;
if(useCache){
(async () => {
    console.log('connect Redis=',process.env.REDIS_PORT,':',process.env.REDIS_HOST, ' pass:',process.env.REDIS_PASS.substring(0,8),'...');
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
}

module.exports = client;
