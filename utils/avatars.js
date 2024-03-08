module.exports.getAvatar = (item)=>{
    `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURI(item)}&scale=50`
}