const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { db } = require('../firebase/admin');

// Debug: check db on load
console.log('[imapClient] module loaded, db ok:', db ? 'yes' : 'no');

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
  const lines = text.split(/\r?\n/);
  const result = [];
  const stopMarkers = [
    // Forwarded email headers
    /^From:/i, /^Sent:/i, /^To:/i, /^Cc:/i, /^Subject:/i,
    // Delimiters
    /^---+/i, /^_{3,}/i, /^\*{3,}/i,
    // Quoted reply hints
    /^On\s.+wrote:$/i, /^V�o l�c/i,
    // Salutation markers (start of signature)
    /^Thanks,?$/i, /^Thank you,?$/i, /^Thanks and best regards,?$/i,
    /^Regards,?$/i, /^Best regards,?$/i, /^Sincerely,?$/i,
    /^Yours sincerely,?$/i, /^Yours truly,?$/i, /^Kind regards,?$/i, /^Best,?$/i,
    // Company-specific footer keywords
    /SBGear Vina/i, /88D,? Duong Cong Khi/i, /Hoc Mon Dist/i,
    /Please ensure the materials strictly follow/i,
    /PFAS FREE/i, /PFAS COMPLIANT/i, /Zalo\/WeChat/i, /VAT CODE/i,
    // Contact info lines
    /Add(?:ress)?:/i, /^Tel:/i, /^Mobile:/i, /^Fax:/i, /^Email:/i,
    /^Website:/i, /^URL:/i, /^Group email:/i, /^TAX CODE/i, /^Contact:/i,
    // Address patterns
    /^\d{1,2}[A-Za-z]{3,} \d{6,}/i,
    /^1st Floor/i, /^Vista Building/i, /^Ho Chi Minh City/i, /^Vietnam$/i,
    // URLs
    /^https?:\/\/\S+$/i,
    // Separator lines
    /^--\s*$/i, /^_\s*$/i, /^-\s*$/i,
    // Inline media / CID markers
    /^\[img\]/i, /^\[cid:/i
  ];
  for (let line of lines) {
    const trimmed = line.trim();
    if (stopMarkers.some(m => m.test(trimmed))) break;
    if (trimmed === '' || /^[^a-zA-Z0-9]+$/.test(trimmed)) continue; // skip icon-only lines
    result.push(trimmed);
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
      tlsOptions: { rejectUnauthorized: false }, // security: validate SSL
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
      imap.end();
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
    console.log('[fetch-emails] START', { user: config.user, host: config.host, port: config.port, folder: config.folder, limit: config.limit });
    console.log('[fetch-emails] db instance:', db ? 'ok' : 'null');
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
    const parsePromises = [];
    let messagesExpected = 0;
    let done = false;

    imap.once('ready', () => {
      imap.openBox(folder, false, (err, box) => {
        if (err) {
          if (!done) {
            done = true;
            imap.end();
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
        messagesExpected = fetchCount;
        const fetch = imap.seq.fetch(`${box.messages.total - fetchCount + 1}:${box.messages.total}`, { bodies: '' });

        fetch.on('message', (msg) => {
          const p = new Promise((resolveParse) => {
            let buffer = '';
            msg.on('body', (stream) => {
              stream.on('data', (chunk) => buffer += chunk.toString());
            });

            msg.once('end', async () => {
              try {
                const parsed = await simpleParser(buffer, {
                  skipHtmlToText: false,
                  skipImageLinks: true,
                  maxBodyLength: 500000
                });
                let cleanBody = parsed.text || '';
                if (!cleanBody && parsed.html) {
                  cleanBody = stripHtml(parsed.html);
                }
                cleanBody = cleanEmailBody(cleanBody);
                emails.push({
                  id: parsed.messageId || `msg-${Date.now()}-${emails.length}`,
                  from: parsed.from?.text || '',
                  subject: parsed.subject || '',
                  body: cleanBody.substring(0, 5000),
                  date: parsed.date?.toISOString() || new Date().toISOString(),
                  messageId: parsed.messageId
                });
                console.log('[parse] completed email:', emails.length, '/', messagesExpected, '-', parsed.subject?.substring(0, 30));
              } catch (e) {
                console.error('Parse error:', e.message);
              } finally {
                resolveParse();
              }
            });
          });
          parsePromises.push(p);
        });

        fetch.once('end', async () => {
          console.log('[fetch-emails] fetch end event, waiting for', messagesExpected, 'messages to parse');
          try {
            // Wait for all parse promises to complete
            await Promise.all(parsePromises);
            console.log('[fetch-emails] all parse promises resolved, total emails:', emails.length);
          } catch (e) {
            console.error('[fetch-emails] parse error:', e);
          }

          // Save emails to Firestore using batch write with upsert (merge: true)
          if (emails.length > 0) {
            console.log('[fetch-emails] Starting Firestore batch save (upsert)');
            try {
              const userId = 'default-user-id';
              const batch = db.batch();
              let queuedCount = 0;

              for (const email of emails) {
                // Sanitize messageId for Firestore document ID
                let docId = email.messageId || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                if (docId) {
                  docId = docId.replace(/[<>]/g, '').replace(/[\/#?]/g, '');
                }
                const docRef = db.collection('emails').doc(docId);

                // Use merge: true to upsert (create if not exists, update if exists)
                batch.set(docRef, {
                  ...email,
                  userId: userId,
                  fetchedAt: new Date().toISOString()
                }, { merge: true });

                queuedCount++;
                console.log('[Firestore] Queued email for batch:', docId);
              }

              await batch.commit();
              console.log(`[fetch-emails] Firestore batch save complete: ${queuedCount} emails upserted`);
            } catch (e) {
              console.error('[Firestore] Save error:', e);
              // Fail the request if Firestore save fails
              return reject({ success: false, error: `Firestore save failed: ${e.message}` });
            }
          } else {
            console.log('[fetch-emails] No emails to save');
          }

          if (!done) {
            done = true;
            imap.end();
            resolve({ success: true, emails, total: box.messages.total });
          }
        });

        fetch.once('error', (err) => {
          if (!done) {
            done = true;
            imap.end();
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









. 
 
 