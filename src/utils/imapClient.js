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

// Advanced email body cleaner: removes signatures, quoted replies, footers
function cleanEmailBody(text) {
  if (!text) return '';
  
  // 1. Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const result = [];

  // 2. Patterns to detect start of unwanted content
  const stopPatterns = [
    // Quoted reply markers
    /^>/,
    // Email headers (forwarded part)
    /^From:\s+/i,
    /^Sent:\s+/i,
    /^To:\s+/i,
    /^Cc:\s+/i,
    /^Subject:\s+/i,
    /^Date:\s+/i,
    /^Reply-To:\s+/i,
    // Common delimiter lines
    /^---+\s*$/i,
    /^_{3,}$/i,
    /^\*{3,}$/i,
    /^--\s*$/i,
    // "On ... wrote:" pattern (English)
    /^On\s.+wrote:$/i,
    // "Vào lúc ... ai đó đã viết" (Vietnamese)
    /^Vào lúc/i,
    // Original Message header
    /^Original Message$/i,
    /^---.*Original Message/i,
    // Mailing list footers (common)
    /^You are receiving this email because/i,
    /^To unsubscribe/i,
    /^View this email in your browser/i,
    /^https?:\/\/\S+$/i, // URLs at the end (often tracking/ unsubscribe)
    // Signature start markers
    /^--\s*$/i,
    /^__$/i,
    /^-\s*$/i
  ];

  // Signature keywords (match if line contains these)
  const signatureKeywords = [
    /SBGear Vina/i,
    /88D Duong Cong Khi/i,
    /Contact:/i,
    /Tel:/i,
    /Mobile:/i,
    /Fax:/i,
    /Email:/i,
    /Website:/i,
    /URL:/i,
    /Group email:/i,
    /TAX CODE/i,
    /VAT CODE/i,
    /Add(?:ress)?:/i,
    /^\d{1,2}[A-Za-z]{3,} \d{6,}/i, // Address like "88D Duong..."
    /^\d{1,2}[A-Za-z]{3,} \d+$/i,
    /^\d{1,2}[A-Za-z]{3,},? \d+$/i,
    /^[A-Za-z0-9\s]+,\s*[A-Za-z\s]+$/i, // generic address line
    /^[A-Z]{2,}\s+[A-Za-z\s]+$/i, // uppercase words (company name)
  ];

  let foundStop = false;
  let blankLineCount = 0; // Count consecutive blank lines at the start

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip leading blank lines entirely
    if (result.length === 0 && trimmed === '') {
      continue;
    }

    // Check for stop patterns (quoted content, headers, delimiters)
    if (!foundStop) {
      const isStop = stopPatterns.some(regex => regex.test(line));
      if (isStop) {
        foundStop = true;
        break; // Stop processing completely
      }
    }

    // Check for signature keywords (if line looks like signature)
    // If we see signature keywords, we stop after that line maybe?
    // Actually usually signature lines are at the very end, after a blank line.
    // We'll break if we see signature keyword AND it's not part of the main content (usually after a blank line).
    const isSignature = signatureKeywords.some(regex => regex.test(trimmed));
    if (isSignature) {
      // If we already have some content and then a signature line, stop BEFORE it
      if (result.length > 0) {
        // Check if previous line was blank (common signature separator)
        const prevLine = lines[i-1]?.trim();
        if (prevLine === '') {
          break;
        }
        // Also break even if not blank, to be safe
        break;
      }
    }

    result.push(line);
  }

  // 3. Trim trailing blank lines and spaces
  let cleaned = result.join('\n').trim();
  // Remove trailing blank lines
  cleaned = cleaned.replace(/\n\s*\n\s*$/g, '');
  return cleaned;
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