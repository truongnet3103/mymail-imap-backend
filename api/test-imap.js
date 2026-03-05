const { testConnection } = require('../src/utils/imapClient');
const { validateImapTest } = require('../src/utils/validators');

module.exports = async (req, res) => {
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

  const errors = validateImapTest(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  // Log incoming request (truncate password)
  const logBody = { ...req.body };
  if (logBody.password) logBody.password = '***';
  console.log('IMAP test request:', JSON.stringify(logBody));

  try {
    const result = await testConnection(req.body);
    console.log('IMAP test result:', result);
    return res.status(200).json(result);
  } catch (err) {
    console.error('IMAP test error:', err);
    return res.status(400).json({ success: false, error: err.error || 'Connection failed' });
  }
};