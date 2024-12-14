const sharp = require("sharp");
const { getEVMAddress } = require("./getEVMAddress");
const { initIpfs } = require("./IPFS");
const firebase = require("./firebase");
const { TEMP_PATH } = require("../constants");
const fs = require("fs");
const { create, globSource } = require("ipfs-http-client");
// const fs = require("fs");
const path = require("path");

const generateLogo = async (file) => {
  const data = await sharp(file)
    .resize({
      width: 128,
      height: 128,
      fit: sharp.fit.inside,
      withoutEnlargement: true,
    })
    .webp()
    .toBuffer();
  return data;
};

const generateThumbnail = async (file) => {
  const data = await sharp(file)
    .resize({
      width: 512,
      height: 512,
      fit: sharp.fit.inside,
      withoutEnlargement: true,
    })
    .webp()
    .toBuffer();
  return data;
};

// old pandey code
const uploadToIPFS = async (buffer) => {
  try {
    const ipfs = initIpfs();
    const { cid } = await ipfs.add(buffer);
    return cid.toString();
  } catch (error) {
    console.error("Error uploading to IPFS:", error);
  }
};

const uploadBulkToIPFS = async (file) => {
  const ipfs = initIpfs();
  const buffer = file.arrayBuffer ? await file.arrayBuffer() : file;
  const addedFile = await ipfs.add(buffer);
  await ipfs.pin.add(addedFile.path);
  return addedFile.path;
};

  const uploadBulkCollectionToIPFS = async (dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) {
        throw new Error(`Directory does not exist: ${dirPath}`);
      }
  
      const files = fs.readdirSync(dirPath);
      if (files.length === 0) {
        throw new Error(`No files found in directory: ${dirPath}`);
      }
  
      const ipfs = initIpfs();
      const addedFiles = [];
  
      // Process each file as a readable stream and upload to IPFS
      for (const file of files) {
        const filePath = path.join(dirPath, file);
  
        const fileStream = fs.createReadStream(filePath); // Create a readable stream
  
        // Add the stream to IPFS
        const result = await ipfs.add({ content: fileStream, path: file });
        addedFiles.push({
          path: file,
          cid: result.cid.toString(),
        });
      }
  
      // Format files with `ipfs://` URI scheme
      const crAddedFiles = addedFiles.map(file => ({
        path: file.path,
        cid: `ipfs://${file.cid}`,
      }));
  
      // Pin each file individually
      for (const file of addedFiles) {
        await ipfs.pin.add(file.cid);
      }
  
      // Assume the last added is the root directory or most recent file
      const rootDir = addedFiles[addedFiles.length - 1];
      if (!rootDir || !rootDir.cid) {
        throw new Error("Root directory or file CID not found in added files");
      }
  
      // Return all files' data, including root directory CID
      return {
        rootDirCid: rootDir.cid,
        files: crAddedFiles,
      };
      // return rootDir;
    } catch (error) {
      console.error("Error in uploadBulkCollectionToIPFS:", error.message);
      throw error;
    }
  };
  

const uploadMetadataToIPFS = async (metadataArray) => {
  try {
    const dir = `${TEMP_PATH}metadata`;

    // Ensure directory exists
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    // Write metadata files
    metadataArray.forEach((metadata, index) => {
      const filePath = `${dir}/metadata_${index + 1}.json`;
      fs.writeFileSync(filePath, JSON.stringify(metadata));
    });

    // Upload the directory to IPFS
    const metadataUri = await uploadBulkCollectionToIPFS(dir);

    // Clean up the temporary directory
    // fs.rmSync(dir, { recursive: true });
    return metadataUri;
  } catch (error) {
    console.error("Error in uploadMetadataToIPFS:", error);
    throw error;
  }
};

const newCollection = async (ownerAddress, name, description, file) => {
  const ownerEVMAddress = await getEVMAddress(ownerAddress);
  let col = {
    name: name || "",
    description: description || "",
    owner: ownerEVMAddress,
    created: new Date().getTime(),
    image: "",
    traits: {},
  };

  try {
    const logoPromise = generateLogo(file.buffer);
    const thumbnailPromise = generateThumbnail(file.buffer);

    const [logo, thumbnail] = await Promise.all([
      logoPromise,
      thumbnailPromise,
    ]);
    const [logoHash, thumbnailHash] = await Promise.all([
      uploadToIPFS(logo),
      uploadToIPFS(thumbnail),
    ]);

    col.image = `ipfs://${logoHash}`;
    col.thumbnail = `ipfs://${thumbnailHash}`;
    return await firebase.collection("collections").add(col);
  } catch (err) {
    throw err;
  }
};

module.exports = {
  newCollection,
  generateLogo,
  generateThumbnail,
  uploadToIPFS,
  uploadBulkToIPFS,
  uploadMetadataToIPFS,
};
