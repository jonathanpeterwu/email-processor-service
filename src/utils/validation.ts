import { z } from 'zod';

// Environment variables validation schema
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(val => parseInt(val, 10)).default('3000'),
  
  // Database & Redis
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  
  // OAuth2 Credentials
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  YAHOO_CLIENT_ID: z.string().min(1),
  YAHOO_CLIENT_SECRET: z.string().min(1),
  
  // Security
  ENCRYPTION_KEY: z.string().min(32, 'Encryption key must be at least 32 characters'),
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  WEBHOOK_SECRET: z.string().min(16),
  
  // Service Configuration
  SYNC_INTERVAL_MINUTES: z.string().transform(val => parseInt(val, 10)).default('5'),
  MAX_EMAILS_PER_SYNC: z.string().transform(val => parseInt(val, 10)).default('100'),
  AI_CLASSIFICATION_THRESHOLD: z.string().transform(val => parseFloat(val)).default('0.8'),
  
  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  
  // Optional AI Services
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type Environment = z.infer<typeof envSchema>;

// Request validation schemas
export const schemas = {
  // Auth route params
  accountId: z.object({
    accountId: z.string().cuid('Invalid account ID format'),
  }),
  
  // OAuth callback query
  oauthCallback: z.object({
    code: z.string().optional(),
    state: z.string(),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }),
  
  // User creation
  userCreate: z.object({
    email: z.string().email(),
    name: z.string().min(1).max(100).optional(),
  }),
  
  // Email sync options
  emailSync: z.object({
    maxEmails: z.number().int().min(1).max(1000).default(100),
    since: z.string().datetime().optional(),
    labelIds: z.array(z.string()).optional(),
  }),
};

// Standard error response format
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
  requestId?: string;
}

// Create standardized error response
export function createErrorResponse(
  code: string,
  message: string,
  details?: any,
  requestId?: string
): ErrorResponse {
  return {
    error: {
      code,
      message,
      details,
    },
    timestamp: new Date().toISOString(),
    requestId,
  };
}