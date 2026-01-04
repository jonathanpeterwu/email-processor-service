import rateLimit from '@fastify/rate-limit';
import { FastifyInstance } from 'fastify';

export const setupRateLimit = async (fastify: FastifyInstance) => {
  // Register rate limiting plugin
  await fastify.register(rateLimit, {
    global: false, // We'll apply it selectively
  });

  // OAuth endpoints - strict limits
  await fastify.register(async (fastify) => {
    await fastify.register(rateLimit, {
      max: 5, // 5 attempts
      timeWindow: '15 minutes',
      errorResponseBuilder: () => {
        return {
          error: 'RateLimitExceeded',
          message: 'Too many OAuth attempts. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED',
          statusCode: 429
        };
      }
    });

    fastify.get('/auth/gmail', async () => {});
    fastify.get('/auth/yahoo', async () => {});
    fastify.get('/auth/gmail/callback', async () => {});
    fastify.get('/auth/yahoo/callback', async () => {});
  });

  // Email sync endpoints - moderate limits
  await fastify.register(async (fastify) => {
    await fastify.register(rateLimit, {
      max: 10, // 10 sync requests
      timeWindow: '1 hour',
      errorResponseBuilder: () => {
        return {
          error: 'RateLimitExceeded',
          message: 'Too many sync requests. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED',
          statusCode: 429
        };
      }
    });

    fastify.post('/api/emails/sync', async () => {});
  });

  // General API endpoints - generous limits
  await fastify.register(async (fastify) => {
    await fastify.register(rateLimit, {
      max: 100, // 100 requests
      timeWindow: '1 minute',
      errorResponseBuilder: () => {
        return {
          error: 'RateLimitExceeded',
          message: 'Too many requests. Please slow down.',
          code: 'RATE_LIMIT_EXCEEDED', 
          statusCode: 429
        };
      }
    });

    fastify.get('/api/emails', async () => {});
    fastify.get('/api/emails/:emailId', async () => {});
    fastify.get('/api/emails/sync/history', async () => {});
    fastify.get('/auth/accounts', async () => {});
    fastify.delete('/auth/accounts/:accountId', async () => {});
  });
};