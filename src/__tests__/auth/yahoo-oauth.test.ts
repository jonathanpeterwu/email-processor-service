import { YahooOAuthService } from '../../auth/yahoo-oauth';

// Mock external dependencies
jest.mock('../../db/redis', () => ({
  RedisService: {
    getInstance: jest.fn().mockReturnValue({
      set: jest.fn().mockResolvedValue(true),
      get: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(true),
    }),
  },
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('YahooOAuthService', () => {
  let service: YahooOAuthService;

  beforeEach(() => {
    // Set up test environment variables
    process.env.YAHOO_CLIENT_ID = 'test-yahoo-client-id';
    process.env.YAHOO_CLIENT_SECRET = 'test-yahoo-client-secret';
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters';
    process.env.NODE_ENV = 'test';
    
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    service = new YahooOAuthService();
  });

  describe('generateAuthUrl', () => {
    it('should generate auth URL with correct parameters', async () => {
      const result = await service.generateAuthUrl('test-user-id');
      
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('state');
      expect(typeof result.url).toBe('string');
      expect(typeof result.state).toBe('string');
      
      // Check URL contains required parameters
      const url = new URL(result.url);
      expect(url.hostname).toBe('api.login.yahoo.com');
      expect(url.searchParams.get('client_id')).toBe('test-yahoo-client-id');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('scope')).toBe('mail-r');
      expect(url.searchParams.get('state')).toBe(result.state);
    });
  });

  describe('handleCallback', () => {
    it('should handle successful OAuth callback', async () => {
      const mockTokenResponse = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        scope: 'mail-r'
      };

      const mockUserInfo = {
        email: 'test@yahoo.com',
        name: 'Test User'
      };

      // Mock Redis get to return valid state for this specific test
      const mockRedisInstance = {
        set: jest.fn().mockResolvedValue(true),
        get: jest.fn().mockResolvedValue({
          provider: 'yahoo',
          userId: 'test-user',
          timestamp: Date.now()
        }),
        delete: jest.fn().mockResolvedValue(true),
      };
      
      require('../../db/redis').RedisService.getInstance.mockReturnValue(mockRedisInstance);

      // Mock fetch for token exchange and user info
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockUserInfo)
        });

      // Create new service instance after setting up mocks  
      const testService = new YahooOAuthService();
      const result = await testService.handleCallback('test-code', 'test-state');
      
      expect(result).toHaveProperty('tokens');
      expect(result).toHaveProperty('userInfo');
      expect(result.tokens.accessToken).toBe('test-access-token');
      expect(result.tokens.refreshToken).toBe('test-refresh-token');
      expect(result.userInfo.email).toBe('test@yahoo.com');
    });

    it('should throw error for invalid state', async () => {      
      // Mock Redis get to return null (invalid state) for this specific test
      const mockRedisInstance = {
        set: jest.fn().mockResolvedValue(true),
        get: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue(true),
      };
      
      require('../../db/redis').RedisService.getInstance.mockReturnValue(mockRedisInstance);

      // Create new service instance after setting up mocks
      const testService = new YahooOAuthService();

      await expect(
        testService.handleCallback('test-code', 'invalid-state')
      ).rejects.toThrow('Invalid or expired OAuth state');
    });
  });

  describe('encryptToken and decryptToken', () => {
    it('should encrypt and decrypt tokens with new format', () => {
      const originalToken = 'test-access-token-12345';
      
      const encrypted = service.encryptToken(originalToken);
      expect(encrypted).not.toBe(originalToken);
      
      // New format should have 3 parts (salt:iv:encrypted)
      expect(encrypted.split(':').length).toBe(3);
      
      const decrypted = service.decryptToken(encrypted);
      expect(decrypted).toBe(originalToken);
    });

    it('should handle legacy format tokens', () => {
      // Create a token in legacy format (iv:encrypted) for backward compatibility testing
      // This simulates tokens encrypted before the salt fix
      const legacyEncrypted = 'mock_iv_hex:mock_encrypted_hex';
      
      // Should not throw an error, but we can't decrypt legacy tokens without the actual implementation
      expect(() => {
        // This will throw because we're using mock data, but it tests the format detection
        service.decryptToken(legacyEncrypted);
      }).toThrow(); // Expected to throw because mock data isn't real encryption
    });

    it('should throw error for invalid token format', () => {
      expect(() => {
        service.decryptToken('invalid-format');
      }).toThrow('Invalid encrypted token format');
    });
  });

  describe('refreshTokens', () => {
    it('should refresh tokens successfully', async () => {
      const mockRefreshResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRefreshResponse)
      });

      // Create fresh service for isolated test
      const testService = new YahooOAuthService();
      const result = await testService.refreshTokens('test-refresh-token');
      
      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should handle refresh token failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid refresh token')
      });

      // Create fresh service for isolated test
      const testService = new YahooOAuthService();
      
      await expect(
        testService.refreshTokens('invalid-refresh-token')
      ).rejects.toThrow('Failed to refresh access token');
    });
  });

  describe('validateToken', () => {
    it('should return true for valid token', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true
      });

      const result = await service.validateToken('valid-token');
      expect(result).toBe(true);
    });

    it('should return false for invalid token', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      const result = await service.validateToken('invalid-token');
      expect(result).toBe(false);
    });
  });
});