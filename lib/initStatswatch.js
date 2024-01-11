const { defaultNetwork, MAINNET} = require("../constants");

const { init } = require("./statswatch/index");
const fire = require('./firebase');

const initStatsWatch = ()=>{
    const isMainnet = defaultNetwork===MAINNET;
    if(isMainnet){
        init ('mainnet', process.env.RESET_STATS === 'true', process.env.RESET_CLAIMS === 'true',fire);
    }else{
        init ('testnet', process.env.RESET_STATS === 'true', process.env.RESET_CLAIMS === 'true',fire);
    }
}

module.exports = initStatsWatch;
