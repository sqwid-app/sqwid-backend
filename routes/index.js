const { Router } = require ('express');

const getAuthRoutes = require ('./auth');
const getNonceRoutes = require ('./nonce');
const getCreateCollectibleRoutes = require ('./create/collectible');
const getCreateCollectionRoutes = require ('./create/collection');
const getCollectionsRoutes = require ('./get/collections').router;
// const getCollectiblesRoutes = require ('./get/collectibles');
// const getCollectibleRoutes = require ('./get/collectible');
const getUserRoutes = require ('./get/user').router;
const getEditUserRoutes = require ('./edit/user');
const getUpdateFeaturedRoutes = require ('./edit/featured');
// const getVerifyJWTRoutes = require ('./verifyjwt');
// const getEditEVMAddressRoutes = require ('./edit/evmAddress');
// const getSyncCollectiblesRoutes = require ('./sync/collectibles');
const getMarketplaceRoutes = require ('./get/marketplace').router;
const getStatswatchRoutes = require ('./get/statswatch');
// const getMarketplaceOldRoutes = require ('./get/r/marketplace_old').router;
const getHeartsRoutes = require ('./interact/heart').router;
const rateLimit = require ('express-rate-limit');

const createLimiter = rateLimit ({
	windowMs: 1 * 60 * 1000, // 1 minute
	max: 6, // limit each IP to 6 requests per windowMs
	standardHeaders: true,
	legacyHeaders: false,
});

const editLimiter = rateLimit ({
    windowMs: 5 * 60 * 1000, // 5 minute
    max: 20, // limit each IP to 20 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = () => {
    const router = Router ();

    router.use ('/auth', createLimiter, getAuthRoutes ());
    router.use ('/nonce', createLimiter, getNonceRoutes ());
    router.use ('/create/collectible', createLimiter, getCreateCollectibleRoutes ());
    router.use ('/create/collection', createLimiter, getCreateCollectionRoutes ());
    router.use ('/get/collections', getCollectionsRoutes ());
    router.use ('/get/marketplace', getMarketplaceRoutes ());
    router.use ('/get/user', getUserRoutes ());
    router.use ('/edit/user', editLimiter, getEditUserRoutes ());
    router.use ('/edit/featured', editLimiter, getUpdateFeaturedRoutes ());
    router.use ('/statswatch', getStatswatchRoutes ());
    router.use ('/heart', getHeartsRoutes ());

    router.get ('/', (req, res) => {
        res.send ('Sqwid API');
    });

    return router;
}