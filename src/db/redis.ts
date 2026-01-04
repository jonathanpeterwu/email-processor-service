import Redis from 'ioredis';
import pino from 'pino';

const logger = pino().child({ module: 'RedisService' });

export class RedisService {
  private static instance: RedisService;
  public client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL!, {
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.client.on('connect', () => {
      logger.info('✅ Connected to Redis');
    });

    this.client.on('error', (err) => {
      logger.error('❌ Redis connection error', err);
    });

    this.client.on('ready', () => {
      logger.info('🔄 Redis is ready');
    });
  }

  static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      logger.error('Failed to connect to Redis', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      logger.info('📴 Disconnected from Redis');
    } catch (error) {
      logger.error('❌ Error disconnecting from Redis', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed', error);
      return false;
    }
  }

  // Cache utilities
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Error getting key ${key}`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (error) {
      logger.error(`Error setting key ${key}`, error);
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      logger.error(`Error deleting key ${key}`, error);
      return false;
    }
  }
}