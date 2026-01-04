import dotenv from 'dotenv';
dotenv.config();

import Fastify from 'fastify';
import pino from 'pino';
import { envSchema, Environment } from './utils/validation';

// Import route handlers
import { authRoutes } from './api/auth';
import { emailRoutes } from './api/emails';
import { todoRoutes } from './api/todos';
import { healthRoutes } from './api/health';

// Import services
import { DatabaseService } from './db/database';
import { RedisService } from './db/redis';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

const fastify = Fastify({
  logger: true,
  trustProxy: true,
});

async function start() {
  // Validate environment variables
  let env: Environment;
  try {
    env = envSchema.parse(process.env);
    logger.info('✅ Environment variables validated');
  } catch (error) {
    logger.error('❌ Invalid environment variables:', error);
    process.exit(1);
  }

  // Register CORS
  await fastify.register(import('@fastify/cors'), {
    origin: true,
    credentials: true,
  });

  // Register JWT
  await fastify.register(import('@fastify/jwt'), {
    secret: env.JWT_SECRET,
  });
  try {
    // Initialize database connections
    const dbService = new DatabaseService();
    await dbService.connect();
    
    const redisService = new RedisService();
    await redisService.connect();

    // Register route handlers
    await fastify.register(healthRoutes, { prefix: '/health' });
    await fastify.register(authRoutes, { prefix: '/auth' });
    await fastify.register(emailRoutes, { prefix: '/api/emails' });
    await fastify.register(todoRoutes, { prefix: '/api/todos' });

    // Start the server
    const host = env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
    
    await fastify.listen({ port: env.PORT, host });
    
    logger.info(`🚀 Email Processing Service running on http://${host}:${env.PORT}`);
    logger.info(`📊 Health check available at http://${host}:${env.PORT}/health`);
    
    // Store service instances for cleanup
    fastify.decorate('dbService', dbService);
    fastify.decorate('redisService', redisService);
    
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Handle graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully`);
  
  try {
    // Close server first to stop accepting new requests
    await fastify.close();
    
    // Clean up database and Redis connections
    if (fastify.hasDecorator('dbService')) {
      await (fastify as any).dbService.disconnect();
    }
    
    if (fastify.hasDecorator('redisService')) {
      await (fastify as any).redisService.disconnect();
    }
    
    logger.info('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('❌ Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

start();