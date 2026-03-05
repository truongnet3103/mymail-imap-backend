const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null;

  if (!serviceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable not set');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
module.exports = { admin, db };
