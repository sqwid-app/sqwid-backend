// import admin from 'firebase-admin';
const admin = require('firebase-admin');

const { defaultNetwork, TESTNET} = require('../constants');
const firebaseCredentialJsonStr = defaultNetwork === TESTNET ? 'FIREBASE_TEST_ADMIN_JSON_BASE64' : 'FIREBASE_MAIN_ADMIN_JSON_BASE64';

function base64ToJson(base64String) {
  const mnetJsonStr = (Buffer.from(base64String, 'base64')).toString();
  return  JSON.parse(mnetJsonStr);
}

let credentialsBase64 = process.env[firebaseCredentialJsonStr];
if(process.env.DEBUG) {
  console.log('firebase init ...', credentialsBase64.substring(0, 70));
}
const serviceAccountCredentialsObject = base64ToJson(credentialsBase64);


try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountCredentialsObject)
  });
} catch (error) {
  /*
   * We skip the "already exists" message which is
   * not an actual error when we're hot-reloading.
   */
  if (!/already exists/u.test(error.message)) {
    // eslint-disable-next-line no-console
    console.error ('Firebase admin initialization error', error.stack);
  }
}

// export default admin.firestore ();

module.exports = admin.firestore ();
