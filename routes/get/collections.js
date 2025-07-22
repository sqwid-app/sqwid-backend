const { Router } = require("express");
const firebase = require("../../lib/firebase");
const { getEVMAddress } = require("../../lib/getEVMAddress");
const admin = require("firebase-admin");
const db = admin.firestore();

const byOwner = async (req, res) => {
  const collectionsRef = firebase.collection("collections");
  let address;
  let snapshot = {};
  if (req.params.address.startsWith("0x")) {
    snapshot = await collectionsRef
      .where("owner", "==", req.params.address)
      .get();
  } else {
    address = await getEVMAddress(req.params.address);
    snapshot = await collectionsRef.where("owner", "==", address).get();
  }

  if (snapshot.empty) {
    res.status(404).send({
      message: "No collections found",
    });
  } else {
    let collections = [];
    snapshot.forEach((doc) => {
      collections.push({ id: doc.id, data: doc.data() });
    });
    res.status(200).send({
      collections: collections,
    });
  }
};

const byName = async (req, res) => {
  if (req.params.name.length < 3) {
    res.status(400).send({
      message: "Name must be at least 3 characters long",
    });
  } else {
    const collectionsRef = firebase.collection("collections");
    const snapshot = await collectionsRef
      .where("name", ">=", req.params.name)
      .where("name", "<=", req.params.name + "\uF8FF")
      .get();

    if (snapshot.empty) {
      res.status(404).send({
        message: "No collections found",
      });
    } else {
      let collections = [];
      snapshot.forEach((doc) => {
        collections.push({ id: doc.id, data: doc.data() });
      });
      res.status(200).send({
        collections: collections,
      });
    }
  }
};

const byId = async (req, res) => {
  const collectionsRef = firebase.collection("collections");
  const snapshot = await collectionsRef.doc(req.params.id).get();

  if (!snapshot.exists) {
    res?.status(404).send({
      message: "No collection found",
    });
    return null;
  } else {
    res?.status(200).send({
      collection: { id: snapshot.id, data: snapshot.data() },
    });
    return {
      collection: { id: snapshot.id, data: snapshot.data() },
    };
  }
};

// prvs
const all = async (req, res) => {
    const collectionsRef = firebase.collection ('collections');

    const limit = Math.min (req.query.limit, 50) || 10;
    const sorting = req.query.sorting || 'asc';
    const startAt = req.query.startAt || (sorting === 'asc' ? 0 : Infinity);
    const orderBy = req.params.property || req.query.orderBy || 'name';

    // const snapshot = await collectionsRef.orderBy (orderBy, sorting).startAfter (Number(startAt)).limit (limit).get ();

    const snapshot = await collectionsRef.get();
    console.log("snapshot==", snapshot);

    if (snapshot.empty) {
    console.log("No collections");

        res.status (404).send ({
            message: 'No collections found'
        });
    } else {
    console.log("collections==");

        let collections = [];
        snapshot.forEach (doc => {
            collections.push ({ id: doc.id, data: doc.data () });
        });
        res.status (200).send ({
            collections: collections
        });
    }
}



//mine
// const all = async (req, res) => {
//   try {
//     const collectionsRef = firebase.collection("collections");
//     // console.log("firebase==", firebase);
//     // console.log("inside all collections");
//     console.log("collectionsRef", collectionsRef);

//     const limit = Math.min(req.query.limit, 50) || 10;
//     const sorting = req.query.sorting || "asc";
//     const startAt = req.query.startAt || (sorting === "asc" ? 0 : Infinity);
//     const orderBy = req.params.property || req.query.orderBy || "name";

//     const snapshot = await collectionsRef.orderBy(orderBy, sorting)
//         .startAfter(Number(startAt))
//         .limit(limit)
//         .get();

//         console.log("snapshot ===",snapshot)

//     if (snapshot.empty) {
//       console.log("No collections");
//       return res.status(404).send({
//         message: "No collections found",
//       });
//     }

//     console.log("collections==");

//     let collections = [];

//     if (Array.isArray(snapshot)) {
//       snapshot.forEach((doc) => {
//         collections.push({ id: doc.id, data: doc.data() });
//       });
//     }

//     console.log("collections returned", collections);
//     res.status(200).send({
//       collections: collections,
//     });
//   } catch (error) {
//     console.error("Error fetching collections:", error);
//     res.status(500).send({
//       message: "An error occurred while fetching collections",
//       error: error.message,
//     });
//   }
// };


module.exports = {
  router: () => {
    const router = Router();

    router.get("/owner/:address", byOwner);
    // router.get ('/name/:name', byName); // re-enable when we implement the search
    router.get("/id/:id", byId);
    // router.get ('/all', all);
    router.get("/all/by/:property", all);
    return router;
  },
  byOwner,
  byName,
  byId,
  all,
};
