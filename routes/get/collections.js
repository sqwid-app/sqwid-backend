const { Router } = require ('express');
const firebase = require ('../../lib/firebase');

const byOwner = async (req, res) => {
    const collectionsRef = firebase.collection ('collections');
    const snapshot = await collectionsRef.where ('owner', '==', req.params.address).get ();

    if (snapshot.empty) {
        res.status (404).send ({
            message: 'No collections found'
        });
    } else {
        let collections = [];
        snapshot.forEach (doc => {
            collections.push ({ id: doc.id, data: doc.data () });
        });
        res.status (200).send ({
            collections: collections
        });
    }
}


const byName = async (req, res) => {
    const collectionsRef = firebase.collection ('collections');
    const snapshot = await collectionsRef
        .where ('name', '>=', req.params.name)
        .where ('name', '<=', req.params.name + '\uF8FF')
        .get ();

    if (snapshot.empty) {
        res.status (404).send ({
            message: 'No collections found'
        });
    } else {
        let collections = [];
        snapshot.forEach (doc => {
            collections.push ({ id: doc.id, data: doc.data () });
        });
        res.status (200).send ({
            collections: collections
        });
    }
}

const byId = async (req, res) => {
    const collectionsRef = firebase.collection ('collections');
    const snapshot = await collectionsRef.doc (req.params.id).get ();

    if (!snapshot.exists) {
        res.status (404).send ({
            message: 'No collection found'
        });
    } else {
        res.status (200).send ({
            collection: { id: snapshot.id, data: snapshot.data () }
        });
    }
}



module.exports = () => {
    const router = Router ();

    router.get ('/owner/:address', byOwner);
    router.get ('/name/:name', byName);
    router.get ('/id/:id', byId);
    
    return router;
}