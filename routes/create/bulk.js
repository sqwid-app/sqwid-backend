const { parse } = require("csv-parse/sync");
const { Router } = require("express");
const cors = require ('cors');
const { verify } = require("../../middleware/auth");
const fs = require("fs");
const ethers = require("ethers");
const StreamZip = require("node-stream-zip");
const ipfsClient = require ('ipfs-http-client');
const { generateThumbnail, generateSmallSize } = require('../../lib/resizeFile');
const mime = require('mime-types');
const { initIpfs } = require("../../lib/IPFS");
const multer = require ('multer');
const { newCollection } = require('../../lib/collection');
const { getWallet } = require("../../lib/getWallet");
const getNetwork = require('../../lib/getNetwork');
const collectibleContractABI = require ('../../contracts/SqwidERC1155').ABI;
const collectibleContract = (signerOrProvider, address = null) => new ethers.Contract (address || getNetwork ().contracts ['erc1155'], collectibleContractABI, signerOrProvider);
const { getDbCollections, getDbCollectibles } = require('../get/marketplace');
const { getEVMAddress } = require ('../../lib/getEVMAddress');
const { default: axios } = require("axios");
const { getInfuraURL } = require("../../lib/getIPFSURL");
const firebase = require("../../lib/firebase");
const { syncTraitsToCollection } = require("../../lib/synctraits");
const { TEMP_PATH } = require("../../constants");
const cleanTempUploads = require("../../scripts/cleanTempUploads");

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png"];
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png"];
const MAX_ITEMS = 10000;
const MAX_ATTRIBUTES = 100;
const MAX_FILE_SIZE = 100000000; // 100MB

const imageUpload = multer ({
  storage: multer.memoryStorage (),
  limits: {
      fileSize: 30000000
  },
});

const uploadChunk = async (req, res) => {
  const body = JSON.parse(req.body.toString());

  const firstChunk = body.chunk === 0;
  const lastChunk = body.chunk === body.totalChunks - 1;
  if (body.fileName.split(".").pop().toLowerCase() !== "zip") {
    res.status (400).json ({
      error: 'Invalid file extension'
    });
  }

  const buffer = Buffer.from(body.data.split(",")[1], "base64");
  const hash = ethers.utils.sha256(ethers.utils.toUtf8Bytes(body.fileName + req.ip));
  const tmpFilename = `temp_${hash}.zip`;
  if (!fs.existsSync(TEMP_PATH)) fs.mkdirSync(TEMP_PATH);

  if (firstChunk && fs.existsSync(TEMP_PATH + tmpFilename)) {
    fs.unlinkSync(TEMP_PATH + tmpFilename);
  }

  fs.appendFileSync(TEMP_PATH + tmpFilename, buffer);

  if (lastChunk) {
    const finalFilename = tmpFilename.replace("temp_", "");
    fs.renameSync(TEMP_PATH + tmpFilename, TEMP_PATH + finalFilename);
    res.status (200).json ({
      filename: finalFilename
    });
  } else {
    res.status (200).json ({ success: true });
  }
};

const upload = async (inputName) => {
  let mimetype;
  let metadataArray = [];
  const hash = ethers.utils.sha256(ethers.utils.toUtf8Bytes(inputName));
  const dir = `${TEMP_PATH}${hash}`;

  try {
    // Create directories
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true })
    fs.mkdirSync(dir);
    fs.mkdirSync(`${dir}/media`);
    fs.mkdirSync(`${dir}/thumbnail`);
    fs.mkdirSync(`${dir}/small`);
    fs.mkdirSync(`${dir}/metadata`);

    // Extract files
    const zip = new StreamZip.async({ file: `${dir}.zip` });
    const numFiles = await zip.extract(null, `${dir}/media`);
    fs.rmSync(`${dir}.zip`);
    await zip.close();
    if (numFiles > MAX_ITEMS + 1) {
      fs.rmSync(dir, {recursive: true});
      return { errorCode: 400, errorMessage: "Zip contains too many files" };  
    }
    
    // Get metadata
    if (!fs.existsSync(`${dir}/media/metadata.csv`)) {
      fs.rmSync(dir, {recursive: true});
      return { errorCode: 400, errorMessage: "No metadata.csv file found" };  
    }
    metadataArray = getMetadata(fs.readFileSync(`${dir}/media/metadata.csv`));
    if (metadataArray.errorCode) {
      fs.rmSync(dir, {recursive: true});
      return metadataArray;
    }
    if (metadataArray.length != numFiles - 1) {
      fs.rmSync(dir, {recursive: true});
      return { errorCode: 400, errorMessage: "CSV file contains wrong number of entries" };  
    }
    fs.unlinkSync(`${dir}/media/metadata.csv`);

    // Get media files
    for (let i = 0; i < metadataArray.length; i++) {
      const metadata = metadataArray[i];
      if (!fs.existsSync(`${dir}/media/${metadata.originalFileName}`)) {
        fs.rmSync(dir, {recursive: true});
        return { errorCode: 400, errorMessage: `File ${metadata.originalFileName} not found` };
      }

      if (fs.lstatSync(`${dir}/media/${metadata.originalFileName}`).isDirectory()) {
        fs.rmSync(dir, {recursive: true});
        return { errorCode: 400, errorMessage: "Zip contains directories" };  
      }

      if (fs.statSync(`${dir}/media/${metadata.originalFileName}`).size > MAX_FILE_SIZE) {
        fs.rmSync(dir, {recursive: true});
        return { errorCode: 400, errorMessage: "Zip file contains files too large" };  
      }

      const _mimetype = mime.lookup(`${dir}/media/${metadata.originalFileName}`);
      if (!ALLOWED_MIME_TYPES.includes(_mimetype)) {
        fs.rmSync(dir, {recursive: true});
        return { errorCode: 400, errorMessage: "Zip contains unsoported file mime types" };  
      }
      if (!mimetype) mimetype = _mimetype;
      else if (mimetype !== _mimetype) {
        fs.rmSync(dir, {recursive: true});
        return { errorCode: 400, errorMessage: "Zip contains mixed file mime types" };  
      }

      fs.renameSync(`${dir}/media/${metadata.originalFileName}`, `${dir}/media/${metadata.fileName}`);

      const [thumbnail, small] = await Promise.all([
        generateThumbnail(`${dir}/media/${metadata.fileName}`), 
        generateSmallSize(`${dir}/media/${metadata.fileName}`)
      ]);
      fs.writeFileSync(`${dir}/thumbnail/${metadata.fileName}`, thumbnail);
      fs.writeFileSync(`${dir}/small/${metadata.fileName}`, small);
    };
  } catch (err) {
    fs.rmSync(dir, {recursive: true});
    return { errorCode: 500, errorMessage: err.message };  
  }

  // Upload to files to IPFS
  console.log("uploading files to IPFS");
  const uploadsArray = [
    uploadToIPFS(`${dir}/media`),
    uploadToIPFS(`${dir}/small`),
    uploadToIPFS(`${dir}/thumbnail`)
  ];
  const uploads = await Promise.all(uploadsArray);
  
  // Upload metadata to IPFS
  metadataArray.forEach((met, index) => {
    const metadata = {
      name: met.name,
      description: met.description,
      attributes: met.attributes,
      media: `${uploads[0]}/${met.fileName}`,
      image: `${uploads[1] || uploads[0]}/${met.fileName}`,
      thumbnail: `${uploads[2] || uploads[0]}/${met.fileName}`,
      mimetype: mimetype,
    }
    fs.writeFileSync(`${dir}/metadata/${hexId(index + 1)}.json`, JSON.stringify(metadata));
  });
  const metadataUri = await uploadToIPFS(`${dir}/metadata`);

  fs.rmSync(dir, {recursive: true});
  return { 
    metadataUri, 
    numItems: metadataArray.length, 
  };
}

const create = async (req, res, next) => {
  try {
    const collection = await newCollection(
        req.user.address, 
        req.body.collectionName, 
        req.body.collectionDescription, 
        req.file
    );
    const uploadRes = await upload(req.body.zipFile + req.ip);
    if (uploadRes.errorCode) {
      return res.status(uploadRes.errorCode).json({error: uploadRes.errorMessage});
    }
    return res.status(201).json({
      collectionId: collection.id,
      metadata: uploadRes.metadataUri,
      numItems: uploadRes.numItems,
    });
  } catch (err) {
      next (err);
  }
};

const chunkPromises = (array, chunkSize) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

const verifyItems = async (req, res, next) => {
    const { provider } = await getWallet ();
    const tokenContract = collectibleContract (provider);
    const { itemIds, collectionId } = req.body;

    if (!itemIds || !collectionId) {
      return res.status(400).json({error: "Missing itemIds or collectionId"});
    }

    if (itemIds.length > 500) {
      return res.status(400).json({error: "Too many items, max 500"});
    }

    const creatorPromise = getEVMAddress (req.user.address);
    const collectionDocPromise = getDbCollections ([collectionId]);
    const collectiblesPromise = getDbCollectibles (itemIds);
    const [creator, collectionDoc, collectibles] = await Promise.all ([creatorPromise, collectionDocPromise, collectiblesPromise]);
    if (collectibles.length === itemIds.length) return res.status (400).json ({
        error: 'Collectibles already verified.'
    });

    let verifiedCount = 0;

    // verify user owns collection
    if (collectionDoc.length && (collectionDoc [0].data.owner === creator)) {

      // let toProcess = itemIds.map (async (id) => {
      // itemIds.forEach (async (id) => {
      for (let id of itemIds) {
          try {
              let item = await doQuery (itemQuery (id));
              if (!item) {
                // If item not found in indexer, query contract directly. It might yet not be indexed.
                const res = await marketContract .fetchItem (id);
                if (!res) return res.status (400).json ({ error: 'Item not found' });
                item = {
                    tokenId: Number(res.tokenId),
                    nftContract: res.nftContract,
                    creator: res.creator
                };
              }
              let ipfsURI;
              if (item.creator === creator) {
                  let meta = {};
                  try {
                      ipfsURI = await tokenContract.uri (item.tokenId);
                      const response = await axios (getInfuraURL(ipfsURI));
                      meta = response.data;
                  } catch (err) {
                      console.log (err);
                  }

                  if (!meta.name) return res.status (400).json ({
                      error: 'Blockchain item not found'
                  });

                  const attributes = meta?.attributes || [];
                  const traits = {};
                  attributes.forEach (attr => traits [`trait:${attr.trait_type.toUpperCase ()}`] = attr.value.toUpperCase ())
                  
                  if (!meta.mimetype) {
                    const h = await axios.head (getInfuraURL (meta.media));
                    const mimetype = h.headers ['content-type'];
                    meta.mimetype = mimetype;
                  }

                  await Promise.all ([
                      firebase.collection ('collectibles').add ({
                          id,
                          tokenId: item.tokenId,
                          uri: ipfsURI,
                          collectionId,
                          createdAt: new Date (),
                          creator,
                          meta,
                          approved: null,
                          ...traits
                      }),
                      syncTraitsToCollection (collectionId, traits)
                  ]);

                  verifiedCount++;
                  console.log (verifiedCount);
              }
          } catch (err) {
              next (err);
          }
          await new Promise (resolve => setTimeout (resolve, 10));
      }
      // });
      // });

      // try {
      //   for (const pr of toProcess) {
      //     await pr;
      //     console.log (verifiedCount);
      //     await new Promise (resolve => setTimeout (resolve, 1000));
      //   }
      // } catch (err) {
      //   console.log (err);
      // }
      // await Promise.all(itemIds.map(async (id) => {
      //   try {
      //       const item = await marketContract.fetchItem (id);
      //       let ipfsURI;
      //       if (item.creator === creator) {
      //           let meta = {};
      //           try {
      //               ipfsURI = await tokenContract.uri (item.tokenId);
      //               const response = await axios (getInfuraURL(ipfsURI));
      //               meta = response.data;
      //           } catch (err) {
      //               console.log (err);
      //           }

      //           if (!meta.name) return res.status (400).json ({
      //               error: 'Blockchain item not found'
      //           });

      //           const attributes = meta?.attributes || [];
      //           const traits = {};
      //           attributes.forEach (attr => traits [`trait:${attr.trait_type.toUpperCase ()}`] = attr.value.toUpperCase ())
                
      //           if (!meta.mimetype) {
      //             const h = await axios.head (getInfuraURL (meta.media));
      //             const mimetype = h.headers ['content-type'];
      //             meta.mimetype = mimetype;
      //           }

      //           await Promise.all ([
      //               firebase.collection ('collectibles').add ({
      //                   id,
      //                   tokenId: item.tokenId.toNumber (),
      //                   uri: ipfsURI,
      //                   collectionId,
      //                   createdAt: new Date (),
      //                   creator,
      //                   meta,
      //                   approved: null,
      //                   ...traits
      //               }),
      //               syncTraitsToCollection (collectionId, traits)
      //           ]);

      //           verifiedCount++;
      //       }
      //   } catch (err) {
      //       next (err);
      //   }
      // }));

      if (verifiedCount === itemIds.length) {
        res.status (200).json ({
          message: 'Items verified.'
        });
      } else {
        res.status (500).json ({
          error: `${itemIds.length - verifiedCount} items have not been verified.`
        });
      }
    } else {
        return res.status (403).json ({
            error: 'You are not the owner of this collection.'
        });
    }
};

const getMetadata = (csv) => {
    const metadataArray = [];
  
    const records = parse(csv, {
      max_record_size: MAX_ITEMS,
      trim: true,
      skip_empty_lines: true,
    });
  
    const columns = records[0];
    if (
      columns.length < 3 ||
      columns[0].toLowerCase() !== "name" ||
      columns[1].toLowerCase() !== "description" ||
      columns[2].toLowerCase() !== "filename" 
    ) {
      return { errorCode: 400, errorMessage: "Invalid metadata file"};
    }
  
    if (columns.length > MAX_ATTRIBUTES + 3) {
      return { errorCode: 400, errorMessage: "Too many attributes in metadata file"};
    }
  
    let ext;
    for (let i = 1; i < records.length; i++) {
      const name = records[i][0];
      if (!name || name === "") throw new Error("Empty name in metadata file");

      const fileName = records[i][2];
      if (!fileName || fileName === "") throw new Error("Empty filename in metadata file");
      const _ext = fileName.split(".").pop() || "";
      if (ALLOWED_EXTENSIONS.includes(_ext)) {
        if (!ext) ext = _ext;
        else if (ext !== _ext) 
          return { errorCode: 400, errorMessage: "Metadata file contains mixed file extensions"};
      } else {
        return { errorCode: 400, errorMessage: "Metadata file contains unsupported file extensions"};
      }

      const metadata = {
        name: name,
        description: records[i][1],
        originalFileName: fileName,
        fileName: `${hexId(i)}.${ext}`,
        attributes: [],
      };
  
      for (let c = 3; c < columns.length; c++) {
        metadata.attributes.push({
          trait_type: columns[c],
          value: records[i][c],
        });
      }
  
      metadataArray.push(metadata);
    }
  
    return metadataArray;
}

const uploadToIPFS = async (dir) => {
  const ipfs = initIpfs();

  const addOptions = {
    pin: true,
    wrapWithDirectory: true
  };

  let cid;
  for await (const file of ipfs.addAll(ipfsClient.globSource(dir, '**/*'), addOptions)) {
    if (file.path === "") cid = file.cid.toString().replace("CID(", "").replace(")", "");
  }

  return `ipfs://${cid}`;
}

const hexId = (id) => { return id.toString(16).padStart(5, "0"); };

// TODO move to cron job
setInterval(() => {
	cleanTempUploads();
}, 1000 * 60 * 30); // 30 minutes

module.exports = () => {
  const router = Router ();
  router.use (cors ());

  router.post ('/verify', verify, verifyItems);
  router.post ('/upload-chunk', verify, uploadChunk);
  router.post ('/create', [ verify, imageUpload.single ("coverFile") ], create);

  return router;
}
