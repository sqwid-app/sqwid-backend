require ('dotenv').config ();
const express = require ('express');
const morgan = require ('morgan');
const helmet = require ('helmet');
const app = express ();
const port = process.env.PORT || 8080;

const firebase = require ('./lib/firebase');

const getRoutes = require ('./routes/index');

const cors = require ('cors');

app.use (morgan ('dev'));
app.use (helmet ());
app.use (cors ());
app.use (express.json ());
app.use (express.urlencoded ({extended: true}));

app.use ('/', getRoutes ());

app.use(function (err, req, res, next) {
    console.error (err.stack)
    res.status (500).send ('Something broke!')
})

app.listen (port, () => {
    console.log (`Listening on port ${port}`);
});