export type EmailCategory = 
  | 'newsletter'
  | 'social'
  | 'promotional'
  | 'work'
  | 'personal'
  | 'finance'
  | 'travel'
  | 'shopping'
  | 'support'
  | 'spam'
  | 'important'
  | 'todo'
  | 'other';

export type TodoPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'snoozed';

export interface EmailClassificationResult {
  category: EmailCategory;
  subcategories: string[];
  confidence: number;
  isNewsletter: boolean;
  priority: TodoPriority | null;
  reasoning: string;
}

export interface TodoItem {
  id: string;
  emailId: string;
  title: string;
  description: string;
  priority: TodoPriority;
  status: TodoStatus;
  dueDate?: Date;
  extractedAt: Date;
  confidence: number;
  context: string;
  actionKeywords: string[];
  snoozedUntil?: Date;
  completedAt?: Date;
}

export interface TodoExtractionResult {
  todos: Omit<TodoItem, 'id' | 'emailId' | 'extractedAt'>[];
  hasTodos: boolean;
  confidence: number;
  reasoning: string;
}

export interface ProcessingMetadata {
  processedAt: Date;
  processingVersion: string;
  tokensUsed: number;
  processingTime: number;
  errors?: string[];
}

export interface CategoryPatterns {
  keywords: string[];
  senderPatterns: string[];
  subjectPatterns: string[];
  bodyPatterns: string[];
  domainPatterns: string[];
}

export interface NewsletterDetectionResult {
  isNewsletter: boolean;
  confidence: number;
  unsubscribeLinks: string[];
  listId?: string;
  senderReputation: 'trusted' | 'suspicious' | 'unknown';
  frequency: 'daily' | 'weekly' | 'monthly' | 'irregular' | 'unknown';
}

export interface AIProcessingConfig {
  enableCategorization: boolean;
  enableTodoExtraction: boolean;
  enableNewsletterDetection: boolean;
  maxTokensPerEmail: number;
  confidenceThreshold: number;
  batchSize: number;
}