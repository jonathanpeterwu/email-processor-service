import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { GoogleOAuthService } from '../auth/google-oauth';
import { YahooOAuthService } from '../auth/yahoo-oauth';
import { DatabaseService } from '../db/database';
import { schemas } from '../utils/validation';
import { getAuthenticatedUser } from '../utils/auth';
import pino from 'pino';

const logger = pino().child({ module: 'AuthRoutes' });

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const googleOAuth = new GoogleOAuthService();
  const yahooOAuth = new YahooOAuthService();
  const dbService = DatabaseService.getInstance();

  // Gmail OAuth initiation
  fastify.get('/gmail', async (request, reply) => {
    try {
      const userId = request.headers['user-id'] as string; // Could come from session
      
      const { url, state } = await googleOAuth.generateAuthUrl(userId);
      
      logger.info('Gmail OAuth initiated', { userId, state });
      
      return reply.redirect(url);
    } catch (error) {
      logger.error('Gmail OAuth initiation failed', error);
      return reply.status(500).send({ 
        error: 'Failed to initiate Gmail OAuth',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Gmail OAuth callback
  fastify.get('/gmail/callback', async (request, reply) => {
    try {
      const query = schemas.oauthCallback.parse(request.query);
      
      if (query.error) {
        logger.warn('Gmail OAuth error', { error: query.error, description: query.error_description });
        return reply.status(400).send({
          error: 'OAuth authorization failed',
          description: query.error_description || query.error
        });
      }

      if (!query.code) {
        return reply.status(400).send({
          error: 'Missing authorization code'
        });
      }

      // Handle OAuth callback
      const { tokens, userInfo } = await googleOAuth.handleCallback(query.code, query.state);
      
      // Validate email exists
      if (!userInfo.email) {
        return reply.status(400).send({
          error: 'Email not provided by OAuth provider'
        });
      }

      // Find or create user
      let user = await dbService.prisma.user.findUnique({
        where: { email: userInfo.email }
      });

      if (!user) {
        user = await dbService.prisma.user.create({
          data: {
            email: userInfo.email,
            name: userInfo.name || userInfo.given_name,
            settings: {}
          }
        });
      }

      // Create or update email account
      const existingAccount = await dbService.prisma.emailAccount.findFirst({
        where: {
          userId: user.id,
          provider: 'gmail',
          email: userInfo.email
        }
      });

      if (existingAccount) {
        // Update existing account
        await dbService.prisma.emailAccount.update({
          where: { id: existingAccount.id },
          data: {
            accessToken: googleOAuth.encryptToken(tokens.accessToken),
            refreshToken: tokens.refreshToken ? googleOAuth.encryptToken(tokens.refreshToken) : null,
            tokenExpiresAt: tokens.expiresAt,
            isActive: true,
            updatedAt: new Date()
          }
        });
      } else {
        // Create new account
        await dbService.prisma.emailAccount.create({
          data: {
            userId: user.id,
            provider: 'gmail',
            email: userInfo.email,
            accessToken: googleOAuth.encryptToken(tokens.accessToken),
            refreshToken: tokens.refreshToken ? googleOAuth.encryptToken(tokens.refreshToken) : null,
            tokenExpiresAt: tokens.expiresAt,
            isActive: true,
            syncState: {}
          }
        });
      }

      // Generate JWT for the user
      const jwtPayload = {
        userId: user.id,
        email: user.email,
        provider: 'gmail'
      };

      const token = await reply.jwtSign(jwtPayload, {
        expiresIn: '7d'
      });

      logger.info('Gmail OAuth completed successfully', { 
        userId: user.id, 
        email: userInfo.email 
      });

      // In production, you'd redirect to your frontend with the token
      // For now, return JSON response
      return {
        success: true,
        message: 'Gmail account connected successfully',
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        },
        token
      };

    } catch (error) {
      logger.error('Gmail OAuth callback failed', error);
      return reply.status(500).send({
        error: 'OAuth callback failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Yahoo OAuth initiation
  fastify.get('/yahoo', async (request, reply) => {
    try {
      const userId = request.headers['user-id'] as string; // Could come from session
      
      const { url, state } = await yahooOAuth.generateAuthUrl(userId);
      
      logger.info('Yahoo OAuth initiated', { userId, state });
      
      return reply.redirect(url);
    } catch (error) {
      logger.error('Yahoo OAuth initiation failed', error);
      return reply.status(500).send({ 
        error: 'Failed to initiate Yahoo OAuth',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Yahoo OAuth callback
  fastify.get('/yahoo/callback', async (request, reply) => {
    try {
      const query = schemas.oauthCallback.parse(request.query);
      
      if (query.error) {
        logger.warn('Yahoo OAuth error', { error: query.error, description: query.error_description });
        return reply.status(400).send({
          error: 'OAuth authorization failed',
          description: query.error_description || query.error
        });
      }

      if (!query.code) {
        return reply.status(400).send({
          error: 'Missing authorization code'
        });
      }

      // Handle OAuth callback
      const { tokens, userInfo } = await yahooOAuth.handleCallback(query.code, query.state);
      
      // Validate email exists
      if (!userInfo.email) {
        return reply.status(400).send({
          error: 'Email not provided by OAuth provider'
        });
      }
      
      // Find or create user
      let user = await dbService.prisma.user.findUnique({
        where: { email: userInfo.email }
      });

      if (!user) {
        user = await dbService.prisma.user.create({
          data: {
            email: userInfo.email,
            name: userInfo.name || userInfo.given_name,
            settings: {}
          }
        });
      }

      // Create or update email account
      const existingAccount = await dbService.prisma.emailAccount.findFirst({
        where: {
          userId: user.id,
          provider: 'yahoo',
          email: userInfo.email
        }
      });

      if (existingAccount) {
        // Update existing account
        await dbService.prisma.emailAccount.update({
          where: { id: existingAccount.id },
          data: {
            accessToken: yahooOAuth.encryptToken(tokens.accessToken),
            refreshToken: tokens.refreshToken ? yahooOAuth.encryptToken(tokens.refreshToken) : null,
            tokenExpiresAt: tokens.expiresAt,
            isActive: true,
            updatedAt: new Date()
          }
        });
      } else {
        // Create new account
        await dbService.prisma.emailAccount.create({
          data: {
            userId: user.id,
            provider: 'yahoo',
            email: userInfo.email,
            accessToken: yahooOAuth.encryptToken(tokens.accessToken),
            refreshToken: tokens.refreshToken ? yahooOAuth.encryptToken(tokens.refreshToken) : null,
            tokenExpiresAt: tokens.expiresAt,
            isActive: true,
            syncState: {}
          }
        });
      }

      // Generate JWT for the user
      const jwtPayload = {
        userId: user.id,
        email: user.email,
        provider: 'yahoo'
      };

      const token = await reply.jwtSign(jwtPayload, {
        expiresIn: '7d'
      });

      logger.info('Yahoo OAuth completed successfully', { 
        userId: user.id, 
        email: userInfo.email 
      });

      // In production, you'd redirect to your frontend with the token
      // For now, return JSON response
      return {
        success: true,
        message: 'Yahoo account connected successfully',
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        },
        token
      };

    } catch (error) {
      logger.error('Yahoo OAuth callback failed', error);
      return reply.status(500).send({
        error: 'OAuth callback failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get connected accounts
  fastify.get('/accounts', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const user = getAuthenticatedUser(request);
      const userId = user.userId;
      if (!userId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const accounts = await dbService.prisma.emailAccount.findMany({
        where: { 
          userId,
          isActive: true 
        },
        select: {
          id: true,
          provider: true,
          email: true,
          lastSyncAt: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return { accounts };
    } catch (error) {
      logger.error('Failed to fetch accounts', error);
      return reply.status(500).send({
        error: 'Failed to fetch accounts'
      });
    }
  });

  // Disconnect account
  fastify.delete('/accounts/:accountId', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const user = getAuthenticatedUser(request);
      const userId = user.userId;
      if (!userId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }
      
      // Validate parameters
      const { accountId } = schemas.accountId.parse(request.params);

      const account = await dbService.prisma.emailAccount.findFirst({
        where: {
          id: accountId,
          userId
        }
      });

      if (!account) {
        return reply.status(404).send({
          error: 'Account not found'
        });
      }

      // Revoke token based on provider
      if (account.accessToken) {
        try {
          if (account.provider === 'gmail') {
            const decryptedToken = googleOAuth.decryptToken(account.accessToken);
            await googleOAuth.revokeToken(decryptedToken);
          } else if (account.provider === 'yahoo') {
            const decryptedToken = yahooOAuth.decryptToken(account.accessToken);
            await yahooOAuth.revokeToken(decryptedToken);
          }
        } catch (error) {
          logger.warn('Failed to revoke token', error);
        }
      }

      // Soft delete - mark as inactive
      await dbService.prisma.emailAccount.update({
        where: { id: accountId },
        data: { isActive: false }
      });

      logger.info('Account disconnected', { accountId, userId });

      return { success: true, message: 'Account disconnected successfully' };
    } catch (error) {
      logger.error('Failed to disconnect account', error);
      return reply.status(500).send({
        error: 'Failed to disconnect account'
      });
    }
  });

  // JWT authentication hook
  fastify.decorate('authenticate', async function(request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  });
};