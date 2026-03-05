const admin = require('firebase-admin');

// Initialize only once
if (!admin.apps.length) {
  // Service account should be set via Vercel Environment Variables
  // Use applicationDefault() which picks up GOOGLE_APPLICATION_CREDENTIALS or Vercel secrets
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      databaseURL: process.env.FIREBASE_DATABASE_URL || undefined
    });
  } catch (error) {
    console.error('Firebase Admin initialization error:', error.message);
    // Re-throw to fail fast if Firebase is required
    throw error;
  }
}

module.exports = { admin };
