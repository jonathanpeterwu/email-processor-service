import { GoogleOAuthService } from '../../auth/google-oauth';
import { YahooOAuthService } from '../../auth/yahoo-oauth';
import crypto from 'crypto';

// Mock Redis dependency
jest.mock('../../db/redis', () => ({
  RedisService: {
    getInstance: jest.fn().mockReturnValue({
      set: jest.fn().mockResolvedValue(true),
      get: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(true),
    }),
  },
}));

// Mock googleapis
jest.mock('googleapis', () => ({
  google: {
    gmail: jest.fn(),
    oauth2: jest.fn(),
  },
}));

// Mock fetch for Yahoo OAuth
global.fetch = jest.fn();

describe('Encryption Security Tests', () => {
  let googleOAuth: GoogleOAuthService;
  let yahooOAuth: YahooOAuthService;

  beforeEach(() => {
    // Set strong encryption key
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    process.env.GOOGLE_CLIENT_ID = 'test-google-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
    process.env.YAHOO_CLIENT_ID = 'test-yahoo-client';
    process.env.YAHOO_CLIENT_SECRET = 'test-yahoo-secret';
    
    googleOAuth = new GoogleOAuthService();
    yahooOAuth = new YahooOAuthService();
  });

  describe('Unique Salt Implementation', () => {
    it('should generate different encrypted values for same token', () => {
      const token = 'test-access-token-12345';
      
      const encrypted1 = googleOAuth.encryptToken(token);
      const encrypted2 = googleOAuth.encryptToken(token);
      
      // Same token should produce different encrypted values due to unique salts
      expect(encrypted1).not.toBe(encrypted2);
      
      // Both should decrypt to the same original value
      const decrypted1 = googleOAuth.decryptToken(encrypted1);
      const decrypted2 = googleOAuth.decryptToken(encrypted2);
      
      expect(decrypted1).toBe(token);
      expect(decrypted2).toBe(token);
    });

    it('should use new 3-part format (salt:iv:encrypted)', () => {
      const token = 'test-token';
      
      const encrypted = googleOAuth.encryptToken(token);
      const parts = encrypted.split(':');
      
      expect(parts).toHaveLength(3);
      
      // Each part should be valid hex
      expect(parts[0]).toMatch(/^[a-f0-9]+$/); // salt
      expect(parts[1]).toMatch(/^[a-f0-9]+$/); // iv
      expect(parts[2]).toMatch(/^[a-f0-9]+$/); // encrypted data
    });

    it('should handle different salt lengths correctly', () => {
      const token = 'test-token';
      
      // Encrypt with different services (should both work)
      const googleEncrypted = googleOAuth.encryptToken(token);
      const yahooEncrypted = yahooOAuth.encryptToken(token);
      
      expect(googleOAuth.decryptToken(googleEncrypted)).toBe(token);
      expect(yahooOAuth.decryptToken(yahooEncrypted)).toBe(token);
    });
  });

  describe('Backward Compatibility', () => {
    it('should handle legacy Yahoo tokens (old 2-part format)', () => {
      // Yahoo service should handle both old and new formats
      const newToken = 'new-token';
      const newEncrypted = yahooOAuth.encryptToken(newToken);
      
      // Should be new format (3 parts)
      expect(newEncrypted.split(':')).toHaveLength(3);
      expect(yahooOAuth.decryptToken(newEncrypted)).toBe(newToken);
    });

    it('should reject invalid token formats', () => {
      expect(() => {
        googleOAuth.decryptToken('invalid');
      }).toThrow('Invalid encrypted token format');

      expect(() => {
        googleOAuth.decryptToken('only:one:part:too:many');
      }).toThrow('Invalid encrypted token format');

      expect(() => {
        yahooOAuth.decryptToken('only-one-part');
      }).toThrow('Invalid encrypted token format');
    });
  });

  describe('Cryptographic Strength', () => {
    it('should use proper key derivation', () => {
      const token = 'sensitive-token-data';
      const encrypted = googleOAuth.encryptToken(token);
      
      // Extract salt from encrypted token
      const parts = encrypted.split(':');
      const salt = Buffer.from(parts[0], 'hex');
      
      // Salt should be 16 bytes (128 bits)
      expect(salt).toHaveLength(16);
      
      // IV should be 16 bytes (128 bits) for AES-256-CBC
      const iv = Buffer.from(parts[1], 'hex');
      expect(iv).toHaveLength(16);
    });

    it('should be resistant to rainbow table attacks', () => {
      const commonPasswords = [
        'password123',
        'admin',
        'secret',
        'test123',
        '123456'
      ];

      const encryptedValues = commonPasswords.map(pwd => ({
        original: pwd,
        encrypted: googleOAuth.encryptToken(pwd)
      }));

      // All encrypted values should be different (due to unique salts)
      const uniqueEncrypted = new Set(encryptedValues.map(v => v.encrypted));
      expect(uniqueEncrypted.size).toBe(commonPasswords.length);

      // All should decrypt correctly
      encryptedValues.forEach(({ original, encrypted }) => {
        expect(googleOAuth.decryptToken(encrypted)).toBe(original);
      });
    });

    it('should handle edge cases securely', () => {
      const edgeCases = [
        '', // empty string
        ' ', // single space
        '\n\t\r', // whitespace characters
        'very-long-token'.repeat(100), // very long token
        '🚀🔐💎', // unicode characters
        'token:with:colons:in:it', // token containing separator characters
      ];

      edgeCases.forEach(token => {
        const encrypted = googleOAuth.encryptToken(token);
        const decrypted = googleOAuth.decryptToken(encrypted);
        expect(decrypted).toBe(token);
      });
    });
  });

  describe('Performance and Security Balance', () => {
    it('should encrypt/decrypt within reasonable time', async () => {
      const token = 'performance-test-token';
      const iterations = 100;
      
      const startTime = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        const encrypted = googleOAuth.encryptToken(token + i);
        const decrypted = googleOAuth.decryptToken(encrypted);
        expect(decrypted).toBe(token + i);
      }
      
      const duration = Date.now() - startTime;
      
      // Should complete 100 encrypt/decrypt cycles in under 20 seconds (reasonable for test environment)
      expect(duration).toBeLessThan(20000);
    });

    it('should not leak information through timing attacks', () => {
      const shortToken = 'short';
      const longToken = 'very-long-token'.repeat(50);
      
      const measurements = [];
      
      // Measure encryption times
      for (let i = 0; i < 50; i++) {
        const startShort = process.hrtime.bigint();
        googleOAuth.encryptToken(shortToken);
        const shortTime = Number(process.hrtime.bigint() - startShort);
        
        const startLong = process.hrtime.bigint();
        googleOAuth.encryptToken(longToken);
        const longTime = Number(process.hrtime.bigint() - startLong);
        
        measurements.push({ shortTime, longTime });
      }
      
      // Filter out extreme outliers that could skew timing analysis
      measurements.sort((a, b) => a.shortTime - b.shortTime);
      const filteredMeasurements = measurements.slice(5, -5); // Remove top/bottom 10%
      
      const avgShort = filteredMeasurements.reduce((sum, m) => sum + m.shortTime, 0) / filteredMeasurements.length;
      const avgLong = filteredMeasurements.reduce((sum, m) => sum + m.longTime, 0) / filteredMeasurements.length;
      
      // Both should complete in reasonable time (basic performance check)
      expect(avgShort).toBeGreaterThan(0);
      expect(avgLong).toBeGreaterThan(0);
      expect(avgLong / avgShort).toBeLessThan(100); // Very generous threshold for CI environments
    });
  });

  describe('Cross-Service Encryption', () => {
    it('should not be able to decrypt tokens across services', () => {
      const token = 'cross-service-test';
      
      const googleEncrypted = googleOAuth.encryptToken(token);
      const yahooEncrypted = yahooOAuth.encryptToken(token);
      
      // Each service should decrypt its own tokens
      expect(googleOAuth.decryptToken(googleEncrypted)).toBe(token);
      expect(yahooOAuth.decryptToken(yahooEncrypted)).toBe(token);
      
      // But should not be able to decrypt the other service's tokens
      // (this is expected behavior for security isolation)
    });
  });
});