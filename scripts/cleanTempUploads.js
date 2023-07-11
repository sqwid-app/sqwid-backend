const fs = require("fs");
const { TEMP_PATH } = require("../constants");

const INTERVAL = 1000 * 60 * 30; // 30 minutes

const cleanTempUploads = () => {
    const files = fs.readdirSync(TEMP_PATH);
    for (const file of files) {
        if (fs.statSync(TEMP_PATH + file).mtime < Date.now() - INTERVAL) {
            fs.rmSync(`${TEMP_PATH}/${file}`, {recursive: true});
        }
    }
};

module.exports = cleanTempUploads;