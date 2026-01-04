import { FastifyPluginAsync } from 'fastify';
import { DatabaseService } from '../db/database';
import { GmailFetcherService } from '../services/gmail-fetcher';
import { YahooFetcherService } from '../services/yahoo-fetcher';
import { emailQuerySchema, emailSyncSchema, emailParamsSchema, syncHistoryQuerySchema } from '../schemas/email';
import { ValidationError, NotFoundError, handleError } from '../types/errors';
import { DatabaseConditions } from '../types/database';
import { getAuthenticatedUser } from '../utils/auth';
import pino from 'pino';

const logger = pino().child({ module: 'EmailRoutes' });

export const emailRoutes: FastifyPluginAsync = async (fastify) => {
  const dbService = DatabaseService.getInstance();
  const gmailFetcher = new GmailFetcherService();
  const yahooFetcher = new YahooFetcherService();

  // Get emails for a user
  fastify.get('/', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const user = getAuthenticatedUser(request);
      const userId = user.userId;
      
      // Validate and parse query parameters
      const queryResult = emailQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        throw new ValidationError('Invalid query parameters', queryResult.error.errors);
      }
      
      const { page, limit, category, search } = queryResult.data;
      const offset = (page - 1) * limit;

      // Build filter conditions
      const whereConditions: DatabaseConditions = {
        account: {
          userId
        }
      };

      if (category) {
        whereConditions.category = category;
      }

      if (search) {
        whereConditions.OR = [
          { subject: { contains: search, mode: 'insensitive' } },
          { sender: { contains: search, mode: 'insensitive' } },
          { body: { contains: search, mode: 'insensitive' } }
        ];
      }

      // Fetch emails with pagination
      const [emails, total] = await Promise.all([
        dbService.prisma.email.findMany({
          where: whereConditions,
          include: {
            account: {
              select: {
                provider: true,
                email: true
              }
            }
          },
          orderBy: { receivedAt: 'desc' },
          skip: offset,
          take: limit
        }),
        dbService.prisma.email.count({
          where: whereConditions
        })
      ]);

      return {
        emails: emails.map((email) => ({
          id: email.id,
          messageId: email.messageId,
          threadId: email.threadId,
          subject: email.subject,
          sender: email.sender,
          recipients: email.recipients,
          snippet: email.snippet,
          category: email.category,
          subcategories: email.subcategories,
          isNewsletter: email.isNewsletter,
          hasTodos: email.hasTodos,
          priority: email.priority,
          isRead: email.isRead,
          receivedAt: email.receivedAt,
          account: email.account
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to fetch emails', error);
      const apiError = handleError(error);
      return reply.status(apiError.statusCode).send(apiError);
    }
  });

  // Trigger email sync for all accounts
  fastify.post('/sync', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const user = getAuthenticatedUser(request);
      const userId = user.userId;
      
      // Validate request body
      const bodyResult = emailSyncSchema.safeParse(request.body || {});
      if (!bodyResult.success) {
        throw new ValidationError('Invalid request body', bodyResult.error.errors);
      }
      
      const { accountId, maxEmails } = bodyResult.data;

      // Get user's email accounts
      const accounts = await dbService.prisma.emailAccount.findMany({
        where: {
          userId,
          isActive: true,
          ...(accountId ? { id: accountId } : {})
        }
      });

      if (accounts.length === 0) {
        throw new NotFoundError('Active email accounts');
      }

      const syncResults = [];

      // Sync each account
      for (const account of accounts) {
        try {
          let result;
          
          if (account.provider === 'gmail') {
            result = await gmailFetcher.syncEmailsForAccount(account.id, { maxEmails });
          } else if (account.provider === 'yahoo') {
            result = await yahooFetcher.syncEmailsForAccount(account.id, { maxEmails });
          } else {
            logger.warn(`Unsupported provider: ${account.provider}`);
            continue;
          }

          syncResults.push({
            accountId: account.id,
            provider: account.provider,
            email: account.email,
            result
          });
          
        } catch (error) {
          logger.error(`Sync failed for account ${account.id}`, error);
          syncResults.push({
            accountId: account.id,
            provider: account.provider,
            email: account.email,
            result: {
              totalFetched: 0,
              totalProcessed: 0,
              todosExtracted: 0,
              errors: [error instanceof Error ? error.message : 'Unknown error'],
              duration: 0
            }
          });
        }
      }

      return {
        success: true,
        syncResults,
        summary: {
          accountsProcessed: syncResults.length,
          totalEmails: syncResults.reduce((sum, result) => sum + result.result.totalProcessed, 0),
          totalErrors: syncResults.reduce((sum, result) => sum + result.result.errors.length, 0)
        }
      };

    } catch (error) {
      logger.error('Email sync failed', error);
      const apiError = handleError(error);
      return reply.status(apiError.statusCode).send(apiError);
    }
  });

  // Get email by ID
  fastify.get('/:emailId', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const user = getAuthenticatedUser(request);
      const userId = user.userId;
      // Validate parameters
      const paramsResult = emailParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        throw new ValidationError('Invalid parameters', paramsResult.error.errors);
      }
      
      const { emailId } = paramsResult.data;

      const email = await dbService.prisma.email.findFirst({
        where: {
          id: emailId,
          account: {
            userId
          }
        },
        include: {
          account: {
            select: {
              provider: true,
              email: true
            }
          },
          todos: {
            where: {
              status: { in: ['pending', 'snoozed'] }
            }
          }
        }
      });

      if (!email) {
        throw new NotFoundError('Email');
      }

      // Mark as read if not already
      if (!email.isRead) {
        await dbService.prisma.email.update({
          where: { id: emailId },
          data: { isRead: true }
        });
      }

      return {
        email: {
          id: email.id,
          messageId: email.messageId,
          threadId: email.threadId,
          subject: email.subject,
          sender: email.sender,
          recipients: email.recipients,
          body: email.body,
          snippet: email.snippet,
          category: email.category,
          subcategories: email.subcategories,
          isNewsletter: email.isNewsletter,
          hasTodos: email.hasTodos,
          priority: email.priority,
          isRead: true, // Now marked as read
          receivedAt: email.receivedAt,
          processedAt: email.processedAt,
          metadata: email.metadata,
          account: email.account,
          todos: email.todos
        }
      };
    } catch (error) {
      logger.error('Failed to fetch email details', error);
      const apiError = handleError(error);
      return reply.status(apiError.statusCode).send(apiError);
    }
  });

  // Get sync history
  fastify.get('/sync/history', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const user = getAuthenticatedUser(request);
      const userId = user.userId;

      // Validate query parameters
      const queryResult = syncHistoryQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        throw new ValidationError('Invalid query parameters', queryResult.error.errors);
      }
      
      const { limit } = queryResult.data;

      // Get user's email accounts first
      const userAccounts = await dbService.prisma.emailAccount.findMany({
        where: { userId },
        select: { id: true }
      });
      
      const accountIds = userAccounts.map(acc => acc.id);
      
      const syncHistory = await dbService.prisma.syncHistory.findMany({
        where: {
          accountId: {
            in: accountIds
          }
        },
        orderBy: { startedAt: 'desc' },
        take: limit
      });

      return {
        syncHistory: syncHistory.map((sync) => ({
          id: sync.id,
          accountId: sync.accountId,
          syncType: sync.syncType,
          status: sync.status,
          startedAt: sync.startedAt,
          completedAt: sync.completedAt,
          emailsFetched: sync.emailsFetched,
          emailsProcessed: sync.emailsProcessed,
          todosExtracted: sync.todosExtracted,
          errorMessage: sync.errorMessage
        }))
      };
    } catch (error) {
      logger.error('Failed to fetch sync history', error);
      const apiError = handleError(error);
      return reply.status(apiError.statusCode).send(apiError);
    }
  });
};