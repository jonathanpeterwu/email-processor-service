import { PrismaClient } from '@prisma/client';
import pino from 'pino';

const logger = pino().child({ module: 'DatabaseService' });

export class DatabaseService {
  private static instance: DatabaseService;
  public prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'stdout',
          level: 'error',
        },
        {
          emit: 'stdout',
          level: 'info',
        },
        {
          emit: 'stdout',
          level: 'warn',
        },
      ],
    });

    // Log queries in development
    // Note: $on is deprecated in newer Prisma versions
    // Use log level configuration in PrismaClient constructor instead
  }

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      logger.info('✅ Connected to database');
    } catch (error) {
      logger.error('❌ Failed to connect to database', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      logger.info('📴 Disconnected from database');
    } catch (error) {
      logger.error('❌ Error disconnecting from database', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('Database health check failed', error);
      return false;
    }
  }
}