const { Router } = require('express');
const getNetwork = require('../../lib/getNetwork');
const typesense = require ('../../lib/typesense');
const net = getNetwork ();

const searchUsers = async (req, res) => {
    const { identifier } = req.params;
    const page = req.query.page || 1;
    const perPage = req.query.perPage || 10;
    let user = await typesense.collections (net.typesense.collections ['users']).documents ().search ({
        q: identifier,
        query_by: 'displayName,evmAddress,address',
        query_by_weights: '3,2,1',
        page,
        per_page: perPage
    });
    res.json (user.hits.map (hit => hit.document));
}

const searchCollections = async (req, res) => {
    const { identifier } = req.params;
    let user = await typesense.collections (net.typesense.collections ['collections']).documents ().search ({
        q: identifier,
        query_by: 'name',
    });

    res.json (user.hits.map (hit => hit.document));
}

const searchAll = async (req, res) => {
    const { identifier } = req.params;
    let result = await typesense.multiSearch.perform ({
        searches: [{
                collection: net.typesense.collections ['users'],
                q: identifier,
                query_by: 'displayName,evmAddress,address',
                query_by_weights: '3,2,1',
                limit_hits: 3,
            }, {
                collection: net.typesense.collections ['collections'],
                q: identifier,
                query_by: 'name',
                limit_hits: 3
        }]
    }, {
        per_page: 3
    });
    result = {
        users: result.results[0].hits.map (hit => hit.document),
        collections: result.results[1].hits.map (hit => hit.document)
    }
    res.json (result);
}

module.exports = {
    router: () => {
        const router = Router ();

        router.get ('/user/:identifier', searchUsers);
        router.get ('/collection/:identifier', searchCollections);
        router.get ('/all/:identifier', searchAll);
        
        return router;
    }
}