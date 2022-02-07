require ('dotenv').config ();
const express = require ('express');
const morgan = require ('morgan');
const helmet = require ('helmet');
const rateLimit = require ('express-rate-limit')
const app = express ();
const port = process.env.PORT || 8080;

const firebase = require ('./lib/firebase');

const limiter = rateLimit ({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
})

const cors = require ('cors');
// router.get('/', function(req, res) {
//     res.setHeader('Access-Control-Allow-Origin', '*');
//     res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
//     res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type'); // If needed
//     res.setHeader('Access-Control-Allow-Credentials', true); // If needed

//     res.send('cors problem fixed:)');
// });

app.set ('trust proxy', 1);
app.get ('/ip', (request, response) => response.send(request.ip))
app.use (morgan ('dev'));
app.use (helmet ());
app.use (cors ({origin: '*'}));
app.use (express.json ({ limit: "50mb" }));
app.use (express.urlencoded ({extended: true, limit: "50mb"}));
// app.use (express.bodyParser ({limit: '50mb'}));
app.use (limiter)

const getRoutes = require ('./routes/index');
app.use ('/', getRoutes ());

app.use(function (err, req, res, next) {
    console.error (err.stack)
    res.status (500).send ('Something broke!')
})

app.listen (port, () => {
    console.log (`Listening on port ${port}`);
});