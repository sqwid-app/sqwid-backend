require ('dotenv').config ();
const firebase = require ('../lib/firebase');
const { getDbCollectibles } = require('../routes/get/marketplace');

setTimeout (() => {
    firebase.collection ('blacklists').doc ('collectibles').get ().then (async snapshot => {
        try {
            const items = snapshot.data ().allowed;
            const collections = {}
            items.forEach (item => {
                if (collections [item.collection]) {
                    collections [item.collection].items.push (item.id)
                } else {
                    collections [item.collection] = {
                        items: [item.id],
                        traits: {}
                    }
                }
            });
            Object.keys (collections).forEach (async key => {
                const collectibles = await getDbCollectibles (Array.from (collections [key].items));
                collectibles.forEach (async collectible => {
                    Object.keys (collectible).forEach (itemKey => {
                        if (itemKey.startsWith ('trait:')) {
                            const trait_type = itemKey.split (':') [1].trim ();
                            const trait_value = collectible [itemKey].trim ();

                            if (trait_type in collections [key].traits) {
                                if (!collections [key].traits [trait_type].includes (trait_value))
                                    collections [key].traits [trait_type].push (trait_value)
                            }
                            else collections [key].traits [trait_type] = [trait_value];
                        }
                    })
                })
                console.log (key, collections [key]);

                await firebase.collection ('collections').doc (key).set ({
                    traits: collections [key].traits
                }, { merge: true })
            });
        } catch (e) {
            console.log ('backfill-collections 1 ERR=',e);
        }
    });
}, 3000);
