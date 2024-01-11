const { createClient } = require('redis');
const getNetworkConfig = require("./getNetworkConfig");
const {defaultNetwork} = require("../constants");

const useCache = getNetworkConfig()?.useCache||false;
let client = null;
if(process.env.DEBUG){
    console.log('enableRedis=',useCache);
}
if(useCache){
(async () => {
    if(process.env.DEBUG){
        console.log('connect Redis=',process.env.REDIS_PORT,':',process.env.REDIS_HOST, ' pass:',process.env.REDIS_PASS.substring(0,8),'...');
    }
    client = createClient({
        socket: {
            port: process.env.REDIS_PORT,
            host: process.env.REDIS_HOST,
            reconnectStrategy: retries => Math.min(retries * 50, 500)
        },
        password: process.env.REDIS_PASS,
    });

    client.on('ready', () => console.log('Redis client connected'));
    client.on('error', (error) => { console.log('Redis error', error); });

    await client.connect();
})();
}

module.exports = client;
