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

// Remove quoted replies, signatures, headers
function cleanEmailBody(text) {
  if (!text) return '';
  
  const lines = text.split('\n');
  const result = [];
  let inQuotedBlock = false;
  let inSignature = false;

  // Patterns that indicate start of quoted content or metadata
  const quotedStartPatterns = [
    /^On\s.+wrote:?$/i,           // "On Mon, ... wrote:"
    /^From:\s+/i,                 // "From: name <email>"
    /^Sent:\s+/i,                 // "Sent: Monday, ..."
    /^To:\s+/i,                   // "To: ..."
    /^Cc:\s+/i,                   // "Cc: ..."
    /^Subject:\s+/i,              // "Subject: ..."
    /^Date:\s+/i,                 // "Date: ..."
    /^---+$/m,                    // "---"
    /^_{3,}$/m,                   // "___"
    /^[*]{3,}$/m,                // "***"
    /^--\s*$/m,                   // "--"
    /^Original Message$/i,        // "Original Message"
    /^\[img\]/i,                  // "[img]"
    /^\[cid:/i                    // "[cid:...]"
  ];

  // Check if line is part of a signature (after '-- ')
  const signaturePattern = /^--\s*$/;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Check for signature delimiter
    if (signaturePattern.test(line.trim())) {
      inSignature = true;
      continue;
    }

    // Skip everything after signature
    if (inSignature) continue;

    // Check for quoted block start (lines beginning with '>')
    if (/^>\s?/.test(line)) {
      inQuotedBlock = true;
      continue;
    }

    // If we are in a quoted block, skip until we hit a non-quoted line? 
    // Actually once we see a quoted line, we stop entirely because it's usually at the end anyway.
    if (inQuotedBlock) {
      break;
    }

    // Check for metadata headers that indicate forwarded content
    if (quotedStartPatterns.some(re => re.test(line))) {
      break; // stop including further content
    }

    // Skip empty lines at the very beginning (leading whitespace)
    if (result.length === 0 && line.trim() === '') continue;

    result.push(line);
  }

  return result.join('\n').trim();
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