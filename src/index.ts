import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeFirebaseAdmin } from './services/firebase-admin';

// Load .env FIRST
dotenv.config();

// Initialize Firebase Admin BEFORE any other imports that use it
initializeFirebaseAdmin();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Now import routes (Firebase is already initialized)
import { authenticateToken } from './middleware/auth';
import configRoutes from './routes/config';
import emailRoutes from './routes/emails';
import threadRoutes from './routes/threads';

// API routes (all protected)
app.use('/api/config', authenticateToken, configRoutes);
app.use('/api/emails', authenticateToken, emailRoutes);
app.use('/api/threads', authenticateToken, threadRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 MyMail IMAP Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;