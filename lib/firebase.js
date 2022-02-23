// import admin from 'firebase-admin';
const admin = require ('firebase-admin');

const { defaultNetwork } = require ('../constants');
const projectId = defaultNetwork === 'reef_testnet' ? 'FIREBASE_TEST_PROJECT_ID' : 'FIREBASE_MAIN_PROJECT_ID';
const privateKey = defaultNetwork === 'reef_testnet' ? 'FIREBASE_TEST_PRIVATE_KEY' : 'FIREBASE_MAIN_PRIVATE_KEY';
const clientEmail = defaultNetwork === 'reef_testnet' ? 'FIREBASE_TEST_CLIENT_EMAIL' : 'FIREBASE_MAIN_CLIENT_EMAIL';

try {
  admin.initializeApp({
    credential: admin.credential.cert ({
      project_id: process.env [projectId],
      private_key: process.env [privateKey].replace (/\\n/g, '\n'),
      client_email: process.env [clientEmail]
    })
  });
} catch (error) {
  /*
   * We skip the "already exists" message which is
   * not an actual error when we're hot-reloading.
   */
  if (!/already exists/u.test (error.message)) {
    // eslint-disable-next-line no-console
    console.error ('Firebase admin initialization error', error.stack);
  }
}

// export default admin.firestore ();

module.exports = admin.firestore ();