const { fetchEmails } = require('../../src/utils/imapClient');
const { validateImapFetch } = require('../../src/utils/validators');

module.exports = async (req, res) => {
  console.log('[fetch] Request received:', new Date().toISOString());
  console.log('[fetch] Body:', JSON.stringify(req.body));

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

  // Map email -> user
  const body = { ...req.body };
  if (!body.user && body.email) {
    body.user = body.email;
  }

  const errors = validateImapFetch(body);
  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  try {
    const result = await fetchEmails(body);
    console.log('[fetch] Result:', result);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[fetch] Error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
};
