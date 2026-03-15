// Email metadata từ IMAP server
export interface ImapEmailMetadata {
  uid: string;
  messageId?: string;
  subject: string;
  from: {
    name?: string;
    email: string;
  };
  date: Date;
  flags: string[];
}

// Email đã lưu trong Firestore
export interface CachedEmail {
  userId: string;
  imapUid: string;
  messageId?: string;
  threadId: string;
  subject: string;
  from: {
    name?: string;
    email: string;
  };
  to: Array<{ name?: string; email: string }>;
  cc?: Array<{ name?: string; email: string }>;
  date: Date;
  content: string; // plain text only
  flags: string[];
  cachedAt: Date;
  syncedAt: Date;
}

// IMAP configuration của user
export interface ImapConfig {
  host: string;
  port: number;
  username: string;
  password: string; // encrypted bằng server
  secure: boolean; // true cho SSL (port 993), false cho STARTTLS (port 143)
  tlsOptions?: {
    rejectUnauthorized?: boolean;
  };
}

// User config trong Firestore
export interface UserConfig {
  userId: string;
  imap: ImapConfig;
  fetchOptions?: {
    since?: Date; // filter from date
    before?: Date; // filter before date
    status: 'all' | 'unread' | 'read';
  };
  createdAt: Date;
  updatedAt: Date;
}

// Thread grouping
export interface Thread {
  threadId: string;
  userId: string;
  subject: string;
  participants: string[]; // unique emails
  lastEmailAt: Date;
  emailCount: number;
  unreadCount: number;
  emailIds: string[]; // array of CachedEmail IDs (doc IDs)
  createdAt: Date;
  updatedAt: Date;
}

// API responses
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedEmails extends ApiResponse<CachedEmail[]> {
  total: number;
  page: number;
  limit: number;
}