import { z } from 'zod';

export const emailCategorySchema = z.enum([
  'newsletter',
  'social', 
  'promotional',
  'work',
  'personal',
  'finance',
  'travel',
  'shopping',
  'support',
  'spam',
  'important',
  'todo',
  'other'
]);

export const todoPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export const todoStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'cancelled', 'snoozed']);

export const aiProcessingConfigSchema = z.object({
  enableCategorization: z.boolean().default(true),
  enableTodoExtraction: z.boolean().default(true),
  enableNewsletterDetection: z.boolean().default(true),
  maxTokensPerEmail: z.number().int().min(1000).max(10000).default(4000),
  confidenceThreshold: z.number().min(0).max(1).default(0.5),
  batchSize: z.number().int().min(1).max(50).default(10)
});

export const todoQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: todoStatusSchema.optional(),
  priority: todoPrioritySchema.optional(),
  dueBefore: z.coerce.date().optional(),
  dueAfter: z.coerce.date().optional(),
  search: z.string().min(1).optional()
});

export const todoCreateSchema = z.object({
  emailId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000),
  priority: todoPrioritySchema.default('medium'),
  dueDate: z.coerce.date().optional(),
  context: z.string().optional()
});

export const todoUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  priority: todoPrioritySchema.optional(),
  status: todoStatusSchema.optional(),
  dueDate: z.coerce.date().nullable().optional(),
  snoozedUntil: z.coerce.date().nullable().optional()
});

export const todoParamsSchema = z.object({
  todoId: z.string().uuid()
});

export const categoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  category: emailCategorySchema.optional(),
  isNewsletter: z.coerce.boolean().optional(),
  priority: todoPrioritySchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional()
});

export const emailReprocessSchema = z.object({
  emailId: z.string().uuid(),
  enableCategorization: z.boolean().default(true),
  enableTodoExtraction: z.boolean().default(true)
});

export const batchProcessSchema = z.object({
  emailIds: z.array(z.string().uuid()).min(1).max(100),
  config: aiProcessingConfigSchema.partial().optional()
});

export const newsletterQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  senderDomain: z.string().optional(),
  hasUnsubscribeLink: z.coerce.boolean().optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'irregular']).optional()
});