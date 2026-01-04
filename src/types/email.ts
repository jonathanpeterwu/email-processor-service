export interface EmailHeaders {
  [key: string]: string | string[] | undefined;
  'message-id'?: string;
  'thread-id'?: string;
  'list-unsubscribe'?: string;
  'list-id'?: string;
  'precedence'?: string;
  'from'?: string;
  'to'?: string | string[];
  'cc'?: string | string[];
  'bcc'?: string | string[];
  'subject'?: string;
  'date'?: string;
}

export interface EmailMessage {
  id: string;
  messageId: string;
  threadId?: string;
  headers: EmailHeaders;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body: {
    text?: string;
    html?: string;
  };
  snippet?: string;
  attachments?: EmailAttachment[];
  receivedAt: Date;
  labels?: string[];
  flags?: string[];
  raw?: string;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
}

export interface ProcessedEmail extends EmailMessage {
  category?: EmailCategory;
  subcategories?: string[];
  isNewsletter: boolean;
  hasTodos: boolean;
  priority: number;
  confidence: number;
  extractedTodos?: ExtractedTodo[];
  unsubscribeInfo?: UnsubscribeInfo;
}

export interface EmailCategory {
  primary: 'personal' | 'work' | 'transactional' | 'newsletter' | 'marketing' | 'spam';
  secondary: string[];
  confidence: number;
  signals: {
    senderDomain: string;
    listHeaders: boolean;
    unsubscribeLink: boolean;
    keywords: string[];
    llmClassification?: string;
  };
}

export interface ExtractedTodo {
  id: string;
  title: string;
  description?: string;
  dueDate?: Date;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  confidence: number;
  context: {
    extractedFrom: string;
    lineNumber?: number;
    sentence?: string;
  };
}

export interface UnsubscribeInfo {
  method: 'link' | 'email' | 'list-unsubscribe' | 'none';
  url?: string;
  email?: string;
  confidence: number;
}

export interface SyncOptions {
  accountId: string;
  maxEmails?: number;
  since?: Date;
  labelIds?: string[];
  query?: string;
}

export interface SyncResult {
  totalFetched: number;
  totalProcessed: number;
  todosExtracted: number;
  errors: string[];
  duration: number;
}