const { Router } = require ('express');
const jwt = require ('jsonwebtoken');

const verify = (req, res) => {
    const authHeader = req.headers ['authorization']
    const token = authHeader && authHeader.split (' ') [1]

    if (token == null) return res.sendStatus (401);

    try {
        jwt.verify (token, process.env.JWT_SECRET);
        res.status (200).json ({
            valid: true
        });
    } catch (err) {
        res.status (403).json ({
            valid: false
        });
    }
}

module.exports = () => {
    const router = Router ();

    router.get ('/', verify);

    return router;
}