import admin from '../services/firebase-admin';
import { CachedEmail, UserConfig, Thread } from '../types';

const db = admin.firestore();

export class EmailService {
  /**
   * Lưu email vào Firestore cache.
   * Nếu email đã tồn tại (cùng messageId), update thay vì tạo mới.
   */
  async saveEmail(userId: string, email: Partial<CachedEmail>): Promise<string> {
    const emailRef = db.collection('cached_emails').doc();
    const data: CachedEmail = {
      userId,
      imapUid: email.imapUid!,
      messageId: email.messageId,
      threadId: email.threadId || `thread-${userId}-${Date.now()}`,
      subject: email.subject || '',
      from: email.from || { email: '' },
      to: email.to || [],
      cc: email.cc,
      date: email.date || new Date(),
      content: email.content || '',
      flags: email.flags || [],
      cachedAt: new Date(),
      syncedAt: new Date()
    };

    await emailRef.set(data);
    return emailRef.id;
  }

  /**
   * Kiểm tra xem email đã tồn tại chưa (dựa trên messageId hoặc imapUid).
   */
  async emailExists(userId: string, imapUid?: string, messageId?: string): Promise<boolean> {
    const emailCol = db.collection('cached_emails').where('userId', '==', userId);

    let query;
    if (imapUid) {
      query = emailCol.where('imapUid', '==', imapUid);
    } else if (messageId) {
      query = emailCol.where('messageId', '==', messageId);
    } else {
      return false;
    }

    const snapshot = await query.limit(1).get();
    return !snapshot.empty;
  }

  /**
   * Lấy emails từ Firestore với filter.
   */
  async getEmails(
    userId: string,
    since?: Date,
    before?: Date,
    status: 'all' | 'unread' | 'read' = 'all',
    limit: number = 100,
    offset: number = 0
  ): Promise<{ emails: CachedEmail[]; total: number }> {
    let query = db.collection('cached_emails').where('userId', '==', userId).orderBy('date', 'desc');

    if (since) {
      query = query.where('date', '>=', since);
    }
    if (before) {
      query = query.where('date', '<=', before);
    }
    if (status !== 'all') {
      const flag = status === 'unread' ? '\\Seen' : '\\Seen';
      const containsFlag = status === 'unread' ? 'array_contains' : 'array_contains';
      query = query[containsFlag]('flags', '\\Seen');
    }

    // Get total count
    const totalSnapshot = await query.count().get();
    const total = totalSnapshot.data().count;

    // Get paginated results
    const snapshot = await query.limit(limit).offset(offset).get();
    const emails = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as CachedEmail[];

    return { emails, total };
  }

  /**
   * Get single email by ID
   */
  async getEmailById(userId: string, emailId: string): Promise<CachedEmail | null> {
    const doc = await db.collection('cached_emails').doc(emailId).get();
    if (!doc.exists) return null;
    const data = doc.data() as CachedEmail;
    if (data.userId !== userId) return null;
    return { id: doc.id, ...data };
  }

  /**
   * Mark email as read/unread.
   * Lưu ý: chỉ update Firestore cache, không sync ngược IMAP (complexity).
   */
  async markEmail(userId: string, emailId: string, isRead: boolean): Promise<void> {
    const emailRef = db.collection('cached_emails').doc(emailId);
    const doc = await emailRef.get();

    if (!doc.exists || doc.data()?.userId !== userId) {
      throw new Error('Email not found');
    }

    const flags = doc.data().flags;
    if (isRead) {
      // Add \Seen
      if (!flags.includes('\\Seen')) {
        flags.push('\\Seen');
      }
    } else {
      // Remove \Seen
      const index = flags.indexOf('\\Seen');
      if (index > -1) {
        flags.splice(index, 1);
      }
    }

    await emailRef.update({ flags, syncedAt: new Date() });
  }
}

export const emailService = new EmailService();