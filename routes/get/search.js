const { Router } = require('express');
const getNetworkConfig = require('../../lib/getNetworkConfig');
const typesense = require ('../../lib/typesense');
const { getDbCollections, sliceIntoChunks } = require('./marketplace');
const firebase = require ('../../lib/firebase');
const { fetchCachedCollectibles } = require('../../lib/caching');
const net = getNetworkConfig();

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
    res.json ({
        total: user.found,
        users: user.hits.map (hit => hit.document)
    });
}

const searchCollections = async (req, res) => {
    const { identifier } = req.params;
    const page = req.query.page || 1;
    const perPage = req.query.perPage || 10;
    let collections = await typesense.collections (net.typesense.collections ['collections']).documents ().search ({
        q: identifier,
        query_by: 'name',
        page,
        per_page: perPage
    });
    const collectionDataPromises = collections.hits.map (hit => hit.document).map (collection => getDbCollections ([collection.id]));
    const collectionData = await Promise.all (collectionDataPromises);
    const data = collections.hits.map (hit => hit.document).map ((collection, index) => {
        return {
            ...collection,
            ...(collectionData [index] [0].data)
        }
    });

    res.json ({
        total: collections.found,
        collections: data
    });
}

function getNextLexicographicalString(input) {
    let nextString = '';
    let carry = true;
    for (let i = input.length - 1; i >= 0; i--) {
      if (carry) {
        const charCode = input.charCodeAt(i) + 1;
        if (charCode > 122) {
          nextString = 'a' + nextString;
          carry = true;
        } else {
          nextString = String.fromCharCode(charCode) + nextString;
          carry = false;
        }
      } else {
        nextString = input[i] + nextString;
      }
    }
    if (carry) {
      nextString = 'a' + nextString;
    }
    return nextString;
  }

  function invertFirstLetter(str) {
    const firstLetter = str.charAt(0);
    if (firstLetter === firstLetter.toUpperCase()) {
      return firstLetter.toLowerCase() + str.slice(1);
    } else {
      return firstLetter.toUpperCase() + str.slice(1);
    }
  }
  

const searchAll = async (req, res) => {
    const { identifier } = req.params;
    let result = {
        collections: []
    }
    let collectionResults = [];
    try {
        const collectionsRef = firebase.collection('collections');

        // finding the exact identifier
        const collectionsResponseExactIdentifier = await collectionsRef.where('name', '>=', identifier).where('name', '<', getNextLexicographicalString(identifier)).get();

        // finding the recirpocated identifier
        collectionsResponseExactIdentifier.forEach((doc)=>{
            let data = doc.data();
                collectionResults.push({
                    name:data.name,
                    id:doc.id,
                    image:data.image
                })
        })

        const collectionsResponseModifiedIdentifier = await collectionsRef.where('name', '>=', invertFirstLetter(identifier)).where('name', '<', getNextLexicographicalString(invertFirstLetter(identifier))).get();

        collectionsResponseModifiedIdentifier.forEach((doc)=>{
            let data = doc.data();
                collectionResults.push({
                    name:data.name,
                    id:doc.id,
                    image:data.image
                })
        })

        // if no matches, find the closest match
        if(collectionResults.length==0){
            const collectionsResponseWhenNoMatch = await collectionsRef.where('name', '>=', identifier).get();
            collectionsResponseWhenNoMatch.forEach((doc)=>{
                let data = doc.data();
                    collectionResults.push({
                        name:data.name,
                        id:doc.id,
                        image:data.image
                    })
            })
            // find only first 10
            const filteredArray = collectionResults.filter(obj => obj.name.toLowerCase().startsWith(identifier.toLowerCase().charAt(0)));
            collectionResults=filteredArray.slice(0,10);
        }
        return res.json({
            collections:collectionResults
        });
    } catch (e) {
        console.log('ERROR searchAll=',e.message);
    }
    res.json (result);
}

module.exports = {
    router: () => {
        const router = Router ();

        router.get ('/users/:identifier', searchUsers);
        router.get ('/collections/:identifier', searchCollections);
        router.get ('/all/:identifier', searchAll);

        return router;
    }
}
