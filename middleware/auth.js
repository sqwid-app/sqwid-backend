const jwt = require ('jsonwebtoken');

exports.verify = (req, res, next) => {
    const authHeader = req.headers ['authorization']
    const token = authHeader && authHeader.split (' ') [1]

    if (token == null) return res.sendStatus (401);

    try {
        const user = jwt.verify (token, process.env.JWT_SECRET);
        req.user = user;
        next ();
    } catch (err) {
        res.status (403).send ('Invalid token.');
    }
}
