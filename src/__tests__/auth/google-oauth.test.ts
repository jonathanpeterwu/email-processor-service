// Mock googleapis before importing GoogleOAuthService
jest.mock('googleapis', () => ({
  google: {
    gmail: jest.fn(),
    oauth2: jest.fn(),
  },
}));

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

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/oauth2/auth?test=true'),
  })),
}));

import { GoogleOAuthService } from '../../auth/google-oauth';

describe('GoogleOAuthService', () => {
  let service: GoogleOAuthService;

  beforeEach(() => {
    // Set up test environment variables
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters';
    
    service = new GoogleOAuthService();
  });

  describe('generateAuthUrl', () => {
    it('should generate auth URL with state', async () => {
      const result = await service.generateAuthUrl('test-user-id');
      
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('state');
      expect(typeof result.url).toBe('string');
      expect(typeof result.state).toBe('string');
    });
  });

  describe('encryptToken and decryptToken', () => {
    it('should encrypt and decrypt tokens correctly', () => {
      const originalToken = 'test-access-token';
      
      const encrypted = service.encryptToken(originalToken);
      expect(encrypted).not.toBe(originalToken);
      
      const decrypted = service.decryptToken(encrypted);
      expect(decrypted).toBe(originalToken);
    });
  });
});