const { Router } = require ('express');

const getAuthRoutes = require ('./auth');
const getNonceRoutes = require ('./nonce');
const getCreateCollectibleRoutes = require ('./create/collectible');
const getCreateCollectionRoutes = require ('./create/collection');
const getCollectionsRoutes = require ('./get/collections');
const getCollectiblesRoutes = require ('./get/collectibles');
const getCollectibleRoutes = require ('./get/collectible');
const getUserRoutes = require ('./get/user');
const getEditUserRoutes = require ('./edit/user');
const getVerifyJWTRoutes = require ('./verifyjwt');

module.exports = () => {
    const router = Router ();

    router.use ('/auth', getAuthRoutes ());
    router.use ('/nonce', getNonceRoutes ());
    router.use ('/create/collectible', getCreateCollectibleRoutes ());
    router.use ('/create/collection', getCreateCollectionRoutes ());
    router.use ('/get/collections', getCollectionsRoutes ());
    router.use ('/get/collectibles', getCollectiblesRoutes ());
    router.use ('/get/collectible', getCollectibleRoutes ());
    router.use ('/get/user', getUserRoutes ());
    router.use ('/edit/user', getEditUserRoutes ());
    router.use ('/verifyjwt', getVerifyJWTRoutes ());

    router.get ('/', (req, res) => {
        res.send ('Sqwid API');
    });

    return router;
}