import Fastify from 'fastify';
import { emailRoutes } from '../../api/emails';

// Mock dependencies
jest.mock('../../db/database', () => ({
  DatabaseService: {
    getInstance: jest.fn().mockReturnValue({
      prisma: {
        email: {
          findMany: jest.fn(),
          count: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn(),
        },
        emailAccount: {
          findMany: jest.fn(),
        },
        syncHistory: {
          findMany: jest.fn(),
        },
      },
    }),
  },
}));

const mockGmailSync = jest.fn();
const mockYahooSync = jest.fn();

jest.mock('../../services/gmail-fetcher', () => ({
  GmailFetcherService: jest.fn().mockImplementation(() => ({
    syncEmailsForAccount: mockGmailSync,
  })),
}));

jest.mock('../../services/yahoo-fetcher', () => ({
  YahooFetcherService: jest.fn().mockImplementation(() => ({
    syncEmailsForAccount: mockYahooSync,
  })),
}));

describe('Email API Routes', () => {
  let app: any;
  let mockPrisma: any;

  beforeEach(async () => {
    app = Fastify();
    
    // Mock authentication
    app.decorate('authenticate', async (request: any) => {
      request.user = { userId: 'test-user-id', email: 'test@example.com' };
    });

    await app.register(emailRoutes, { prefix: '/api/emails' });
    await app.ready();

    // Get mock instances
    const { DatabaseService } = require('../../db/database');
    mockPrisma = DatabaseService.getInstance().prisma;
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('GET /api/emails', () => {
    it('should return paginated emails', async () => {
      const mockEmails = [
        {
          id: 'email-1',
          messageId: 'msg-1',
          subject: 'Test Email 1',
          sender: 'sender@example.com',
          recipients: ['test@example.com'],
          receivedAt: new Date(),
          account: { provider: 'gmail', email: 'test@gmail.com' }
        },
        {
          id: 'email-2',
          messageId: 'msg-2',
          subject: 'Test Email 2',
          sender: 'sender2@example.com',
          recipients: ['test@example.com'],
          receivedAt: new Date(),
          account: { provider: 'yahoo', email: 'test@yahoo.com' }
        }
      ];

      mockPrisma.email.findMany.mockResolvedValue(mockEmails);
      mockPrisma.email.count.mockResolvedValue(2);

      const response = await app.inject({
        method: 'GET',
        url: '/api/emails?page=1&limit=10',
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.emails).toHaveLength(2);
      expect(body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        pages: 1
      });
      expect(body.emails[0].subject).toBe('Test Email 1');
    });

    it('should handle search and category filters', async () => {
      mockPrisma.email.findMany.mockResolvedValue([]);
      mockPrisma.email.count.mockResolvedValue(0);

      await app.inject({
        method: 'GET',
        url: '/api/emails?search=urgent&category=work',
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      expect(mockPrisma.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            account: { userId: 'test-user-id' },
            category: 'work',
            OR: expect.arrayContaining([
              { subject: { contains: 'urgent', mode: 'insensitive' } },
              { sender: { contains: 'urgent', mode: 'insensitive' } },
              { body: { contains: 'urgent', mode: 'insensitive' } }
            ])
          })
        })
      );
    });
  });

  describe('POST /api/emails/sync', () => {
    it('should sync emails for all active accounts', async () => {
      const mockAccounts = [
        {
          id: 'account-1',
          provider: 'gmail',
          email: 'test@gmail.com',
          userId: 'test-user-id',
          isActive: true
        },
        {
          id: 'account-2',
          provider: 'yahoo',
          email: 'test@yahoo.com',
          userId: 'test-user-id',
          isActive: true
        }
      ];

      const mockSyncResult = {
        totalFetched: 10,
        totalProcessed: 10,
        todosExtracted: 0,
        errors: [],
        duration: 5000
      };

      mockPrisma.emailAccount.findMany.mockResolvedValue(mockAccounts);
      mockGmailSync.mockResolvedValue(mockSyncResult);
      mockYahooSync.mockResolvedValue(mockSyncResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/emails/sync',
        headers: {
          authorization: 'Bearer test-token'
        },
        payload: {
          maxEmails: 50
        }
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.syncResults).toHaveLength(2);
      expect(body.summary.accountsProcessed).toBe(2);
      expect(body.summary.totalEmails).toBe(20);
      
      expect(mockGmailSync).toHaveBeenCalledWith('account-1', { maxEmails: 50 });
      expect(mockYahooSync).toHaveBeenCalledWith('account-2', { maxEmails: 50 });
    });

    it('should handle sync failures gracefully', async () => {
      const mockAccounts = [
        {
          id: 'account-1',
          provider: 'gmail',
          email: 'test@gmail.com',
          userId: 'test-user-id',
          isActive: true
        }
      ];

      mockPrisma.emailAccount.findMany.mockResolvedValue(mockAccounts);
      mockGmailSync.mockRejectedValue(new Error('Sync failed'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/emails/sync',
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      if (response.statusCode !== 200) {
        console.log('Sync failure response status:', response.statusCode);
        console.log('Sync failure response body:', response.body);
      }
      
      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.syncResults).toHaveLength(1);
      expect(body.syncResults[0].result.errors).toContain('Sync failed');
      expect(body.summary.totalErrors).toBe(1);
    });

    it('should return 404 for users with no active accounts', async () => {
      mockPrisma.emailAccount.findMany.mockResolvedValue([]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/emails/sync',
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      if (response.statusCode !== 404) {
        console.log('No accounts response status:', response.statusCode);
        console.log('No accounts response body:', response.body);
      }

      expect(response.statusCode).toBe(404);
      
      const body = JSON.parse(response.body);
      expect(body.error).toBe('NotFoundError');
      expect(body.message).toBe('Active email accounts not found');
    });
  });

  describe('GET /api/emails/:emailId', () => {
    it('should return email details and mark as read', async () => {
      const mockEmail = {
        id: 'email-1',
        messageId: 'msg-1',
        subject: 'Test Email',
        sender: 'sender@example.com',
        recipients: ['test@example.com'],
        body: 'Email body content',
        isRead: false,
        receivedAt: new Date(),
        account: { provider: 'gmail', email: 'test@gmail.com' },
        todos: []
      };

      mockPrisma.email.findFirst.mockResolvedValue(mockEmail);
      mockPrisma.email.update.mockResolvedValue({ ...mockEmail, isRead: true });

      const response = await app.inject({
        method: 'GET',
        url: '/api/emails/email-1',
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.email.id).toBe('email-1');
      expect(body.email.isRead).toBe(true);
      
      expect(mockPrisma.email.update).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { isRead: true }
      });
    });

    it('should return 404 for non-existent email', async () => {
      mockPrisma.email.findFirst.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/emails/non-existent',
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(404);
      
      const body = JSON.parse(response.body);
      expect(body.error).toBe('NotFoundError');
      expect(body.message).toBe('Email not found');
    });
  });

  describe('GET /api/emails/sync/history', () => {
    it('should return sync history', async () => {
      const mockSyncHistory = [
        {
          id: 'sync-1',
          accountId: 'account-1',
          syncType: 'manual',
          status: 'completed',
          startedAt: new Date(),
          completedAt: new Date(),
          emailsFetched: 10,
          emailsProcessed: 10,
          todosExtracted: 2,
          errorMessage: null,
          account: { provider: 'gmail', email: 'test@gmail.com' }
        }
      ];

      mockPrisma.syncHistory.findMany.mockResolvedValue(mockSyncHistory);

      const response = await app.inject({
        method: 'GET',
        url: '/api/emails/sync/history',
        headers: {
          authorization: 'Bearer test-token'
        }
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.syncHistory).toHaveLength(1);
      expect(body.syncHistory[0].status).toBe('completed');
      expect(body.syncHistory[0].emailsProcessed).toBe(10);
    });
  });
});