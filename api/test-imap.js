const { testConnection } = require('../src/utils/imapClient');

module.exports = async (req, res) => {
  console.log('[test-imap] Request received:', new Date().toISOString());

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const body = { ...req.body };
  if (!body.user && body.email) {
    body.user = body.email;
  }

  try {
    const result = await testConnection(body);
    console.log('[test-imap] result:', result);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[test-imap] Error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
};
