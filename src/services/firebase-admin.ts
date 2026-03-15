import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

let firebaseInitialized = false;

export function initializeFirebaseAdmin() {
  if (firebaseInitialized) return;

  let serviceAccount: admin.ServiceAccount;

  // Prefer JSON from env var (for serverless platforms like Vercel)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (err) {
      throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ' + (err as Error).message);
    }
  }
  // Fallback to file path (for local dev)
  else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH) {
    const absolutePath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Firebase service account key not found at: ${absolutePath}`);
    }
    serviceAccount = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } else {
    throw new Error('Either FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_KEY_PATH must be set');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
  });

  firebaseInitialized = true;
  console.log('Firebase Admin initialized');
}

export default admin;