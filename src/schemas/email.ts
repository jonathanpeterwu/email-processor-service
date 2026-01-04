import { z } from 'zod';

// Email API validation schemas
export const emailQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  category: z.string().optional(),
  search: z.string().min(1).optional(),
});

export const emailSyncSchema = z.object({
  accountId: z.string().min(1).optional(),
  maxEmails: z.coerce.number().int().min(1).max(1000).default(100),
});

export const emailParamsSchema = z.object({
  emailId: z.string().min(1),
});

export const syncHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type EmailQuery = z.infer<typeof emailQuerySchema>;
export type EmailSync = z.infer<typeof emailSyncSchema>;
export type EmailParams = z.infer<typeof emailParamsSchema>;
export type SyncHistoryQuery = z.infer<typeof syncHistoryQuerySchema>;