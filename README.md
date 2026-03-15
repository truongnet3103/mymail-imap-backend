# mymail-imap-backend

Backend API for mymail-imap email client.

## Features

- IMAP email fetching via `imapflow`
- Email parsing with `mailparser`
- Firebase Firestore caching
- Thread grouping (reply chains)
- Firebase Auth integration
- Multi-user support

## Tech Stack

- Node.js 18+
- Express + TypeScript
- Firebase Admin SDK
- imapflow + mailparser

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Environment

Copy `.env.example` to `.env` and fill:

```env
FIREBASE_SERVICE_ACCOUNT_KEY_PATH=./service-account-key.json
PORT=3001
NODE_ENV=production
CORS_ORIGIN=http://localhost:3000
```

**Firebase service account key:** Download from Firebase Console → Project Settings → Service Accounts → Generate new private key. Save as `service-account-key.json` in backend folder.

### 3. Firebase Firestore Rules

Deploy security rules (see `firestore.rules` in main repo):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User configs: only owner can read/write
    match /user_configs/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    // Cached emails: only owner
    match /cached_emails/{emailId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
    }
    // Threads: only owner
    match /threads/{threadId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}
```

### 4. Build & Run

```bash
# Development (with watch)
bun run dev

# Build for production
bun run build

# Production
bun run start
```

## API Endpoints

All endpoints require Firebase ID token in `Authorization: Bearer <token>`.

### Config

- `GET /api/config` — Get user's IMAP config
- `POST /api/config` — Save IMAP config
- `DELETE /api/config` — Delete config

### Emails

- `POST /api/emails/fetch` — Trigger fetch from IMAP server
- `GET /api/emails` — List cached emails
- `GET /api/emails/:id` — Get email by ID
- `POST /api/emails/:id/read` — Mark as read
- `POST /api/emails/:id/unread` — Mark as unread

### Threads

- `GET /api/threads` — Get thread list (Gộp mode)
- `GET /api/threads/:threadId` — Get emails in thread

## Deployment (Vercel)

This backend is configured for Vercel. Just connect your GitHub repo (`truongnet3103/mymail-imap-backend`) and Vercel will auto-deploy on push to `main`.

Ensure environment variables are set in Vercel:
- `FIREBASE_SERVICE_ACCOUNT_KEY_PATH` (upload file via Vercel secrets or embed as env var)
- `NODE_ENV=production`
- `CORS_ORIGIN` (your frontend URL)

## Email Storage Policy

Only plain text content is stored. HTML bodies and attachments are discarded to save storage and simplify processing.

## Thread Grouping

Thread IDs are derived from Message-ID header. If Message-ID is missing, a fallback ID is generated based on sender and timestamp (may not group correctly).