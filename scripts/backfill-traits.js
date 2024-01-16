require ('dotenv').config ();
const firebase = require ('../lib/firebase');

firebase.collection ('collectibles').get ().then (querySnapshot => {
    querySnapshot.docs.forEach (async doc => {
        if (doc.exists) {
            try {
                const { meta } = doc.data ();
                const attributes = meta?.attributes.length ? meta?.attributes : [];
                const traits = {};
                attributes.forEach (attr => traits [`trait:${attr.trait_type.toUpperCase ()}`] = attr.value.toUpperCase ())
                await doc.ref.set ({
                    ...traits
                }, { merge: true });
                console.log (`backfilled ${doc.id}`);
            } catch (err) {
                console.log ('backfill-traits ERR=',err);
            }
        }
    });
})
