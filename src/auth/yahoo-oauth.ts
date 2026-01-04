import { OAuthTokens, OAuthState } from '../types/auth';
import { YahooUserInfo } from '../types/oauth';
import { RedisService } from '../db/redis';
import pino from 'pino';
import crypto from 'crypto';

const logger = pino().child({ module: 'YahooOAuth' });

export class YahooOAuthService {
  private redisService: RedisService;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.YAHOO_CLIENT_ID!;
    this.clientSecret = process.env.YAHOO_CLIENT_SECRET!;
    this.redirectUri = this.getRedirectUri();
    this.redisService = RedisService.getInstance();
  }

  private getRedirectUri(): string {
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? process.env.RAILWAY_PUBLIC_DOMAIN 
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : `https://your-app.railway.app`
      : 'http://localhost:3000';
    
    return `${baseUrl}/auth/yahoo/callback`;
  }

  async generateAuthUrl(userId?: string): Promise<{ url: string; state: string }> {
    const state: OAuthState = {
      provider: 'yahoo',
      userId,
      timestamp: Date.now(),
    };

    const stateString = crypto.randomBytes(32).toString('hex');
    
    // Store state in Redis for 10 minutes
    await this.redisService.set(`oauth_state:${stateString}`, state, 600);

    // Yahoo OAuth2 parameters
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'mail-r', // Read-only mail access
      state: stateString,
    });

    const url = `https://api.login.yahoo.com/oauth2/request_auth?${params.toString()}`;

    logger.info('Generated Yahoo OAuth URL', { userId, state: stateString });
    
    return { url, state: stateString };
  }

  async handleCallback(code: string, state: string): Promise<{ tokens: OAuthTokens; userInfo: YahooUserInfo }> {
    // Verify state
    const storedState = await this.redisService.get<OAuthState>(`oauth_state:${state}`);
    if (!storedState || storedState.provider !== 'yahoo') {
      throw new Error('Invalid or expired OAuth state');
    }

    // Clean up state
    await this.redisService.delete(`oauth_state:${state}`);

    // Exchange code for tokens
    const tokenResponse = await this.exchangeCodeForTokens(code);
    
    // Get user information
    const userInfo = await this.getUserInfo(tokenResponse.access_token);

    const oauthTokens: OAuthTokens = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || undefined,
      expiresAt: tokenResponse.expires_in 
        ? new Date(Date.now() + tokenResponse.expires_in * 1000) 
        : undefined,
      scope: tokenResponse.scope || undefined,
    };

    logger.info('Yahoo OAuth callback successful', { 
      email: userInfo.email,
      hasRefreshToken: !!tokenResponse.refresh_token 
    });

    return { tokens: oauthTokens, userInfo };
  }

  private async exchangeCodeForTokens(code: string): Promise<any> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      code,
      grant_type: 'authorization_code',
    });

    const response = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Yahoo token exchange failed', { 
        status: response.status, 
        error: errorText 
      });
      throw new Error('Failed to exchange code for tokens');
    }

    return await response.json();
  }

  private async getUserInfo(accessToken: string): Promise<any> {
    const response = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Yahoo user info fetch failed', { 
        status: response.status, 
        error: errorText 
      });
      throw new Error('Failed to fetch user information');
    }

    return await response.json();
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });

      const response = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Yahoo token refresh failed', { 
          status: response.status, 
          error: errorText 
        });
        throw new Error('Failed to refresh access token');
      }

      const tokenResponse = await response.json() as any;
      
      return {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || refreshToken, // Keep old refresh token if no new one
        expiresAt: tokenResponse.expires_in 
          ? new Date(Date.now() + tokenResponse.expires_in * 1000) 
          : undefined,
        scope: tokenResponse.scope || undefined,
      };
    } catch (error) {
      logger.error('Failed to refresh Yahoo token', error);
      throw new Error('Failed to refresh access token');
    }
  }

  async validateToken(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      return response.ok;
    } catch (error) {
      logger.error('Token validation failed', error);
      return false;
    }
  }

  async revokeToken(accessToken: string): Promise<void> {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        token: accessToken,
      });

      const response = await fetch('https://api.login.yahoo.com/oauth2/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        logger.warn('Failed to revoke Yahoo token', { status: response.status });
      } else {
        logger.info('Yahoo token revoked successfully');
      }
    } catch (error) {
      logger.error('Failed to revoke Yahoo token', error);
      throw error;
    }
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
    
    // Handle both old format (iv:encrypted) and new format (salt:iv:encrypted)
    if (parts.length === 2) {
      // Legacy format - use fixed salt for backward compatibility
      const key = crypto.scryptSync(process.env.ENCRYPTION_KEY!, 'salt', 32);
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } else if (parts.length === 3) {
      // New format with unique salt
      const salt = Buffer.from(parts[0], 'hex');
      const iv = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];
      
      const key = crypto.scryptSync(process.env.ENCRYPTION_KEY!, salt, 32);
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } else {
      throw new Error('Invalid encrypted token format');
    }
  }
}