import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { emailService } from '../services/email.service';
import { ImapService } from '../services/imap.service';
import { UserConfig } from '../types';

const router = Router();

/**
 * POST /api/emails/fetch
 * Trigger fetch emails từ IMAP server và lưu vào Firestore cache.
 * Query params: ?limit=100&status=unread&since=2025-01-01&before=2025-12-31
 */
router.post('/fetch', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { limit = 100, status = 'all', since, before } = req.query;

    // 1. Get IMAP config
    const configRef = emailService.getFirestore()
      .collection('user_configs')
      .doc(userId);
    const configDoc = await configRef.get();

    if (!configDoc.exists) {
      return res.status(400).json({
        success: false,
        error: 'IMAP config not set. Please configure IMAP first.'
      });
    }

    const config = configDoc.data() as UserConfig;

    // 2. Connect to IMAP
    const imapService = new ImapService(config.imap);
    await imapService.connect();

    try {
      // 3. Fetch email metadata
      const sinceDate = since ? new Date(since as string) : undefined;
      const beforeDate = before ? new Date(before as string) : undefined;

      const imapEmails = await imapService.fetchEmails(
        sinceDate,
        beforeDate,
        status as 'all' | 'unread' | 'read',
        Number(limit)
      );

      console.log(`Fetched ${imapEmails.length} emails from IMAP`);

      // 4. For each email, fetch full content and save to Firestore
      let savedCount = 0;
      let skippedCount = 0;

      for (const imapEmail of imapEmails) {
        // Check duplicate by imapUid
        const exists = await emailService.emailExists(userId, imapEmail.uid);
        if (exists) {
          skippedCount++;
          continue;
        }

        // Fetch full content
        const content = await imapService.fetchEmailContent(imapEmail.uid);
        if (!content) {
          console.warn(`No content for email ${imapEmail.uid}`);
          continue;
        }

        // Compute threadId (simple: use messageId if available)
        const threadId = imapEmail.messageId || `thread-${userId}-${Date.now()}`;

        // Save to Firestore
        await emailService.saveEmail(userId, {
          imapUid: imapEmail.uid,
          messageId: imapEmail.messageId,
          threadId,
          subject: imapEmail.subject,
          from: imapEmail.from,
          date: imapEmail.date,
          flags: imapEmail.flags,
          content: content.text
        });

        savedCount++;
      }

      res.json({
        success: true,
        message: `Fetch complete: ${savedCount} saved, ${skippedCount} skipped`,
        data: {
          fetched: imapEmails.length,
          saved: savedCount,
          skipped: skippedCount
        }
      });
    } finally {
      await imapService.disconnect();
    }
  } catch (error: any) {
    console.error('Error fetching emails:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch emails'
    });
  }
});

/**
 * GET /api/emails
 * List cached emails with filtering.
 * Query: ?since=...&before=...&status=all|unread|read&limit=100&offset=0
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { since, before, status = 'all', limit = 50, offset = 0 } = req.query;

    const sinceDate = since ? new Date(since as string) : undefined;
    const beforeDate = before ? new Date(before as string) : undefined;

    const result = await emailService.getEmails(
      userId,
      sinceDate,
      beforeDate,
      status as 'all' | 'unread' | 'read',
      Number(limit),
      Number(offset)
    );

    res.json({
      success: true,
      data: result.emails,
      total: result.total,
      page: Number(offset) / Number(limit) + 1,
      limit: Number(limit)
    });
  } catch (error: any) {
    console.error('Error listing emails:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list emails'
    });
  }
});

/**
 * GET /api/emails/:id
 * Get single email by Firestore doc ID.
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const email = await emailService.getEmailById(userId, id);
    if (!email) {
      return res.status(404).json({
        success: false,
        error: 'Email not found'
      });
    }

    res.json({
      success: true,
      data: email
    });
  } catch (error: any) {
    console.error('Error fetching email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch email'
    });
  }
});

/**
 * POST /api/emails/:id/read
 * Mark email as read.
 */
router.post('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    await emailService.markEmail(userId, id, true);

    res.json({ success: true, message: 'Marked as read' });
  } catch (error: any) {
    console.error('Error marking read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark as read'
    });
  }
});

/**
 * POST /api/emails/:id/unread
 * Mark email as unread.
 */
router.post('/:id/unread', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    await emailService.markEmail(userId, id, false);

    res.json({ success: true, message: 'Marked as unread' });
  } catch (error: any) {
    console.error('Error marking unread:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark as unread'
    });
  }
});

export default router;