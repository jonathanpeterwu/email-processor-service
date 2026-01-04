import Fastify from 'fastify';
import { healthRoutes } from '../../api/health';

describe('Health Routes', () => {
  let app: any;

  beforeEach(async () => {
    app = Fastify();
    await app.register(healthRoutes, { prefix: '/health' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return ok status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.service).toBe('email-processor-service');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('GET /health/live', () => {
    it('should return alive status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live',
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.status).toBe('alive');
      expect(body.timestamp).toBeDefined();
    });
  });
});