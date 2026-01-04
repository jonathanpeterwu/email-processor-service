import { OAuth2Client } from 'google-auth-library';
import { gmail_v1, google } from 'googleapis';
import { OAuthTokens, OAuthState } from '../types/auth';
import { GoogleUserInfo } from '../types/oauth';
import { RedisService } from '../db/redis';
import pino from 'pino';
import crypto from 'crypto';

const logger = pino().child({ module: 'GoogleOAuth' });

export class GoogleOAuthService {
  private oauth2Client: OAuth2Client;
  // private dbService: DatabaseService;
  private redisService: RedisService;

  constructor() {
    this.oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      this.getRedirectUri()
    );
    
    // this.dbService = DatabaseService.getInstance();
    this.redisService = RedisService.getInstance();
  }

  private getRedirectUri(): string {
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? process.env.RAILWAY_PUBLIC_DOMAIN 
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : `https://your-app.railway.app`
      : 'http://localhost:3000';
    
    return `${baseUrl}/auth/gmail/callback`;
  }

  async generateAuthUrl(userId?: string): Promise<{ url: string; state: string }> {
    const state: OAuthState = {
      provider: 'gmail',
      userId,
      timestamp: Date.now(),
    };

    const stateString = crypto.randomBytes(32).toString('hex');
    
    // Store state in Redis for 10 minutes
    await this.redisService.set(`oauth_state:${stateString}`, state, 600);

    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    const url = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: stateString,
      prompt: 'consent', // Force refresh token
    });

    logger.info('Generated Gmail OAuth URL', { userId, state: stateString });
    
    return { url, state: stateString };
  }

  async handleCallback(code: string, state: string): Promise<{ tokens: OAuthTokens; userInfo: GoogleUserInfo }> {
    // Verify state
    const storedState = await this.redisService.get<OAuthState>(`oauth_state:${state}`);
    if (!storedState || storedState.provider !== 'gmail') {
      throw new Error('Invalid or expired OAuth state');
    }

    // Clean up state
    await this.redisService.delete(`oauth_state:${state}`);

    // Exchange code for tokens
    const { tokens } = await this.oauth2Client.getToken(code);
    
    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    // Set credentials to get user info
    this.oauth2Client.setCredentials(tokens);
    
    // Get user information
    const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    const oauthTokens: OAuthTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      scope: tokens.scope || undefined,
    };

    logger.info('Gmail OAuth callback successful', { 
      email: userInfo.data.email,
      hasRefreshToken: !!tokens.refresh_token 
    });

    return { tokens: oauthTokens, userInfo: userInfo.data };
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    this.oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    try {
      const response = await this.oauth2Client.refreshAccessToken();
      const tokens = response.credentials;
      
      return {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token || refreshToken, // Keep old refresh token if no new one
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        scope: tokens.scope || undefined,
      };
    } catch (error) {
      logger.error('Failed to refresh Gmail token', error);
      throw new Error('Failed to refresh access token');
    }
  }

  async validateToken(accessToken: string): Promise<boolean> {
    try {
      this.oauth2Client.setCredentials({ access_token: accessToken });
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      await oauth2.userinfo.get();
      return true;
    } catch (error) {
      logger.error('Token validation failed', error);
      return false;
    }
  }

  async revokeToken(accessToken: string): Promise<void> {
    try {
      await this.oauth2Client.revokeToken(accessToken);
      logger.info('Gmail token revoked successfully');
    } catch (error) {
      logger.error('Failed to revoke Gmail token', error);
      throw error;
    }
  }

  getGmailClient(accessToken: string, refreshToken?: string): gmail_v1.Gmail {
    const auth = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      this.getRedirectUri()
    );
    
    auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    return google.gmail({ version: 'v1', auth });
  }

  // Encrypt tokens for database storage using AES-256-CBC with unique salt
  encryptToken(token: string): string {
    const algorithm = 'aes-256-cbc';
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY!, salt, 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
  }

  // Decrypt tokens from database
  decryptToken(encryptedToken: string): string {
    const algorithm = 'aes-256-cbc';
    
    const parts = encryptedToken.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted token format');
    }
    
    const salt = Buffer.from(parts[0], 'hex');
    const iv = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY!, salt, 32);
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}