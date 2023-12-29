// import { decodeAddress, signatureVerify } from '@polkadot/util-crypto';
// import { u8aToHex, u8aConcat, u8aToU8a } from '@polkadot/util';

const { decodeAddress, signatureVerify } = require('@polkadot/util-crypto');
const { u8aToHex, u8aConcat, u8aToU8a } = require('@polkadot/util');

const isValidSignature = (signedMessage, signature, address) => {
    const publicKey = decodeAddress(address);
    const hexPublicKey = u8aToHex(publicKey);
    let res = signatureVerify(signedMessage, signature, hexPublicKey);
    if (res.crypto === 'none') {
        res = signatureVerify(u8aWrapBytes(signedMessage), signature, hexPublicKey);
    }
    return res.isValid;
};

const U8A_WRAP_ETHEREUM = u8aToU8a('\x19Ethereum Signed Message:\n');
const U8A_WRAP_PREFIX = u8aToU8a('<Bytes>');
const U8A_WRAP_POSTFIX = u8aToU8a('</Bytes>');
const WRAP_LEN = U8A_WRAP_PREFIX.length + U8A_WRAP_POSTFIX.length;

function equals(a, b) {
    return a.length === b.length && u8aCmp(a, b) === 0;
}

function u8aEq(a, b) {
    return equals(u8aToU8a(a), u8aToU8a(b));
}

function u8aIsWrapped(u8a, withEthereum) {
    return u8a.length >= WRAP_LEN && u8aEq(u8a.subarray(0, U8A_WRAP_PREFIX.length), U8A_WRAP_PREFIX) && u8aEq(u8a.slice(-U8A_WRAP_POSTFIX.length), U8A_WRAP_POSTFIX) || withEthereum && u8a.length >= U8A_WRAP_ETHEREUM.length && u8aEq(u8a.subarray(0, U8A_WRAP_ETHEREUM.length), U8A_WRAP_ETHEREUM);
}

function u8aWrapBytes(bytes) {
    const u8a = u8aToU8a(bytes); // if Ethereum-wrapping, we don't add our wrapping bytes
    return u8aIsWrapped(u8a, true) ? u8a : u8aConcat(U8A_WRAP_PREFIX, u8a, U8A_WRAP_POSTFIX);
}

module.exports = { isValidSignature, wrapBytes: u8aWrapBytes };
