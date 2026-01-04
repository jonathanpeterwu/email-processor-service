// Database query result types
export interface EmailWithAccount {
  id: string;
  messageId: string;
  threadId?: string;
  subject: string;
  sender: string;
  recipients: string[];
  body?: string;
  snippet?: string;
  isRead: boolean;
  category?: string;
  subcategories?: string[];
  isNewsletter?: boolean;
  hasTodos?: boolean;
  priority?: string;
  receivedAt: Date;
  account: {
    provider: string;
    email: string;
  };
}

export interface EmailSyncResult {
  totalFetched: number;
  totalProcessed: number;
  todosExtracted: number;
  errors: string[];
  duration: number;
}

export interface SyncHistoryWithAccount {
  id: string;
  accountId: string;
  syncType: string;
  status: string;
  startedAt: Date;
  completedAt?: Date;
  emailsFetched?: number;
  emailsProcessed?: number;
  todosExtracted?: number;
  errorMessage?: string;
  account: {
    provider: string;
    email: string;
  };
}

export interface DatabaseConditions {
  account: {
    userId: string;
  };
  category?: string;
  OR?: Array<{
    subject?: { contains: string; mode: 'insensitive' };
    sender?: { contains: string; mode: 'insensitive' };
    body?: { contains: string; mode: 'insensitive' };
  }>;
}