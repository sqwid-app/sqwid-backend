require ('dotenv').config ();
const express = require ('express');
const morgan = require ('morgan');
const helmet = require ('helmet');
const app = express ();
const port = process.env.PORT || 8080;

const firebase = require ('./lib/firebase');

const cors = require ('cors');
// router.get('/', function(req, res) {
//     res.setHeader('Access-Control-Allow-Origin', '*');
//     res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
//     res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type'); // If needed
//     res.setHeader('Access-Control-Allow-Credentials', true); // If needed

//     res.send('cors problem fixed:)');
// });
app.use (morgan ('dev'));
app.use (helmet ());
app.use (cors ({origin: '*'}));
app.use (express.json ());
app.use (express.urlencoded ({extended: true}));

const getRoutes = require ('./routes/index');
app.use ('/', getRoutes ());

app.use(function (err, req, res, next) {
    console.error (err.stack)
    res.status (500).send ('Something broke!')
})

app.listen (port, () => {
    console.log (`Listening on port ${port}`);
});