import { Thread, CachedEmail } from '../types';
import { emailService } from './email.service';

export class ThreadService {
  /**
   * Compute threadId từ email headers.
   * Algorithm:
   * - Nếu email có References, lấy đầu tiên (root)
   * - Nếu có In-Reply-To, dùng In-Reply-To
   * - Nếu có Message-ID, dùng Message-ID (unique thread)
   * - Nếu không có gì, tạo UUID mới
   */
  computeThreadId(email: Partial<CachedEmail>): string {
    const { messageId, from } = email;

    // Prefer References header (chưa lưu, nhưng có thể parse từ raw)
    // Hiện tại chỉ dùng Message-ID hoặc fallback
    if (messageId) {
      return messageId;
    }

    // Fallback: hash từ subject + from (less accurate)
    const fallback = `thread-${from?.email}-${Date.now()}`;
    return fallback;
  }

  /**
   * Fetch và group emails thành threads.
   * Query emails từ Firestore, sau đó.group by threadId.
   */
  async getThreads(
    userId: string,
    since?: Date,
    before?: Date,
    status: 'all' | 'unread' | 'read' = 'all',
    limit: number = 50
  ): Promise<Thread[]> {
    const { emails } = await emailService.getEmails(userId, since, before, status, 500);

    // Group by threadId
    const threadMap = new Map<string, Thread & { emailIds: string[] }>();

    for (const email of emails) {
      const threadId = email.threadId || this.computeThreadId(email);

      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, {
          threadId,
          userId,
          subject: email.subject,
          participants: [email.from.email],
          lastEmailAt: email.date,
          emailCount: 0,
          unreadCount: 0,
          emailIds: [],
          createdAt: email.date,
          updatedAt: email.date
        });
      }

      const thread = threadMap.get(threadId)!;
      thread.emailIds.push(email.id);
      thread.emailCount++;
      if (!email.flags.includes('\\Seen')) {
        thread.unreadCount++;
      }
      if (email.date > thread.lastEmailAt) {
        thread.lastEmailAt = email.date;
      }
      // Add participants
      email.to?.forEach(to => {
        if (!thread.participants.includes(to.email)) {
          thread.participants.push(to.email);
        }
      });
      email.cc?.forEach(cc => {
        if (!thread.participants.includes(cc.email)) {
          thread.participants.push(cc.email);
        }
      });
    }

    // Convert to array and sort by lastEmailAt desc
    const threads = Array.from(threadMap.values()).sort((a, b) => b.lastEmailAt.getTime() - a.lastEmailAt.getTime());

    return threads.slice(0, limit);
  }

  /**
   * Get all emails trong một thread.
   */
  async getThreadEmails(userId: string, threadId: string): Promise<CachedEmail[]> {
    const { emails } = await emailService.getEmails(userId);
    return emails.filter(e => e.threadId === threadId).sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}

export const threadService = new ThreadService();