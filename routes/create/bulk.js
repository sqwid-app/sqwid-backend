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

const TEMP_PATH = "./temp-uploads/";
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "mp4"];
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "video/mp4"];
const MAX_ITEMS = 10000;
const MAX_ATTRIBUTES = 100;
const infuraAuth =
    'Basic ' + Buffer.from(process.env.INFURA_IPFS_PROJECT_ID + ':' + process.env.INFURA_IPFS_PROJECT_SECRET).toString('base64');

const verifyCollection = async (req, res, next) => {
  console.log("TODO")
};

const create = async (req, res, next) => {
  console.log("TODO")
};

const uploadChunk = async (req, res) => {
  const body = JSON.parse(req.body.toString());

  const firstChunk = body.chunk === 0;
  const lastChunk = body.chunk === body.totalChunks - 1;
  if (body.fileName.split(".").pop() !== "zip") {
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

const upload = async (req, res) => {
  res.setHeader ('Access-Control-Allow-Origin', '*');

  let ext, mimeType, mediaUri, smallUri, thumbnailUri;
  let mediaIndex = 0;
  let metadataArray = [];
  const originalImageNames = [];
  const hash = ethers.utils.sha256(ethers.utils.toUtf8Bytes(req.body.fileName + req.ip));
  const dir = `${TEMP_PATH}${hash}`;

  // TODO manipulate files in parallel
  // TODO stop execution if error found
  // TODO match names in CSV with files in zip
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
      return uploadRes(res, 400, "Zip contains too many files", dir);  
    }
    
    // Get metadata
    if (!fs.existsSync(`${dir}/media/metadata.csv`)) {
      return uploadRes(res, 400, "No metadata.csv file found", dir);
    }
    metadataArray = getMetadata(fs.readFileSync(`${dir}/media/metadata.csv`));
    if (metadataArray.length != numFiles - 1) 
      return uploadRes(res, 400, "CSV file contains wrong number of entries", dir);
    fs.unlinkSync(`${dir}/media/metadata.csv`);

    // Get media files
    const fileNames = fs.readdirSync(`${dir}/media`);
    fileNames.forEach(async (fileName) => {
      if (fs.lstatSync(`${dir}/media/${fileName}`).isDirectory()) {
        return uploadRes(res, 400, "Zip contains directories", dir);
      }

      const _ext = fileName.split(".").pop() || "";
      if (ALLOWED_EXTENSIONS.includes(_ext)) {
        if (!ext) ext = _ext;
        else if (ext !== _ext) {
          return uploadRes(res, 400, "Zip contains mixed file types", dir);
        }
        if (fs.statSync(`${dir}/media/${fileName}`).size > 30000000) {
          return uploadRes(res, 400, "Zip file contains files too large", dir);
        }
        
        originalImageNames.push(fileName);
        const newName = `${eip1155Id(++mediaIndex)}.${_ext}`;
        fs.renameSync(`${dir}/media/${fileName}`, `${dir}/media/${newName}`);

        const _mimeType = mime.lookup(`${dir}/media/${fileName}`);
        if (!ALLOWED_MIME_TYPES.includes(_mimeType)) {
          return uploadRes(res, 400, "Zip contains unsoported file mime types", dir);
        }
        if (!mimeType) mimeType = _mimeType;
        else if (mimeType !== _mimeType) {
          return uploadRes(res, 400, "Zip contains mixed file mime types", dir);
        }

        if (_mimeType.startsWith('image')) {
          const thumbnail = await generateThumbnail(`${dir}/media/${newName}`);
          fs.writeFileSync(`${dir}/thumbnail/${newName}`, thumbnail);
          const small = await generateSmallSize(`${dir}/media/${newName}`);
          fs.writeFileSync(`${dir}/small/${newName}`, small);
        };
      } else {
        return uploadRes(res, 400, "Zip contains unsopported file extensions", dir);
      }
    });
  } catch (err) {
    console.log("code", err.name);
    return uploadRes(res, 500, err.message, dir);
  }

  // Upload to files to IPFS
  mediaUri = await uploadToIPFS(`${dir}/media`);
  if (mimeType.startsWith('image')) {
    smallUri = await uploadToIPFS(`${dir}/small`);
    thumbnailUri = await uploadToIPFS(`${dir}/thumbnail`);
  }
  
  // Upload metadata to IPFS
  metadataArray.map((metadata, index) => {
    const fileName = `${eip1155Id(index + 1)}.${ext}`;
    metadata.media = `${mediaUri}/${fileName}`;
    metadata.image = `${smallUri || mediaUri}/${fileName}`;
    metadata.thumbnail = `${thumbnailUri || mediaUri}/${fileName}`;
    metadata.mimeType = mimeType;
    fs.writeFileSync(`${dir}/metadata/${eip1155Id(index + 1)}.json`, JSON.stringify(metadata));
  });
  const metadataUri = await uploadToIPFS(`${dir}/metadata`);
  console.log("metadataUri", metadataUri);

  return uploadRes(res, 200, {uri: metadataUri}, dir);
}

const getMetadata = (csv) => {
    const metadataArray = [];
  
    const records = parse(csv, {
      max_record_size: MAX_ITEMS,
      trim: true,
      skip_empty_lines: true,
    });
  
    const columns = records[0];
    if (
      columns.length < 2 ||
      columns[0].toLowerCase() !== "name" ||
      columns[1].toLowerCase() !== "description"
    ) {
      throw new Error("Invalid CSV file");
    }
  
    if (columns.length > MAX_ATTRIBUTES + 2) {
      throw new Error("Too many attributes in metadata");
    }
  
    for (let i = 1; i < records.length; i++) {
      const metadata = {
        name: records[i][0],
        description: records[i][1],
        attributes: [],
      };
  
      for (let c = 2; c < columns.length; c++) {
        metadata.attributes.push({
          trait_type: columns[c],
          value: records[i][c],
        });
      }
  
      metadataArray.push(metadata);
    }
  
    return metadataArray;
}

const uploadRes = (res, code, message, dir) => {
  fs.rmSync(dir, {recursive: true});
  return res.status(code).json(code == 200 ? message : {error: message.toString()});
}

const uploadToIPFS = async (dir) => {
  const ipfs = ipfsClient.create ({
    host: "ipfs.infura.io",
    port: 5001,
    protocol: "https",
    headers: {
      authorization: infuraAuth,
    }
  });

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

const eip1155Id = (id) => {
  return id.toString(16).padStart(64, "0");
};

module.exports = () => {
  const router = Router ();
  router.use (cors ());

  router.post ('/verify', verify, verifyCollection);
  router.post ('/upload-chunk', verify, uploadChunk);
  router.post ('/upload', verify, upload);
  router.post ('/create', verify, create);

  return router;
}
