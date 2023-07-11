const sharp = require ('sharp');

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

const generateSmallSize = async file => {
    const data = await sharp (file)
        .resize ({
            width: 1280,
            height: 1280,
            fit: sharp.fit.inside,
            withoutEnlargement: true
        })
        .webp ()
        .toBuffer ();
    return data;
}

module.exports = { generateThumbnail, generateSmallSize }