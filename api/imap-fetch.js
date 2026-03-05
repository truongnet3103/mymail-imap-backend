const { fetchEmails } = require('../src/utils/imapClient');
const { validateImapFetch } = require('../src/utils/validators');

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

  const errors = validateImapFetch(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  try {
    const result = await fetchEmails(req.body);
    return res.status(200).json(result);
  } catch (err) {
    console.error('IMAP fetch error:', err);
    return res.status(500).json({ success: false, error: err.error || 'Internal server error' });
  }
};