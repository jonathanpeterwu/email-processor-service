import { AIEmailProcessorService } from '../../services/ai-email-processor';
import { DatabaseService } from '../../db/database';
import { testEmails, toProcessingInput } from '../fixtures/test-emails';
import { AIProcessingConfig } from '../../types/categorization';

// Mock the database service
jest.mock('../../db/database');

describe('AIEmailProcessorService', () => {
  let aiProcessor: AIEmailProcessorService;
  let mockDbService: jest.Mocked<DatabaseService>;

  const defaultConfig: AIProcessingConfig = {
    enableCategorization: true,
    enableTodoExtraction: true,
    enableNewsletterDetection: true,
    maxTokensPerEmail: 4000,
    confidenceThreshold: 0.5,
    batchSize: 10
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock database service
    mockDbService = {
      prisma: {
        email: {
          update: jest.fn(),
          findUnique: jest.fn()
        },
        todo: {
          createMany: jest.fn(),
          deleteMany: jest.fn()
        }
      }
    } as any;

    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDbService);
    
    aiProcessor = new AIEmailProcessorService(defaultConfig);
  });

  describe('processEmail', () => {
    it('should process a work email with todos successfully', async () => {
      const email = toProcessingInput(testEmails.work[0]);
      
      // Mock database operations
      mockDbService.prisma.email.update.mockResolvedValue({} as any);
      mockDbService.prisma.todo.createMany.mockResolvedValue({ count: 3 } as any);

      const result = await aiProcessor.processEmail(email);

      expect(result.success).toBe(true);
      expect(result.emailId).toBe(email.id);
      expect(result.classification.category).toBe('work');
      expect(result.todoExtraction.hasTodos).toBe(true);
      expect(result.todoExtraction.todos.length).toBeGreaterThan(0);
      expect(result.metadata.processingTime).toBeGreaterThan(0);
      expect(result.metadata.tokensUsed).toBeGreaterThan(0);
    });

    it('should process a newsletter without todos', async () => {
      const email = toProcessingInput(testEmails.newsletter[0]);
      
      mockDbService.prisma.email.update.mockResolvedValue({} as any);

      const result = await aiProcessor.processEmail(email);

      expect(result.success).toBe(true);
      expect(result.classification.category).toBe('newsletter');
      expect(result.classification.isNewsletter).toBe(true);
      expect(result.todoExtraction.hasTodos).toBe(false);
    });

    it('should process urgent work email with correct priority', async () => {
      const email = toProcessingInput(testEmails.work[1]); // URGENT server maintenance
      
      mockDbService.prisma.email.update.mockResolvedValue({} as any);
      mockDbService.prisma.todo.createMany.mockResolvedValue({ count: 2 } as any);

      const result = await aiProcessor.processEmail(email);

      expect(result.success).toBe(true);
      expect(result.classification.priority).toBe('urgent');
      expect(result.todoExtraction.hasTodos).toBe(true);
      
      // Check that urgent todos were created
      const urgentTodos = result.todoExtraction.todos.filter(
        todo => todo.priority === 'urgent'
      );
      expect(urgentTodos.length).toBeGreaterThan(0);
    });

    it('should handle processing errors gracefully', async () => {
      const email = toProcessingInput(testEmails.work[0]);
      
      // Mock database error
      mockDbService.prisma.email.update.mockRejectedValue(new Error('Database error'));

      const result = await aiProcessor.processEmail(email);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.metadata.errors).toContain('Database error');
    });

    it('should process with partial config (categorization only)', async () => {
      const partialConfig: Partial<AIProcessingConfig> = {
        enableCategorization: true,
        enableTodoExtraction: false
      };
      
      const processor = new AIEmailProcessorService(partialConfig);
      const email = toProcessingInput(testEmails.work[0]);
      
      mockDbService.prisma.email.update.mockResolvedValue({} as any);

      const result = await processor.processEmail(email);

      expect(result.success).toBe(true);
      expect(result.classification.category).toBe('work');
      expect(result.todoExtraction.hasTodos).toBe(false);
      expect(result.todoExtraction.todos.length).toBe(0);
      expect(result.todoExtraction.reasoning).toContain('disabled');
    });

    it('should process with partial config (todo extraction only)', async () => {
      const partialConfig: Partial<AIProcessingConfig> = {
        enableCategorization: false,
        enableTodoExtraction: true
      };
      
      const processor = new AIEmailProcessorService(partialConfig);
      const email = toProcessingInput(testEmails.work[0]);
      
      mockDbService.prisma.email.update.mockResolvedValue({} as any);
      mockDbService.prisma.todo.createMany.mockResolvedValue({ count: 2 } as any);

      const result = await processor.processEmail(email);

      expect(result.success).toBe(true);
      expect(result.classification.reasoning).toContain('disabled');
      expect(result.todoExtraction.hasTodos).toBe(true);
    });
  });

  describe('processBatchEmails', () => {
    it('should process multiple emails in batch', async () => {
      const emails = [
        toProcessingInput(testEmails.work[0]),
        toProcessingInput(testEmails.newsletter[0]),
        toProcessingInput(testEmails.personal[0])
      ];
      
      mockDbService.prisma.email.update.mockResolvedValue({} as any);
      mockDbService.prisma.todo.createMany.mockResolvedValue({ count: 1 } as any);

      const results = await aiProcessor.processBatchEmails(emails);

      expect(results.length).toBe(3);
      expect(results.every(r => r.success)).toBe(true);
      
      // Check different categories were detected
      const categories = results.map(r => r.classification.category);
      expect(categories).toContain('work');
      expect(categories).toContain('newsletter');
      expect(categories).toContain('personal');
    });

    it('should handle large batches efficiently', async () => {
      const emails = Array(25).fill(null).map((_, i) => ({
        id: `test-${i}`,
        subject: `Test Email ${i}`,
        body: 'Please review this document.',
        sender: 'test@example.com',
        receivedAt: new Date()
      }));
      
      mockDbService.prisma.email.update.mockResolvedValue({} as any);
      mockDbService.prisma.todo.createMany.mockResolvedValue({ count: 1 } as any);

      const startTime = Date.now();
      const results = await aiProcessor.processBatchEmails(emails);
      const processingTime = Date.now() - startTime;

      expect(results.length).toBe(25);
      expect(processingTime).toBeLessThan(30000); // Should complete within 30 seconds
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should continue processing even if some emails fail', async () => {
      const emails = [
        toProcessingInput(testEmails.work[0]),
        {
          id: 'bad-email',
          subject: null as any, // Bad data
          body: undefined as any,
          sender: '',
          receivedAt: new Date()
        },
        toProcessingInput(testEmails.newsletter[0])
      ];
      
      mockDbService.prisma.email.update.mockResolvedValue({} as any);
      mockDbService.prisma.todo.createMany.mockResolvedValue({ count: 1 } as any);

      const results = await aiProcessor.processBatchEmails(emails);

      expect(results.length).toBe(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });
  });

  describe('reprocessEmail', () => {
    it('should reprocess existing email', async () => {
      const emailId = 'test-email-1';
      
      // Mock email fetch
      mockDbService.prisma.email.findUnique.mockResolvedValue({
        id: emailId,
        subject: 'Test Subject',
        body: 'Please review this document.',
        sender: 'test@example.com',
        receivedAt: new Date()
      } as any);
      
      // Mock todo deletion
      mockDbService.prisma.todo.deleteMany.mockResolvedValue({ count: 2 } as any);
      
      // Mock updates
      mockDbService.prisma.email.update.mockResolvedValue({} as any);
      mockDbService.prisma.todo.createMany.mockResolvedValue({ count: 1 } as any);

      const result = await aiProcessor.reprocessEmail(emailId);

      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
      expect(result?.emailId).toBe(emailId);
      
      // Verify todos were cleared before reprocessing
      expect(mockDbService.prisma.todo.deleteMany).toHaveBeenCalledWith({
        where: { emailId }
      });
    });

    it('should return null for non-existent email', async () => {
      const emailId = 'non-existent';
      
      mockDbService.prisma.email.findUnique.mockResolvedValue(null);

      const result = await aiProcessor.reprocessEmail(emailId);

      expect(result).toBeNull();
    });

    it('should handle reprocessing errors', async () => {
      const emailId = 'test-email-1';
      
      mockDbService.prisma.email.findUnique.mockResolvedValue({
        id: emailId,
        subject: 'Test Subject',
        body: 'Test body',
        sender: 'test@example.com',
        receivedAt: new Date()
      } as any);
      
      mockDbService.prisma.todo.deleteMany.mockRejectedValue(new Error('Delete failed'));

      await expect(aiProcessor.reprocessEmail(emailId)).rejects.toThrow('Delete failed');
    });
  });

  describe('configuration management', () => {
    it('should update processing config', async () => {
      const newConfig = {
        enableCategorization: false,
        confidenceThreshold: 0.8
      };

      await aiProcessor.updateProcessingConfig(newConfig);
      const currentConfig = aiProcessor.getProcessingConfig();

      expect(currentConfig.enableCategorization).toBe(false);
      expect(currentConfig.confidenceThreshold).toBe(0.8);
      // Other settings should remain unchanged
      expect(currentConfig.enableTodoExtraction).toBe(true);
    });

    it('should get current processing config', () => {
      const config = aiProcessor.getProcessingConfig();

      expect(config).toEqual(defaultConfig);
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens used for processing', async () => {
      const email = toProcessingInput(testEmails.complexWork[0]); // Long email
      
      mockDbService.prisma.email.update.mockResolvedValue({} as any);
      mockDbService.prisma.todo.createMany.mockResolvedValue({ count: 5 } as any);

      const result = await aiProcessor.processEmail(email);

      expect(result.metadata.tokensUsed).toBeGreaterThan(0);
      expect(result.metadata.tokensUsed).toBeGreaterThan(50); // Should be reasonable for long email
    });
  });

  describe('error handling and recovery', () => {
    it('should handle database connection errors', async () => {
      const email = toProcessingInput(testEmails.work[0]);
      
      mockDbService.prisma.email.update.mockRejectedValue(new Error('Connection failed'));

      const result = await aiProcessor.processEmail(email);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection failed');
      expect(result.metadata.errors).toContain('Connection failed');
    });

    it('should handle classification service errors', async () => {
      // Create a processor with invalid config to trigger errors
      const email = {
        id: 'test',
        subject: null as any, // This should cause classification to fail
        body: null as any,
        sender: '',
        receivedAt: new Date()
      };
      
      mockDbService.prisma.email.update.mockResolvedValue({} as any);

      const result = await aiProcessor.processEmail(email);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle todo service errors gracefully', async () => {
      const email = toProcessingInput(testEmails.work[0]);
      
      mockDbService.prisma.email.update.mockResolvedValue({} as any);
      mockDbService.prisma.todo.createMany.mockRejectedValue(new Error('Todo creation failed'));

      const result = await aiProcessor.processEmail(email);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Todo creation failed');
    });
  });

  describe('processing metadata', () => {
    it('should include processing metadata in results', async () => {
      const email = toProcessingInput(testEmails.work[0]);
      
      mockDbService.prisma.email.update.mockResolvedValue({} as any);
      mockDbService.prisma.todo.createMany.mockResolvedValue({ count: 2 } as any);

      const result = await aiProcessor.processEmail(email);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.processedAt).toBeInstanceOf(Date);
      expect(result.metadata.processingVersion).toBe('1.0.0');
      expect(result.metadata.tokensUsed).toBeGreaterThan(0);
      expect(result.metadata.processingTime).toBeGreaterThan(0);
      expect(Array.isArray(result.metadata.errors)).toBe(true);
    });
  });
});