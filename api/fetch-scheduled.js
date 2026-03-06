const { fetchEmails } = require('../src/utils/imapClient');
const { validateImapFetch } = require('../src/utils/validators');
const { db } = require('../src/firebase/admin');

module.exports = async (req, res) => {
  console.log('[fetch-scheduled] Cron job triggered:', new Date().toISOString());

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    if (!db) {
      throw new Error('Firestore db is not initialized');
    }

    // Get config from Firestore (frontend stores config in 'configs' collection)
    const configDoc = await db.collection('configs').doc('imap').get();
    if (!configDoc.exists) {
      throw new Error('IMAP config not found in Firestore. Please configure IMAP in frontend first.');
    }
    const config = configDoc.data();

    // Validate config
    const errors = validateImapFetch(config);
    if (errors.length > 0) {
      throw new Error('Invalid config: ' + errors.join(', '));
    }

    // Fetch emails from IMAP
    const result = await fetchEmails(config);
    console.log('[fetch-scheduled] Fetched emails:', result.emails?.length || 0);

    // Save to Firestore
    if (result.emails && result.emails.length > 0) {
      for (const email of result.emails) {
        const emailId = email.id || `cron-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const emailRef = db.collection('emails').doc(emailId);
        await emailRef.set({
          ...email,
          id: emailId,
          userId: 'default-user-id',
          createdAt: email.createdAt || new Date().toISOString(),
          sender: email.sender,
          isRead: email.isRead || false,
          fetchedAt: new Date().toISOString()
        });
      }
      console.log('[fetch-scheduled] Saved', result.emails.length, 'emails to Firestore');
    }

    return res.status(200).json({
      success: true,
      total: result.emails?.length || 0,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[fetch-scheduled] Error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
};
