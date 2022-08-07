const sanitize = (str) => {
    return str.replace (/[^a-zA-Z0-9@_\-\/\.&:\s]/g, '');
}

const allowedSocials = [
    'instagram',
    'twitter',
    'tiktok',
    'website',
    'github'
]

exports.sanitize = (req, res, next) => {
    const { body } = req;
    const sanitizedBody = {};
    Object.keys (body).forEach (key => {
        sanitizedBody [key] = sanitize (body [key]);
    } );
    req.body = sanitizedBody;
    next ();
}

exports.checkAllowed = (req, res, next) => {
    const { body } = req;
    const allowed = Object.keys (body).every (key => {
        return allowedSocials.includes (key);
    });
    if (allowed) {
        next ();
    } else {
        res.status (400).json ({
            error: 'Invalid social'
        });
    }
}

exports.checkSize = (req, res, next) => {
    const { body } = req;
    const size = Object.keys (body).every (key => {
        if (key === 'bio') {
            return body [key].length <= 500;
        } else if (key === 'displayName') {
            return body [key].length <= 32;
        } else return body [key].length <= 100;
    } );
    if (size) {
        next ();
    } else {
        res.status (400).json ({
            error: 'Invalid size'
        });
    }
}