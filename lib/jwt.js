const jwt = require ('jsonwebtoken');

const generateToken = (address) => {
    return jwt.sign ({ address }, process.env.JWT_SECRET, { expiresIn: '72h' });
};

module.exports = generateToken;