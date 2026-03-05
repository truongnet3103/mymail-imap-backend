const { fetchEmails } = require('../src/utils/imapClient');
const { validateImapFetch } = require('../src/utils/validators');
const { db } = require('../src/firebase/admin');
const axios = require('axios');

module.exports = async (req, res) => {
  console.log('[fetch-and-summarize] Request:', new Date().toISOString());

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ success: false, error: 'userId required' });
  }

  try {
    // 1. Lấy IMAP config và AI config từ Firestore
    const configDoc = await db.collection('app_configs').doc(userId).get();
    if (!configDoc.exists) {
      return res.status(404).json({ success: false, error: 'Config not found' });
    }
    const config = configDoc.data();
    const imapConfig = config.imapConfig;

    // Validate IMAP config
    const errors = validateImapFetch(imapConfig);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // 2. Fetch emails từ IMAP
    const result = await fetchEmails(imapConfig);
    const emails = result.emails || [];

    // 3. Lấy các messageId đã có trong Firestore để skip duplicates
    const existingSnapshot = await db.collection('emails')
      .where('userId', '==', userId)
      .select('messageId')
      .get();
    const existingMessageIds = new Set(
      existingSnapshot.docs
        .map(d => d.data().messageId)
        .filter(Boolean)
    );

    // 4. Lọc email mới
    const newEmails = emails.filter(e => e.messageId && !existingMessageIds.has(e.messageId));

    // 5. Xử lý từng email mới: lưu + summarize
    let summarized = 0;
    for (const email of newEmails) {
      try {
        const emailData = {
          sender: email.from || 'unknown',
          subject: email.subject || '(No subject)',
          content: email.body || '',
          date: email.date || new Date().toISOString(),
          isRead: false,
          createdAt: new Date().toISOString(),
          userId,
          messageId: email.messageId
        };

        // Lưu email
        const docRef = await db.collection('emails').add(emailData);

        // Tóm tắt với AI nếu có config và có nội dung
        if (emailData.content && config.aiProvider && config.aiModel && config.aiApiKey) {
          try {
            const summary = await summarizeWithAI(emailData.content, config);
            if (summary) {
              await docRef.update({ summary });
              summarized++;
            }
          } catch (aiErr) {
            console.error('[AI summary error]', aiErr.message);
          }
        }
      } catch (e) {
        console.error('[Save email error]', e.message);
      }
    }

    return res.status(200).json({
      success: true,
      fetched: emails.length,
      new: newEmails.length,
      summarized
    });
  } catch (err) {
    console.error('[fetch-and-summarize] Error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
};

// Hàm tóm tắt email bằng AI
async function summarizeWithAI(content, config) {
  const { aiProvider, aiModel, aiApiKey } = config;
  const prompt = `Tóm tắt nội dung email sau đây trong tối đa 2 câu, tập trung vào thông tin chính, yêu cầu hành động, và mục đích:\n\n${content.substring(0, 10000)}`;

  try {
    // Gemini (Google)
    if (aiProvider === 'gemini') {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${aiApiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 200 }
        }
      );
      const c = response.data.candidates?.[0];
      if (c?.content?.parts?.[0]?.text) return c.content.parts[0].text.trim();
      return null;
    }

    // OpenAI & OpenRouter (compatible)
    if (aiProvider === 'openai' || aiProvider === 'openrouter') {
      const endpoint = aiProvider === 'openai'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://openrouter.ai/api/v1/chat/completions';
      const headers = {
        'Authorization': `Bearer ${aiApiKey}`,
        'Content-Type': 'application/json'
      };
      if (aiProvider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://mymail-imap.web.app';
        headers['X-Title'] = 'MyMail IMAP';
      }
      const response = await axios.post(endpoint, {
        model: aiModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.3
      }, { headers });
      const choice = response.data.choices?.[0];
      if (choice?.message?.content) return choice.message.content.trim();
      return null;
    }

    // Anthropic
    if (aiProvider === 'anthropic') {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: aiModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.3
        },
        {
          headers: {
            'x-api-key': aiApiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          }
        }
      );
      const block = response.data.content?.[0];
      if (block?.text) return block.text.trim();
      return null;
    }

    // Moonshot
    if (aiProvider === 'moonshot') {
      const response = await axios.post(
        'https://api.moonshot.cn/v1/chat/completions',
        {
          model: aiModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.3
        },
        {
          headers: {
            'Authorization': `Bearer ${aiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      const choice = response.data.choices?.[0];
      if (choice?.message?.content) return choice.message.content.trim();
      return null;
    }

    console.warn(`AI provider ${aiProvider} not supported yet`);
    return null;
  } catch (err) {
    console.error('[AI API error]', err.response?.data || err.message);
    throw err;
  }
}
