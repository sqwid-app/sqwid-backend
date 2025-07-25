require('./polyfills');
require('dotenv').config({path:'./.env-sqwid-backend-testnet-dev'});
const constants = require('./constants');
const fs = require("fs");

if (!fs.existsSync(constants.TEMP_PATH)) {
	fs.mkdirSync(constants.TEMP_PATH);
}

const express = require ('express');
const morgan = require ('morgan');
const helmet = require ('helmet');
const rateLimit = require ('express-rate-limit')
const app = express ();
const port = process.env.PORT || 80;
const initStatsWatch = require('./lib/initStatswatch');
const { initAutomod } = require('./lib/automod');




const firebase = require ('./lib/firebase');
// const redisClient = require ('./lib/redis');

const initAdminConfig = async () => {
  try {
    const configRef = firebase.collection('config');
    const moderatorsDoc = configRef.doc('content_moderators');
    
    const moderatorAddresses = process.env.MODERATORS?.split(',').map(addr => addr.trim()) || [];
    
    await moderatorsDoc.set({
      addresses: moderatorAddresses
    }, { merge: true });
    
    console.log('Content moderators configuration updated successfully');
  } catch (error) {
    console.error('Error updating content moderators:', error);
  }
};

initStatsWatch();
initAutomod();
initAdminConfig();

/*const limiter = rateLimit ({
	windowMs: 1 * 60 * 1000, // 1 minute
	max: 60, // Limit each IP to 60 requests per `window`
	standardHeaders: true,
	legacyHeaders: false,
	statusCode: 429
})*/

app.set ('trust proxy', 2);
app.use (morgan ('dev'));
app.use (helmet ());
// if (process.env.ENABLE_CORS==='true') {
// 	const cors = require ('cors');
// 	app.use (cors ());
	
// }
app.use (express.json ({ limit: "100mb" }));
app.use (express.urlencoded ({extended: true, limit: "100mb"}));
app.use (express.raw ({ type: "application/octet-stream", limit: "50mb" }));
// app.use (limiter);

const getRoutes = require ('./routes/index');
const {TEMP_PATH} = require("./constants");

app.use ('/', getRoutes());

app.use(function (err, req, res, next) {
	console.log('app.use ERR=', err.stack);
	res.status(500).send('Something broke!');
});

const server = app.listen (port, () => {
    console.log (`Listening on port ${port}`);
});

// Ensure all inactive connections are terminated by the proxy, by setting this a few seconds higher than the proxy idle timeout
server.keepAliveTimeout = 77000;
// Ensure the headersTimeout is set higher than the keepAliveTimeout due to this nodejs regression bug: https://github.com/nodejs/node/issues/27363
server.headersTimeout = 78000;
