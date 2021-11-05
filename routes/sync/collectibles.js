const { Router } = require ('express');
const firebase = require ('../../lib/firebase');
const ethers = require ('ethers');
const { getWallet } = require ('../../lib/getWallet');

const { ABI } = require ('../../contracts/SqwidERC1155');

const { getCloudflareURL } = require ('../../lib/getIPFSURL');
const { default: axios } = require('axios');

let sync = async (req, res) => {
    const { provider } = await getWallet ();
    const contract = new ethers.Contract (process.env.COLLECTIBLE_CONTRACT_ADDRESS, ABI, provider);

    const currentId = Number (await contract.currentId ());

    const dbCollection = firebase.collection ('collectibles');

    for (let i = currentId; i > Math.max (currentId - 10, 0); i--) {
        const uri = await contract.uri (i);
        let url = getCloudflareURL (uri);
        const doc = await dbCollection.where ('id', '==', i).get ();
        if (doc.empty) {
            try {
                const response = await axios (url);
                const json = await response.data;
                const { name, properties } = json;
                const { collection, creator } = properties;
    
                const data = {
                    id: i,
                    uri,
                    collection: collection || "Sqwid",
                    createdAt: new Date (),
                    creator,
                    name
                };
                await dbCollection.doc (i.toString ()).set (data);
            } catch (error) {
                console.log (error);
            }
        }
    }
    res.status (200).json ({
        message: 'Sync complete.'
    });
}

module.exports = () => {
    const router = Router ();

    router.get ('/', sync);

    return router;
}