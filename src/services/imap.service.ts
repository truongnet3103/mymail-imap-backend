import { ImapFlow, ImapMessage } from 'imapflow';
import { simpleParser } from 'mailparser';
import { ImapConfig, ImapEmailMetadata, CachedEmail } from '../types';
import { v4 as uuidv4 } from 'crypto'; // Node crypto for UUID

export class ImapService {
  private client: ImapFlow;

  constructor(config: ImapConfig) {
    this.client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        username: config.username,
        password: config.password
      },
      tls: config.tlsOptions || { rejectUnauthorized: false }
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
    console.log('IMAP connected');
  }

  async disconnect(): Promise<void> {
    await this.client.logout();
    console.log('IMAP disconnected');
  }

  /**
   * Fetch emails từ IMAP server theo criteria.
   * Chỉ lấy sender, subject, plain text content.
   */
  async fetchEmails(
    since?: Date,
    before?: Date,
    status: 'all' | 'unread' | 'read' = 'all',
    limit: number = 100
  ): Promise<ImapEmailMetadata[]> {
    // Build search criteria
    const criteria: any = {};

    if (since) {
      criteria.since = since;
    }
    if (before) {
      criteria.before = before;
    }

    // Flag filtering
    if (status === 'unread') {
      criteria.unseen = true;
    } else if (status === 'read') {
      criteria.seen = true;
    }
    // 'all' = no flag filter

    // Get mailbox (INBOX mặc định)
    const mailbox = 'INBOX';

    // Search message IDs
    const messageIds = await this.client.search(mailbox, criteria);

    if (messageIds.length === 0) {
      return [];
    }

    // Take latest 'limit' emails (IMAP server trả về ascending)
    const fetchIds = messageIds.slice(-limit);

    const emails: ImapEmailMetadata[] = [];

    // Fetch each email
    for (const id of fetchIds) {
      try {
        const message = await this.client.download(mailbox, id, {
          structure: true,
          // Chỉ fetch headers và text body, bỏ attachments
          // envelope: ['subject', 'from', 'date', 'messageId'],
          // body: 'text' // automatic
        });

        if (!message) continue;

        const parsed = await simpleParser(message.raw);

        const from = parsed.from?.text ? parsed.from.text : parsed.from?.value?.[0]?.address || '';
        const fromEmail = parsed.from?.value?.[0]?.address || '';
        const fromName = parsed.from?.value?.[0]?.name || '';

        const flags = message.flags || [];

        emails.push({
          uid: id,
          messageId: parsed.messageId || undefined,
          subject: parsed.subject || '',
          from: {
            email: fromEmail,
            name: fromName
          },
          date: parsed.date || new Date(),
          flags
        });
      } catch (err) {
        console.error(`Failed to fetch email ${id}:`, err);
      }
    }

    return emails;
  }

  /**
   * Fetch full email content (plain text only) cho một message.
   */
  async fetchEmailContent(uid: string): Promise<{ text: string; html?: string } | null> {
    try {
      const message = await this.client.download('INBOX', uid, {
        structure: true
      });

      if (!message) return null;

      const parsed = await simpleParser(message.raw);

      // Return plain text only as per requirement
      const text = parsed.text || '';
      const html = parsed.html; // keep for optional use

      return { text, html };
    } catch (err) {
      console.error(`Failed to fetch email content ${uid}:`, err);
      return null;
    }
  }
}