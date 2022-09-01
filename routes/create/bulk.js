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

const TEMP_PATH = "./temp-uploads/";
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "mp4"];
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "video/mp4"];
const MAX_ITEMS = 10000;
const MAX_ATTRIBUTES = 100;

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

const upload = async (inputName) => {
  let mimeType;
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
    metadataArray.forEach(async (metadata) => {
      if (fs.lstatSync(`${dir}/media/${metadata.originalFileName}`).isDirectory()) {
        fs.rmSync(dir, {recursive: true});
        return { errorCode: 400, errorMessage: "Zip contains directories" };  
      }

      if (fs.statSync(`${dir}/media/${metadata.originalFileName}`).size > 30000000) {
        fs.rmSync(dir, {recursive: true});
        return { errorCode: 400, errorMessage: "Zip file contains files too large" };  
      }

      const _mimeType = mime.lookup(`${dir}/media/${metadata.originalFileName}`);
      if (!ALLOWED_MIME_TYPES.includes(_mimeType)) {
        fs.rmSync(dir, {recursive: true});
        return { errorCode: 400, errorMessage: "Zip contains unsoported file mime types" };  
      }
      if (!mimeType) mimeType = _mimeType;
      else if (mimeType !== _mimeType) {
        fs.rmSync(dir, {recursive: true});
        return { errorCode: 400, errorMessage: "Zip contains mixed file mime types" };  
      }

      fs.renameSync(`${dir}/media/${metadata.originalFileName}`, `${dir}/media/${metadata.fileName}`);

      if (_mimeType.startsWith('image')) {
        const [thumbnail, small] = await Promise.all([
          generateThumbnail(`${dir}/media/${metadata.fileName}`), 
          generateSmallSize(`${dir}/media/${metadata.fileName}`)
        ]);
        fs.writeFileSync(`${dir}/thumbnail/${metadata.fileName}`, thumbnail);
        fs.writeFileSync(`${dir}/small/${metadata.fileName}`, small);
      };
    });
  } catch (err) {
    fs.rmSync(dir, {recursive: true});
    return { errorCode: 500, errorMessage: err.message };  
  }

  // Upload to files to IPFS
  const uploadsArray = [uploadToIPFS(`${dir}/media`)];
  if (mimeType.startsWith('image')) {
    uploadsArray.push(uploadToIPFS(`${dir}/small`));
    uploadsArray.push(uploadToIPFS(`${dir}/thumbnail`));
  }
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
      mimeType: mimeType,
    }
    fs.writeFileSync(`${dir}/metadata/${eip1155Id(index + 1)}.json`, JSON.stringify(metadata));
  });
  const metadataUri = await uploadToIPFS(`${dir}/metadata`);

  fs.rmSync(dir, {recursive: true});
  return metadataUri;
}

const create = async (req, res, next) => {
  try {
    const collection = await newCollection(
        req.user.address, 
        req.body.name, 
        req.body.description, 
        req.file
    );
    const metadataUri = await upload(req.body.fileName + req.ip);
    if (metadataUri.errorCode) {
      return res.status(metadataUri.errorCode).json(metadataUri.errorMessage);
    }
    return res.status(201).json({
      collectionId: collection.id,
      metadata: metadataUri,
    });
  } catch (err) {
      next (err);
  }
};

const verifyItems = async (req, res, next) => {
  console.log("TODO")
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
        return { errorCode: 400, errorMessage: "Metadata file contains unsopported file extensions"};
      }

      const metadata = {
        name: name,
        description: records[i][1],
        originalFileName: fileName,
        fileName: `${eip1155Id(i)}.${ext}`,
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

const eip1155Id = (id) => {
  return id.toString(16).padStart(64, "0");
};

const uploadRes = (res, code, message, dir) => {
  fs.rmSync(dir, {recursive: true});
  return res.status(code).json(code == 200 ? message : {error: message.toString()});
}

module.exports = () => {
  const router = Router ();
  router.use (cors ());

  router.post ('/verify', verify, verifyItems);
  router.post ('/upload-chunk', verify, uploadChunk);
  router.post ('/create', [ verify, imageUpload.single ("fileData") ], create);

  return router;
}
