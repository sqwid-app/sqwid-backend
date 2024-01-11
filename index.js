require('./polyfills');
require('dotenv').config({path:'./.env-sqwid-backend-testnet'});
const express = require ('express');
const morgan = require ('morgan');
const helmet = require ('helmet');
const rateLimit = require ('express-rate-limit')
const app = express ();
const port = process.env.PORT || 8080;
const initStatsWatch = require('./lib/initStatswatch');
const { initAutomod } = require('./lib/automod');


const firebase = require ('./lib/firebase');
const redisClient = require ('./lib/redis');

initStatsWatch();
initAutomod();

const limiter = rateLimit ({
	windowMs: 1 * 60 * 1000, // 1 minute
	max: 60, // Limit each IP to 60 requests per `window`
	standardHeaders: true,
	legacyHeaders: false,
})

const cors = require ('cors');

app.set ('trust proxy', 2);
app.use (morgan ('dev'));
app.use (helmet ());
app.use (cors ({origin: '*'}));
app.use (express.json ({ limit: "100mb" }));
app.use (express.urlencoded ({extended: true, limit: "100mb"}));
app.use (express.raw ({ type: "application/octet-stream", limit: "50mb" }));
app.use (limiter);

const getRoutes = require ('./routes/index');

app.use ('/', getRoutes());

// app.get ('/ip', (request, response) => response.send(request.ip))

app.use(function (err, req, res, next) {
    console.error (err.stack)
    res.status (500).send ('Something broke!')
})

app.listen (port, () => {
    console.log (`Listening on port ${port}`);
});
