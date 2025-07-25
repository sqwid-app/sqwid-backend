const { Router } = require ('express');

const getAuthRoutes = require ('./auth');
const getNonceRoutes = require ('./nonce');
const getCreateBulkRoutes = require ('./create/bulk');
const getCreateCollectibleRoutes = require ('./create/collectible');
const getCreateCollectionRoutes = require ('./create/collection');
const getEditClaimTransferRoutes = require ('./edit/claimTransfer').router;
const getEditCollectibleRoutes = require ('./edit/collectible');
const getEditCollectionRoutes = require ('./edit/collection');
const getUpdateFeaturedRoutes = require ('./edit/featured');
const getEditUserRoutes = require ('./edit/user');
const getEditModeratorsRoutes = require ('./edit/moderators');
const getCollectionsRoutes = require ('./get/collections').router;
const getMarketplaceRoutes = require ('./get/marketplace').router;
const getModeratorsRoutes = require ('./get/moderators').router;
const searchRoutes = require ('./get/search').router;
const getStatswatchRoutes = require ('./get/statswatch');
const getUserRoutes = require ('./get/user').router;
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

const createBulkLimiter = rateLimit ({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 52, // limit each IP to 52 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = () => {
    const router = Router ();

    router.use ('/auth', createLimiter, getAuthRoutes ());
    router.use ('/nonce', createLimiter, getNonceRoutes ());
    router.use ('/create/collectible', createLimiter, getCreateCollectibleRoutes ());
    router.use ('/create/bulk', createBulkLimiter, getCreateBulkRoutes ());
    router.use ('/create/collection', createLimiter, getCreateCollectionRoutes ());
    router.use ('/get/collections', getCollectionsRoutes ());
    router.use ('/get/marketplace', getMarketplaceRoutes ());
    router.use ('/get/moderators', getModeratorsRoutes ());
    router.use ('/get/user', getUserRoutes ());
    router.use ('/edit/user', editLimiter, getEditUserRoutes ());
    router.use ('/edit/moderators', editLimiter, getEditModeratorsRoutes ());
    router.use ('/edit/featured', editLimiter, getUpdateFeaturedRoutes ());
    router.use ('/edit/collectible', editLimiter, getEditCollectibleRoutes ());
    router.use ('/edit/collection', editLimiter, getEditCollectionRoutes ());
    router.use ('/statswatch', getStatswatchRoutes ());
    router.use ('/heart', getHeartsRoutes ());
    router.use ('/search', searchRoutes ());
    router.use ('/claim', getEditClaimTransferRoutes ());

    const getHc =  (req, res) => {
        res.send({
            network: process.env.NETWORK,
            name: process.env.npm_package_name,
            ver: process.env.npm_package_version,
        })
    }

    router.get ('/', getHc);
    router.get ('/hc', getHc);

    return router;
}
