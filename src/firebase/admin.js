const admin = require('firebase-admin');

// Initialize only once
if (!admin.apps.length) {
  try {
    let credential;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // Use service account JSON from environment variable
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = admin.credential.cert(serviceAccount);
    } else {
      // Fallback to application default (for local testing with GOOGLE_APPLICATION_CREDENTIALS)
      credential = admin.credential.applicationDefault();
    }

    admin.initializeApp({
      credential,
      databaseURL: process.env.FIREBASE_DATABASE_URL || undefined
    });
  } catch (error) {
    console.error('Firebase Admin initialization error:', error.message);
    throw error;
  }
}

module.exports = { admin };
