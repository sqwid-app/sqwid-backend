const jwt = require ('jsonwebtoken');

exports.verify = (req, res, next) => {
    const url = req.originalUrl;
    let isClaimable = url.indexOf('claim');
    if (isClaimable>-1) {
        console.log('GET USER', req.originalUrl);
    }
    const authHeader = req.headers ['authorization']
    const token = authHeader && authHeader.split (' ') [1]

    if (token == null) {

        if (isClaimable>-1) {
            console.log('GET USER NO TOKEN', req.originalUrl, 'authHeader', authHeader);
        }
        return res.sendStatus (401);
    }

    try {
        const user = jwt.verify (token, process.env.JWT_SECRET);
        req.user = user;
        if (isClaimable>-1) {
            console.log('GOT USER', req.originalUrl);
        }
        next ();
    } catch (err) {
        if (isClaimable>-1) {
            console.log('GOT USER ERR', req.originalUrl, err.message);
        }
        res.status (403).send ('Invalid token.');
    }
}
