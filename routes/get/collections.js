const { Router } = require ('express');
const firebase = require ('../../lib/firebase');
const { getEVMAddress } = require('../../lib/getEVMAddress');
// const { getEVMAddress } = require('../../lib/getEVMAddress');

const getSubstrateAddress = async (evmAddress) => {
    let res = await firebase.collection ('users').where ('evmAddress', '==', evmAddress).get ()
    if (res.empty) return null;
    else return res.docs [0].data ().address;
} 

const byOwner = async (req, res) => {
    const collectionsRef = firebase.collection ('collections');
    let address;
    let snapshot = {};
    if (req.params.address.startsWith ('0x')) {
        snapshot = await collectionsRef.where ('owner', '==', req.params.address).get ();            
    } else {
        address = await getEVMAddress (req.params.address);
        snapshot = await collectionsRef.where ('owner', '==', address).get ();
    }
    
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
    if (req.params.name.length < 3) {
        res.status (400).send ({
            message: 'Name must be at least 3 characters long'
        });
    } else {
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
}

const byId = async (req, res) => {
    const collectionsRef = firebase.collection ('collections');
    const snapshot = await collectionsRef.doc (req.params.id).get ();

    if (!snapshot.exists) {
        res?.status (404).send ({
            message: 'No collection found'
        });
        return null;
    } else {
        res?.status (200).send ({
            collection: { id: snapshot.id, data: snapshot.data () }
        });
        return {
            collection: { id: snapshot.id, data: snapshot.data () }
        };
    }
}

const all = async (req, res) => {
    const collectionsRef = firebase.collection ('collections');
    
    const startAt = req.query.startAt || 0;
    const limit = Math.min (req.query.limit, 100) || 10;
    const sorting = 'asc';
    const orderBy = req.query.orderBy || 'name';

    const snapshot = await collectionsRef.orderBy (orderBy, sorting).startAt (startAt).limit (limit).get ();

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



module.exports = {
    router: () => {
        const router = Router ();

        router.get ('/owner/:address', byOwner);
        // router.get ('/name/:name', byName); // re-enable when we implement the search
        router.get ('/id/:id', byId);
        // router.get ('/all', all); 
        
        return router;
    },
    byOwner,
    byName,
    byId,
    all
}