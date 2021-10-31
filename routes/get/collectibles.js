const { Router } = require ('express');
const firebase = require ('../../lib/firebase');

const byCreator = async (req, res) => {
    const collectionsRef = firebase.collection ('collectibles');
    const snapshot = await collectionsRef.where ('creator', '==', req.params.address).get ();

    if (snapshot.empty) {
        res.status (404).send ({
            message: 'No collectibles found'
        });
    } else {
        let collectibles = [];
        snapshot.forEach (doc => {
            collectibles.push ({ id: doc.id, data: doc.data () });
        });
        res.status (200).send ({
            collectibles
        });
    }
}

const all = async (req, res) => {
    const collectionsRef = firebase.collection ('collectibles');
    
    const startAt = req.query.startAt || 0;
    const limit = Math.min (req.query.limit, 100) || 10;
    const sorting = 'asc';
    const orderBy = req.query.orderBy || 'createdAt';

    const snapshot = await collectionsRef.orderBy (orderBy, sorting).startAt (startAt).limit (limit).get ();

    if (snapshot.empty) {
        res.status (404).send ({
            message: 'No collectibles found'
        });
    } else {
        let collectibles = [];
        snapshot.forEach (doc => {
            collectibles.push ({ id: doc.id, data: doc.data () });
        });
        res.status (200).send ({
            collectibles
        });
    }
}



module.exports = () => {
    const router = Router ();

    router.get ('/creator/:address', byCreator);
    router.get ('/all', all);
    
    return router;
}