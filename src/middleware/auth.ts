import { Request, Response, NextFunction } from 'express';
import admin from '../services/firebase-admin';

export interface AuthRequest extends Request {
  userId?: string;
}

/**
 * Middleware xác thực Firebase ID token.
 * Client gửi token trong header: Authorization: Bearer <token>
 */
export async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Missing or invalid authorization header'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.userId = decodedToken.uid;
    next();
  } catch (error: any) {
    console.error('Auth error:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
}