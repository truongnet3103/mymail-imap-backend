import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { threadService } from '../services/thread.service';

const router = Router();

/**
 * GET /api/threads
 * Get list of threads (Gộp mode).
 * Same filters as emails.
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { since, before, status = 'all', limit = 50 } = req.query;

    const sinceDate = since ? new Date(since as string) : undefined;
    const beforeDate = before ? new Date(before as string) : undefined;

    const threads = await threadService.getThreads(
      userId,
      sinceDate,
      beforeDate,
      status as 'all' | 'unread' | 'read',
      Number(limit)
    );

    res.json({
      success: true,
      data: threads,
      total: threads.length
    });
  } catch (error: any) {
    console.error('Error fetching threads:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch threads'
    });
  }
});

/**
 * GET /api/threads/:threadId
 * Get all emails in a specific thread.
 */
router.get('/:threadId', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { threadId } = req.params;

    const emails = await threadService.getThreadEmails(userId, threadId);

    res.json({
      success: true,
      data: emails,
      total: emails.length
    });
  } catch (error: any) {
    console.error('Error fetching thread:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch thread'
    });
  }
});

export default router;