const Imap = require('imap');
const { simpleParser } = require('mailparser');

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>.*?<\/style>/gs, '')
    .replace(/<script[^>]*>.*?<\/script>/gs, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function testConnection(config) {
  return new Promise((resolve, reject) => {
    const { user, password, host, port } = config;

    const imap = new Imap({
      user, password, host,
      port: parseInt(port) || 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000,
      connTimeout: 10000
    });

    let done = false;

    imap.once('ready', () => {
      if (done) return;
      done = true;
      imap.end();
      resolve({ success: true, message: 'Connected successfully' });
    });

    imap.once('error', (err) => {
      if (done) return;
      done = true;
      reject({ success: false, error: err.message });
    });

    imap.once('timeout', () => {
      if (done) return;
      done = true;
      imap.end();
      reject({ success: false, error: 'Connection timeout' });
    });

    imap.connect();
  });
}

function fetchEmails(config) {
  return new Promise((resolve, reject) => {
    const { user, password, host, port, folder = 'INBOX', limit = 20 } = config;

    const imap = new Imap({
      user, password, host,
      port: parseInt(port) || 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000,
      connTimeout: 15000
    });

    const emails = [];
    let done = false;

    imap.once('ready', () => {
      imap.openBox(folder, false, (err, box) => {
        if (err) {
          if (!done) {
            done = true;
            return reject({ success: false, error: `Failed to open folder: ${err.message}` });
          }
          return;
        }

        if (box.messages.total === 0) {
          if (!done) {
            done = true;
            imap.end();
            return resolve({ success: true, emails: [], total: 0 });
          }
          return;
        }

        const fetchCount = Math.min(parseInt(limit), box.messages.total);
        const fetch = imap.seq.fetch(`${box.messages.total - fetchCount + 1}:${box.messages.total}`, { bodies: '' });

        fetch.on('message', (msg) => {
          let buffer = '';
          msg.on('body', (stream) => {
            stream.on('data', (chunk) => buffer += chunk.toString());
          });

          msg.once('end', async () => {
            try {
              const parsed = await simpleParser(buffer);
              let cleanBody = parsed.text || '';
              if (!cleanBody && parsed.html) {
                cleanBody = stripHtml(parsed.html);
              }

              emails.push({
                id: parsed.messageId || `msg-${Date.now()}-${emails.length}`,
                from: parsed.from?.text || '',
                subject: parsed.subject || '',
                body: cleanBody.substring(0, 5000),
                date: parsed.date?.toISOString() || new Date().toISOString(),
                messageId: parsed.messageId
              });
            } catch (e) {
              console.error('Parse error:', e.message);
            }
          });
        });

        fetch.once('end', () => {
          setTimeout(() => {
            if (!done) {
              done = true;
              imap.end();
              resolve({ success: true, emails, total: box.messages.total });
            }
          }, 500);
        });

        fetch.once('error', (err) => {
          if (!done) {
            done = true;
            reject({ success: false, error: err.message });
          }
        });
      });
    });

    imap.once('error', (err) => {
      if (!done) {
        done = true;
        reject({ success: false, error: err.message });
      }
    });

    imap.once('timeout', () => {
      if (!done) {
        done = true;
        imap.end();
        reject({ success: false, error: 'IMAP connection timeout' });
      }
    });

    imap.connect();
  });
}

module.exports = { testConnection, fetchEmails };