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

const TEMP_PATH = "./temp-uploads/";
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "mp4"];
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "video/mp4"];
const MAX_ITEMS = 10000;
const MAX_ATTRIBUTES = 100;

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

  let mimeType;
  let metadataArray = [];
  const hash = ethers.utils.sha256(ethers.utils.toUtf8Bytes(req.body.fileName + req.ip));
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
    metadataArray.forEach(async (metadata) => {
      if (fs.lstatSync(`${dir}/media/${metadata.originalFileName}`).isDirectory()) {
        return uploadRes(res, 400, "Zip contains directories", dir);
      }

      if (fs.statSync(`${dir}/media/${metadata.originalFileName}`).size > 30000000) {
        return uploadRes(res, 400, "Zip file contains files too large", dir);
      }

      const _mimeType = mime.lookup(`${dir}/media/${metadata.originalFileName}`);
      if (!ALLOWED_MIME_TYPES.includes(_mimeType)) {
        return uploadRes(res, 400, "Zip contains unsoported file mime types", dir);
      }
      if (!mimeType) mimeType = _mimeType;
      else if (mimeType !== _mimeType) {
        return uploadRes(res, 400, "Zip contains mixed file mime types", dir);
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
    console.log(err);
    return uploadRes(res, 500, err.message, dir);
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

  return uploadRes(res, 200, {uri: metadataUri}, dir);
}

const create = async (req, res, next) => {
  console.log("TODO")
};

const verifyCollection = async (req, res, next) => {
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
      throw new Error("Invalid metadata file");
    }
  
    if (columns.length > MAX_ATTRIBUTES + 3) {
      throw new Error("Too many attributes in metadata file");
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
        else if (ext !== _ext) throw new Error("Metadata file contains mixed file extensions");
      } else {
        throw new Error("Metadata file contains unsopported file extensions");
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

  router.post ('/verify', verify, verifyCollection);
  router.post ('/upload-chunk', verify, uploadChunk);
  router.post ('/upload', verify, upload);
  router.post ('/create', verify, create);

  return router;
}
