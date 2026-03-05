const { GoogleGenerativeAI } = require('google-generativeai');
const axios = require('axios');

module.exports = async (req, res) => {
  console.log('[ai/models] Request:', new Date().toISOString());

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

  const { provider, apiKey } = req.query;

  try {
    if (provider === 'gemini') {
      if (!apiKey) {
        return res.status(400).json({ success: false, error: 'apiKey required for Gemini' });
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      const models = [];
      for (const m of genAI.listModels()) {
        if (m.supported_generation_methods?.includes('generateContent')) {
          models.push({
            id: m.name.replace('models/', ''),
            displayName: m.display_name || m.name,
            description: m.description || '',
            inputTokenLimit: m.input_token_limit,
            outputTokenLimit: m.output_token_limit
          });
        }
      }
      return res.json({ success: true, provider: 'gemini', models });
    }

    if (provider === 'openrouter') {
      if (!apiKey) {
        return res.status(400).json({ success: false, error: 'apiKey required for OpenRouter' });
      }
      const response = await axios.get('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const models = response.data.data?.map(m => ({
        id: m.id,
        displayName: m.name,
        description: m.description || '',
        contextLength: m.context_length
      })) || [];
      return res.json({ success: true, provider: 'openrouter', models });
    }

    // Add other providers if needed

    return res.status(400).json({ success: false, error: `Provider ${provider} not supported for listing models` });
  } catch (err) {
    console.error('[ai/models] Error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch models' });
  }
};
