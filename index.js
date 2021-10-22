const express = require ('express');
const app = express ();
const port = process.env.PORT || 3000;

app.use (express.json ());
app.use (express.urlencoded ({extended: true}));


app.get ('/', (req, res) => {
    res.send (JSON.stringify ({
        message: 'Hello World!'
    }));
});

app.listen (port, () => {
    console.log ('Listening on port 3000');
});