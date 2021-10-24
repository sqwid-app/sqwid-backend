const { Router } = require ('express');

const getAuthRoutes = require ('./auth');
const getNonceRoutes = require ('./nonce');
const getCreateCollectibleRoutes = require ('./create/collectible');
const getCreateCollectionRoutes = require ('./create/collection');
const getCollectionsRoutes = require ('./get/collections');
const getVerifyJWTRoutes = require ('./verifyjwt');

module.exports = () => {
    const router = Router ();

    router.use ('/auth', getAuthRoutes ());
    router.use ('/nonce', getNonceRoutes ());
    router.use ('/create/collectible', getCreateCollectibleRoutes ());
    router.use ('/create/collection', getCreateCollectionRoutes ());
    router.use ('/get/collections', getCollectionsRoutes ())
    router.use ('/verifyjwt', getVerifyJWTRoutes ());

    router.get ('/', (req, res) => {
        res.send ('Sqwid API');
    });

    return router;
}