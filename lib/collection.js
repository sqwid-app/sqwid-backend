const sharp = require ('sharp');
const { getEVMAddress } = require('./getEVMAddress');
const { initIpfs } = require('./IPFS');
const firebase = require ('./firebase');

const generateLogo = async file => {
    const data = await sharp (file)
        .resize ({
            width: 128,
            height: 128,
            fit: sharp.fit.inside,
            withoutEnlargement: true
        })
        .webp ()
        .toBuffer ();
    return data;
}

const generateThumbnail = async file => {
    const data = await sharp (file)
        .resize ({
            width: 512,
            height: 512,
            fit: sharp.fit.inside,
            withoutEnlargement: true
        })
        .webp ()
        .toBuffer ();
    return data;
}

const uploadToIPFS = async file => {
    const ipfs = initIpfs();
    const buffer = file.arrayBuffer ? await file.arrayBuffer() : file;
    const addedFile = await ipfs.add(buffer);
    await ipfs.pin.add (addedFile.path);
    return addedFile.path;
}

const newCollection = async (ownerAddress, name, description, file) => {
    const ownerEVMAddress = await getEVMAddress (ownerAddress);
    let col = {
        name: name || '',
        description: description || '',
        owner: ownerEVMAddress,
        created: new Date ().getTime (),
        image: '',
        traits: {}
    }

    try {
        const logoPromise = generateLogo (file.buffer);
        const thumbnailPromise = generateThumbnail (file.buffer);

        const [logo, thumbnail] = await Promise.all ([logoPromise, thumbnailPromise]);

        const [logoHash, thumbnailHash] = await Promise.all ([uploadToIPFS (logo), uploadToIPFS (thumbnail)]);

        col.image = `ipfs://${logoHash}`;
        col.thumbnail = `ipfs://${thumbnailHash}`;

        return await firebase.collection ('collections').add (col);
    } catch (err) {
        throw err;
    }
}

module.exports = { newCollection, generateLogo, generateThumbnail, uploadToIPFS };