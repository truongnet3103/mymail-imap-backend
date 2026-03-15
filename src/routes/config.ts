import { Router, Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { UserConfig } from '../types';
import { emailService } from '../services/email.service';

const router = Router();

/**
 * GET /api/config
 * Lấy IMAP config của user.
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const configRef = emailService.getFirestore()
      .collection('user_configs')
      .doc(userId);

    const doc = await configRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Config not found. Please set up IMAP configuration.'
      });
    }

    const config = doc.data() as UserConfig;
    // Never send back raw password to client
    const safeConfig = {
      ...config,
      imap: {
        ...config.imap,
        password: '***' // masked
      }
    };

    res.json({
      success: true,
      data: safeConfig
    });
  } catch (error: any) {
    console.error('Error fetching config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch config'
    });
  }
});

/**
 * POST /api/config
 * Lưu IMAP config của user.
 * Body: { imap: { host, port, username, password, secure } }
 */
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { imap } = req.body;

    if (!imap || !imap.host || !imap.port || !imap.username || !imap.password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required IMAP fields'
      });
    }

    const configRef = emailService.getFirestore()
      .collection('user_configs')
      .doc(userId);

    const configData: UserConfig = {
      userId,
      imap: {
        host: imap.host,
        port: imap.port,
        username: imap.username,
        password: imap.password, // In production, encrypt this!
        secure: imap.secure ?? true,
        tlsOptions: { rejectUnauthorized: false }
      },
      fetchOptions: {
        status: 'all'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await configRef.set(configData, { merge: true });

    res.json({
      success: true,
      message: 'Config saved',
      data: {
        imap: {
          host: configData.imap.host,
          port: configData.imap.port,
          username: configData.imap.username,
          secure: configData.imap.secure
        }
      }
    });
  } catch (error: any) {
    console.error('Error saving config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save config'
    });
  }
});

/**
 * DELETE /api/config
 * Xóa IMAP config của user.
 */
router.delete('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const configRef = emailService.getFirestore()
      .collection('user_configs')
      .doc(userId);

    await configRef.delete();

    res.json({
      success: true,
      message: 'Config deleted'
    });
  } catch (error: any) {
    console.error('Error deleting config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete config'
    });
  }
});

export default router;