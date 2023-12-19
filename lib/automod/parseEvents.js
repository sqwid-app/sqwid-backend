const ethers = require ('ethers');

const parseLogData = (json, abi) => {
    const { topics, data } = json;
    try {
        const interface = new ethers.utils.Interface (abi);
        return interface.parseLog ({ topics, data });
    } catch (e) {
        return null;
    }
}


module.exports = {
    parseLogData
}