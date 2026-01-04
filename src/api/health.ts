import { FastifyPluginAsync } from 'fastify';
import { DatabaseService } from '../db/database';
import { RedisService } from '../db/redis';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Basic health check
  fastify.get('/', async () => {
    return { 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      service: 'email-processor-service',
      version: process.env.npm_package_version || '1.0.0'
    };
  });

  // Detailed health check
  fastify.get('/detailed', async (_, reply) => {
    const dbService = DatabaseService.getInstance();
    const redisService = RedisService.getInstance();

    const [dbHealth, redisHealth] = await Promise.all([
      dbService.healthCheck(),
      redisService.healthCheck(),
    ]);

    const health = {
      status: dbHealth && redisHealth ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'email-processor-service',
      version: process.env.npm_package_version || '1.0.0',
      dependencies: {
        database: dbHealth ? 'ok' : 'error',
        redis: redisHealth ? 'ok' : 'error',
      },
      environment: process.env.NODE_ENV || 'development',
    };

    const statusCode = health.status === 'ok' ? 200 : 503;
    return reply.status(statusCode).send(health);
  });

  // Readiness check (for Railway/k8s)
  fastify.get('/ready', async (_, reply) => {
    const dbService = DatabaseService.getInstance();
    const redisService = RedisService.getInstance();

    try {
      const [dbHealth, redisHealth] = await Promise.all([
        dbService.healthCheck(),
        redisService.healthCheck(),
      ]);

      if (dbHealth && redisHealth) {
        return { status: 'ready' };
      } else {
        return reply.status(503).send({ status: 'not_ready' });
      }
    } catch (error) {
      fastify.log.error({ error }, 'Readiness check failed');
      return reply.status(503).send({ status: 'not_ready', error: 'Health check failed' });
    }
  });

  // Liveness check (for Railway/k8s)
  fastify.get('/live', async () => {
    return { status: 'alive', timestamp: new Date().toISOString() };
  });
};