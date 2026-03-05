module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  return res.status(200).json({
    status: 'OK',
    version: '1.0.0',
    name: 'MyMail IMAP Backend (Vercel Functions)',
    endpoints: {
      health: '/api/health',
      testIMAP: '/api/imap/test (POST)',
      fetchEmails: '/api/imap/fetch (POST)'
    }
  });
};