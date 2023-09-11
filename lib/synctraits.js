const { getDbCollections } = require("../routes/get/marketplace");
const { cacheCollections } = require("./caching");
const firebase = require("./firebase");

const syncTraitsToCollection = async (collection, traits) => {
    const colData = await getDbCollections ([collection]);
    const newTraits = {
        ...colData [0].data.traits
    };
    let modified = false;
    Object.keys (traits).forEach (key => {
        const trait_type = key.split (':') [1].trim ();
        const trait_value = traits [key].trim ();
        if (trait_type in newTraits) {
            if (!newTraits [trait_type].includes (trait_value)) {
                newTraits [trait_type].push (trait_value);
                modified = true;
            }
        } else {
            newTraits [trait_type] = [trait_value];
            modified = true;
        }
    });

    if (modified) {
        colData [0].data.traits = newTraits;
        await Promise.all ([
            firebase.collection ('collections').doc (collection).set ({
                traits: newTraits
            }, { merge: true }),
            cacheCollections (colData)
        ]);
    }
}

module.exports = {
    syncTraitsToCollection
}