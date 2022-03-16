const jwt = require ('jsonwebtoken');

const generateToken = (address, evmAddress) => {
    return jwt.sign ({ address, evmAddress }, process.env.JWT_SECRET, { expiresIn: '72h' });
};

module.exports = generateToken;