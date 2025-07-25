const { Router } = require("express");
const { FieldValue } = require("firebase-admin").firestore;
const firebase = require("../../lib/firebase");
const { verify, log } = require("../../middleware/auth");
const ethers = require("ethers");
const multer = require("multer");
const getNetworkConfig = require("../../lib/getNetworkConfig");

const collectibleContractABI = require("../../contracts/SqwidERC1155").ABI;
const marketplaceContractABI = require("../../contracts/SqwidMarketplace").ABI;

const { getEVMAddress } = require("../../lib/getEVMAddress");
// const cors = require("cors");
const { getWallet } = require("../../lib/getWallet");
const { getInfuraURL } = require("../../lib/getIPFSURL");
const axios = require("axios");
const { getDbCollections, getDbCollectibles } = require("../get/marketplace");

const collectibleContract = (signerOrProvider, address = null) =>
  new ethers.Contract(
    address || getNetworkConfig().contracts["erc1155"],
    collectibleContractABI,
    signerOrProvider
  );
const marketplaceContract = (signerOrProvider) =>
  new ethers.Contract(
    getNetworkConfig().contracts["marketplace"],
    marketplaceContractABI,
    signerOrProvider
  );

const { syncTraitsToCollection } = require("../../lib/synctraits");
const {
  generateThumbnail,
  generateSmallSize,
} = require("../../lib/resizeFile");
const { initIpfs } = require("../../lib/IPFS");
const constants = require("../../constants");

const skipModeration = process.env.SKIP_MODERATION === "true";

const verifyItem = async (req, res, next) => {
  const { provider } = await getWallet();
  // provider.getCode(address)
  const marketContract = marketplaceContract(provider);
  const tokenContract = collectibleContract(provider);
  const { id, collection } = req.body;
  console.log(id, collection, 50);
  const collectionId = collection || "ASwOXeRM5DfghnURP4g2";

  const creatorPromise = getEVMAddress(req.user.address);
  const collectionDocPromise = getDbCollections([collectionId]);
  const collectiblePromise = getDbCollectibles([id]);
  const [creator, collectionDoc, collectible] = await Promise.all([
    creatorPromise,
    collectionDocPromise,
    collectiblePromise,
  ]);
  if (collectible.length)
    return res.status(400).json({
      error: "Collectible already verified.",
    });
  // verify user owns collection
  if (
    collectionDoc.length &&
    (collectionDoc[0].data.owner.toLowerCase() === creator.toLowerCase() ||
      collectionId === "ASwOXeRM5DfghnURP4g2")
  ) {
    try {
      const item = await marketContract.fetchItem(id);

      let ipfsURI;
      console.log("item.creator", item.creator);
      console.log("creator", creator);
      if (item.creator.toLowerCase() === creator.toLowerCase()) {
        let meta = {};
        try {
          ipfsURI = await tokenContract.uri(item.tokenId);
          console.log("ipfsURI inside verifyItem", ipfsURI)
          const response = await axios(getInfuraURL(ipfsURI));
          console.log("response inside verifyIte", response)
          meta = response.data;
        } catch (err) {
          console.log("create/collectible ERR=", err);
        }

        if (!meta.name)
          return res.status(400).json({
            error: "Blockchain item not found",
          });

        const attributes = meta?.attributes || [];
        const traits = {};
        if (collectionId !== "ASwOXeRM5DfghnURP4g2") {
          attributes.forEach(
            (attr) =>
              (traits[`trait:${attr.trait_type.toUpperCase()}`] =
                attr.value.toUpperCase())
          );
        }

        if (!meta.mimetype) {
          const h = await axios.head(getInfuraURL(meta.media));
          const mimetype = h.headers["content-type"];
          meta.mimetype = mimetype;
        }

        await Promise.all([
          firebase.collection("collectibles").add({
            id,
            tokenId: item.tokenId.toNumber(),
            uri: ipfsURI,
            collectionId,
            createdAt: new Date(),
            creator,
            meta,
            approved: skipModeration ? true : null,
            ...traits,
          }),
          syncTraitsToCollection(collectionId, traits),
        ]);

        if (skipModeration) {
          await firebase
            .collection("blacklists")
            .doc("collectibles")
            .update({
              allowed: FieldValue.arrayUnion({
                id,
                collection: collectionId,
              }),
            });
        }

        res.status(200).json({
          message: "Item verified.",
        });
      } else {
        res.status(403).json({
          error: "You are not the owner of this item.",
        });
      }
    } catch (err) {
      console.log("err isss", err);
      next(err);
    }
  } else {
    return res.status(403).json({
      error: "You are not the owner of this collection.",
    });
  }
};

const uploadToIPFS = async (file) => {
  const ipfs = initIpfs();
  const buffer = file.arrayBuffer ? await file.arrayBuffer() : file;
  const addedFile = await ipfs.add(buffer);
  await ipfs.pin.add(addedFile.path);
  return addedFile.path;
};

// const storage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         cb(null, constants.TEMP_PATH) //Destination folder
//     },
//     filename: function (req, file, cb) {
//         cb(null, file.originalname) //File name after saving
//     }
// })

const mediaUpload = multer({
  storage: multer.memoryStorage(), //storage,//
  limits: {
    fileSize: 100000000,
  },
});

let upload = async (req, res, next) => {
  const cover = req.files.coverData
    ? req.files.coverData[0]
    : req.files.fileData[0];
  const file =
    req.files.coverData && req.files.coverData[0] === req.files.fileData[0]
      ? null
      : req.files.fileData[0];

  let collectionId = req.body.collection || "ASwOXeRM5DfghnURP4g2";

  const creatorPromise = getEVMAddress(req.user.address);
  const collectionDocPromise = getDbCollections([collectionId]);

  const [creator, collectionDoc] = await Promise.all([
    creatorPromise,
    collectionDocPromise,
  ]);

  if (collectionDoc.length) {
    if (
      collectionDoc[0].data.owner.toLowerCase() === creator.toLowerCase() ||
      collectionId === "ASwOXeRM5DfghnURP4g2"
    ) {
      try {
        let uploadsArray = [];

        if (cover.mimetype.startsWith("video"))
          uploadsArray = [uploadToIPFS(cover.buffer)];
        else {
          const thumbnailPromise = generateThumbnail(cover.buffer);
          const smallSizePromise = generateSmallSize(cover.buffer);

          const [thumbnail, small] = await Promise.all([
            thumbnailPromise,
            smallSizePromise,
          ]);

          uploadsArray = [
            uploadToIPFS(thumbnail),
            uploadToIPFS(small),
            uploadToIPFS(cover.buffer),
          ];
          if (req.files.coverData) uploadsArray.push(uploadToIPFS(file.buffer));
        }

        let uploads = await Promise.all(uploadsArray);

        for (let i = 1; i < 3; i++) {
          if (!uploads[i]) uploads[i] = uploads[i - 1];
        }

        const metadata = {
          name: req.body.name || "Empty Sqwid",
          description: req.body.description || "",
          image: `ipfs://${uploads[1]}`,
          media: `ipfs://${uploads[3] || uploads[2]}`,
          thumbnail: `ipfs://${uploads[0]}`,
          attributes: JSON.parse(req.body.properties),
          mimetype: file.mimetype,
        };

        const meta = await uploadToIPFS(JSON.stringify(metadata));

        res.status(200).json({
          metadata: "ipfs://" + meta,
        });
      } catch (err) {
        next(err);
      }
    } else {
      return res.status(403).json({
        error: "You are not the owner of this collection.",
      });
    }
  } else {
    return res.status(404).json({
      error: "Collection not found.",
    });
  }
};

module.exports = () => {
  const router = Router();
  // router.use (cors ());

  router.post("/verify", verify, verifyItem);
  router.post(
    "/upload",
    log,
    verify,
    mediaUpload.fields([
      { name: "coverData", maxCount: 1 },
      { name: "fileData", maxCount: 1 },
    ]),
    upload
  );

  return router;
};
