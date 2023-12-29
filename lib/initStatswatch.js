const { defaultNetwork } = require("../constants");

const { init } = require("./statswatch/index");
const fire = require('./firebase');

const initStatsWatch = ()=>{
    const isMainnet = defaultNetwork==='reef_mainnet';
    if(isMainnet){
        init ('mainnet', process.env.RESET_STATS_MAINNET === 'true', process.env.RESET_CLAIMS_MAINNET === 'true',fire);
    }else{
        init ('testnet', process.env.RESET_STATS_TESTNET === 'true', process.env.RESET_CLAIMS_TESTNET === 'true',fire);
    }
}

module.exports = initStatsWatch;