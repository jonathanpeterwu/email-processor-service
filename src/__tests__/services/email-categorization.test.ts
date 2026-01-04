import { EmailCategorizationService } from '../../services/email-categorization';
import { AIProcessingConfig } from '../../types/categorization';
import { testEmails, edgeCaseEmails, getAllTestEmails, toProcessingInput } from '../fixtures/test-emails';

describe('EmailCategorizationService', () => {
  let categorizationService: EmailCategorizationService;
  
  const defaultConfig: AIProcessingConfig = {
    enableCategorization: true,
    enableTodoExtraction: true,
    enableNewsletterDetection: true,
    maxTokensPerEmail: 4000,
    confidenceThreshold: 0.5,
    batchSize: 10
  };

  beforeEach(() => {
    categorizationService = new EmailCategorizationService(defaultConfig);
  });

  describe('classifyEmail', () => {
    it('should correctly classify newsletter emails', async () => {
      const email = testEmails.newsletter[0];
      const result = await categorizationService.classifyEmail(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.category).toBe(email.expectedCategory);
      expect(result.isNewsletter).toBe(email.expectedIsNewsletter);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reasoning).toContain('newsletter');
    });

    it('should correctly classify work emails', async () => {
      const email = testEmails.work[0];
      const result = await categorizationService.classifyEmail(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.category).toBe(email.expectedCategory);
      expect(result.isNewsletter).toBe(email.expectedIsNewsletter);
      expect(result.confidence).toBeGreaterThan(0.4);
    });

    it('should correctly classify personal emails', async () => {
      const email = testEmails.personal[0];
      const result = await categorizationService.classifyEmail(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.category).toBe(email.expectedCategory);
      expect(result.isNewsletter).toBe(email.expectedIsNewsletter);
    });

    it('should correctly classify finance emails', async () => {
      const email = testEmails.finance[0];
      const result = await categorizationService.classifyEmail(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.category).toBe(email.expectedCategory);
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('should correctly classify promotional emails', async () => {
      const email = testEmails.promotional[0];
      const result = await categorizationService.classifyEmail(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.category).toBe(email.expectedCategory);
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('should correctly classify shopping emails', async () => {
      const email = testEmails.shopping[0];
      const result = await categorizationService.classifyEmail(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.category).toBe(email.expectedCategory);
      expect(result.reasoning).toContain('shipped');
    });

    it('should handle urgent work emails with appropriate priority', async () => {
      const email = testEmails.work[1]; // URGENT server maintenance
      const result = await categorizationService.classifyEmail(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.category).toBe('work');
      expect(result.priority).toBe('urgent');
    });

    it('should handle mixed category emails', async () => {
      const email = testEmails.mixed[0];
      const result = await categorizationService.classifyEmail(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.category).toBe(email.expectedCategory);
      expect(result.isNewsletter).toBe(email.expectedIsNewsletter);
    });
  });

  describe('detectNewsletter', () => {
    it('should detect newsletters with unsubscribe links', async () => {
      const email = testEmails.newsletter[0];
      const result = categorizationService.detectNewsletter(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.isNewsletter).toBe(true);
      expect(result.unsubscribeLinks.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should not detect regular emails as newsletters', async () => {
      const email = testEmails.work[0];
      const result = categorizationService.detectNewsletter(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.isNewsletter).toBe(false);
      expect(result.unsubscribeLinks.length).toBe(0);
    });
  });

  describe('batchClassifyEmails', () => {
    it('should classify multiple emails in batch', async () => {
      const emailsToProcess = [
        toProcessingInput(testEmails.newsletter[0]),
        toProcessingInput(testEmails.work[0]),
        toProcessingInput(testEmails.personal[0])
      ];

      const results = await categorizationService.batchClassifyEmails(emailsToProcess);

      expect(results.size).toBe(3);
      
      // Check newsletter classification
      const newsletterResult = results.get(testEmails.newsletter[0].id);
      expect(newsletterResult?.category).toBe('newsletter');
      expect(newsletterResult?.isNewsletter).toBe(true);
      
      // Check work classification
      const workResult = results.get(testEmails.work[0].id);
      expect(workResult?.category).toBe('work');
      
      // Check personal classification
      const personalResult = results.get(testEmails.personal[0].id);
      expect(personalResult?.category).toBe('personal');
    });

    it('should handle large batches efficiently', async () => {
      const allEmails = getAllTestEmails().map(toProcessingInput);
      
      const startTime = Date.now();
      const results = await categorizationService.batchClassifyEmails(allEmails);
      const processingTime = Date.now() - startTime;

      expect(results.size).toBe(allEmails.length);
      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds
      
      // Verify each result has required properties
      results.forEach(result => {
        expect(result).toHaveProperty('category');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('isNewsletter');
        expect(result).toHaveProperty('reasoning');
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle emails with empty subjects', async () => {
      const email = edgeCaseEmails.emptySubject;
      const result = await categorizationService.classifyEmail(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.category).toBe('other');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.reasoning).toBeDefined();
    });

    it('should handle very long emails', async () => {
      const email = edgeCaseEmails.veryLongEmail;
      const result = await categorizationService.classifyEmail(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.category).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should handle emails with special characters', async () => {
      const email = edgeCaseEmails.specialCharacters;
      const result = await categorizationService.classifyEmail(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.category).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should identify suspicious emails as spam', async () => {
      const email = edgeCaseEmails.suspiciousEmail;
      const result = await categorizationService.classifyEmail(
        email.subject,
        email.body,
        email.sender
      );

      // Should be classified as spam or promotional (suspicious content)
      expect(['spam', 'promotional'].includes(result.category)).toBe(true);
    });

    it('should handle classification errors gracefully', async () => {
      // Test with malformed input
      const result = await categorizationService.classifyEmail(
        null as any,
        undefined as any,
        ''
      );

      expect(result.category).toBe('other');
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('failed');
    });
  });

  describe('Category pattern matching', () => {
    it('should correctly identify finance keywords', async () => {
      const result = await categorizationService.classifyEmail(
        'Credit Card Statement Ready',
        'Your monthly statement shows a balance of $500. Payment is due by the 15th.',
        'bank@chase.com'
      );

      expect(result.category).toBe('finance');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('should correctly identify social media patterns', async () => {
      const result = await categorizationService.classifyEmail(
        'Someone liked your photo',
        'John Doe liked your recent photo on Instagram. View activity on Instagram.',
        'notifications@instagram.com'
      );

      expect(result.category).toBe('social');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('should correctly identify support tickets', async () => {
      const result = await categorizationService.classifyEmail(
        'Support Ticket #12345',
        'Thank you for contacting support. We will help you resolve your issue.',
        'support@service.com'
      );

      expect(result.category).toBe('support');
    });
  });

  describe('Priority detection', () => {
    it('should assign urgent priority for urgent keywords', async () => {
      const result = await categorizationService.classifyEmail(
        'URGENT: Action Required Immediately',
        'This is an emergency situation requiring immediate action.',
        'alert@company.com'
      );

      expect(result.priority).toBe('urgent');
    });

    it('should assign high priority for important content', async () => {
      const result = await categorizationService.classifyEmail(
        'Important: Deadline Tomorrow',
        'Please complete this important task by tomorrow deadline.',
        'manager@company.com'
      );

      expect(result.priority).toBe('high');
    });

    it('should assign medium priority for request emails', async () => {
      const result = await categorizationService.classifyEmail(
        'Please Review Document',
        'When you get a chance, please review the attached document.',
        'colleague@company.com'
      );

      expect(result.priority).toBe('medium');
    });

    it('should assign null priority for non-actionable emails', async () => {
      const result = await categorizationService.classifyEmail(
        'Newsletter Update',
        'Here are the latest updates from our team. Enjoy reading!',
        'newsletter@company.com'
      );

      expect(result.priority).toBeNull();
    });
  });
});