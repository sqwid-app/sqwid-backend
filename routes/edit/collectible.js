const { Router } = require ('express');
const { defaultCollectionId } = require('../../constants');
const { cacheCollectibles } = require('../../lib/caching');
const firebase = require ('../../lib/firebase');
const { syncTraitsToCollection } = require('../../lib/synctraits');
const { verify } = require ('../../middleware/auth');
const { getDbCollections } = require('../get/marketplace');

const moveToCollection = async (req, res) => {
    const { collectionId, itemId } = req.body;
    const collectiblePromise = firebase.collection ('collectibles').where ('id', '==', Number (itemId)).get ();
    const collectionPromise = getDbCollections ([collectionId]);
    const allowedPromise = firebase.collection ('blacklists').doc ('collectibles').get ();
    let [collectible, collection, allowed] = await Promise.all ([collectiblePromise, collectionPromise, allowedPromise]);
    if (!collectible.empty) {
        const collectibleId = collectible.docs [0].id;
        collectible = collectible.docs [0].data ();
        // old collection was default
        if (collectible.collectionId === defaultCollectionId) {
            if (collection.length) {
                collection = collection [0];

                // build traits
                const attributes = collectible.meta?.attributes || [];
                const traits = {};
                attributes.forEach (attr => traits [`trait:${attr.trait_type.toUpperCase ()}`] = attr.value.toUpperCase ())

                // update blacklist
                allowed = allowed.data ().allowed;
                allowed [allowed.indexOf (allowed.find (item => item.id === itemId))] = {
                    id: itemId,
                    collection: collectionId
                }

                // update collectible
                collectible.collectionId = collectionId;

                try {
                    await Promise.all ([
                        // update collectible in db
                        firebase.collection ('collectibles').doc (collectibleId).update ({
                            collectionId,
                            ...traits
                        }),
                        // update blacklist in db
                        firebase.collection ('blacklists').doc ('collectibles').update ({
                            allowed
                        }),
                        // update collectible in cache
                        cacheCollectibles ([collectible]),
                        // sync collection traits
                        syncTraitsToCollection (collectionId, traits)
                    ]);
                } catch (e) {
                    console.log (e);
                    return res.status (500).send ('Error updating collectible');
                }
                return res.status (200).send ('Collectible updated');
            } else {
                return res.status (404).send ('Collection not found');
            }
        } else {
            return res.status (400).send ('Collectible is not in default collection');
        }
    } else {
        res.status (404).json ({
            error: 'Collectible not found.'
        });
    }
}

module.exports = () => {
    const router = Router ();

    router.post ('/collection', verify, moveToCollection);
    
    return router;
}