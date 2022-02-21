const getNetwork = require('./getNetwork');
const client = require('./redis');

const useCache = getNetwork ().useCache;

// COLLECTIBLES
const fetchCachedCollectibles = async (items) => {
    if (!useCache) return {
        cached: [],
        leftoverItems: items
    };
    const query = client.multi ();
    items.forEach (item => query.get (`collectible:${item}`));
    const cachedItems = await query.exec ();
    const res = [];
    for (let i = 0; i < items.length; i++) {
        if (cachedItems [i]) {
            res.push (JSON.parse (cachedItems [i]));
            items [i] = null;
        }
    }
    items = items.filter (item => item);
    return {
        cached: res,
        leftoverItems: items
    }
}

const cacheCollectibles = async (items) => {
    if (!useCache) return;
    const query = client.multi ();
    items.forEach (item => {
        delete item ['createdAt'];
        if (item.approved) {
            query.set (`collectible:${item.id}`, JSON.stringify (item));
        } else {
            query.set (`collectible:${item.id}`, JSON.stringify (item), {
                EX: 60 * 5 // 5 minutes
            });
        }
    });
    query.exec ();
}

// COLLECTIONS
const fetchCachedCollections = async (items) => {
    if (!useCache) return {
        cached: [],
        leftoverItems: items
    };
    const query = client.multi ();
    items.forEach (item => query.get (`collection:${item}`));
    const cachedItems = await query.exec ();
    const res = [];
    for (let i = 0; i < items.length; i++) {
        if (cachedItems [i]) {
            res.push ({ id: items [i], data: JSON.parse (cachedItems [i]) });
            items [i] = null;
        }
    }
    items = items.filter (item => item);
    return {
        cached: res,
        leftoverItems: items
    }
}

const cacheCollections = async (items) => {
    if (!useCache) return;
    const query = client.multi ();
    items.forEach (collection => {
        delete collection.data ['created'];
        query.set (`collection:${collection.id}`, JSON.stringify (collection.data));
    });
    query.exec ();
}

// NAMES
const fetchCachedNames = async (items) => {
    if (!useCache) return {
        cached: [],
        leftoverItems: items
    };
    const query = client.multi ();
    items = items.filter (address => Number (address) !== 0);
    items.forEach (address => query.get (`displayNames:${address}`));
    const names = await query.exec ();

    let result = [];
    for (let i = 0; i < items.length; i++) {
        if (names [i]) {
            result.push ({
                address: items [i],
                name: names [i]
            });
            items [i] = null;
        }
    }

    items = items.filter (address => address);
    return {
        cached: result,
        leftoverItems: items
    }
}

const cacheNames = async (items) => {
    if (!useCache) return;
    const query = client.multi ();
    items.forEach (user => {
        query.set (`displayNames:${user.address}`, user.name, {
            EX: 60 * 10 // 10 minutes
        });
    });

    query.exec ();
}

module.exports = {
    fetchCachedCollectibles,
    cacheCollectibles,
    fetchCachedCollections,
    cacheCollections,
    fetchCachedNames,
    cacheNames
}