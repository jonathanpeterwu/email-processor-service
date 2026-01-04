import { TodoExtractionService } from '../../services/todo-extraction';
import { AIProcessingConfig } from '../../types/categorization';
import { testEmails, edgeCaseEmails, toProcessingInput } from '../fixtures/test-emails';

describe('TodoExtractionService', () => {
  let todoExtractionService: TodoExtractionService;
  
  const defaultConfig: AIProcessingConfig = {
    enableCategorization: true,
    enableTodoExtraction: true,
    enableNewsletterDetection: true,
    maxTokensPerEmail: 4000,
    confidenceThreshold: 0.5,
    batchSize: 10
  };

  beforeEach(() => {
    todoExtractionService = new TodoExtractionService(defaultConfig);
  });

  describe('extractTodos', () => {
    it('should extract todos from work emails with action items', async () => {
      const email = testEmails.work[0]; // Q4 reports due Friday
      const result = await todoExtractionService.extractTodos(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.hasTodos).toBe(true);
      expect(result.todos.length).toBeGreaterThanOrEqual(2);
      expect(result.confidence).toBeGreaterThan(0.5);
      
      // Check for specific todos
      const todoTitles = result.todos.map(todo => todo.title.toLowerCase());
      expect(todoTitles.some(title => title.includes('report'))).toBe(true);
    });

    it('should extract urgent todos from urgent emails', async () => {
      const email = testEmails.work[1]; // URGENT server maintenance
      const result = await todoExtractionService.extractTodos(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.hasTodos).toBe(true);
      expect(result.todos.length).toBeGreaterThan(0);
      
      // Check that at least one todo has urgent priority
      const hasUrgentTodo = result.todos.some(todo => todo.priority === 'urgent');
      expect(hasUrgentTodo).toBe(true);
    });

    it('should extract todos from complex work emails', async () => {
      const email = testEmails.complexWork[0]; // Project Alpha with multiple priorities
      const result = await todoExtractionService.extractTodos(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.hasTodos).toBe(true);
      expect(result.todos.length).toBeGreaterThanOrEqual(5);
      
      // Check for different priority levels
      const priorities = result.todos.map(todo => todo.priority);
      expect(priorities.includes('urgent')).toBe(true);
      expect(priorities.includes('high')).toBe(true);
      expect(priorities.includes('medium')).toBe(true);
    });

    it('should extract RSVP todo from personal emails', async () => {
      const email = testEmails.personal[0]; // Birthday party invitation
      const result = await todoExtractionService.extractTodos(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.hasTodos).toBe(true);
      expect(result.todos.length).toBeGreaterThan(0);
      
      const rsvpTodo = result.todos.find(todo => 
        todo.description.toLowerCase().includes('rsvp')
      );
      expect(rsvpTodo).toBeDefined();
      expect(rsvpTodo?.priority).toBe('medium');
    });

    it('should extract payment todos from finance emails', async () => {
      const email = testEmails.finance[0]; // Credit card statement
      const result = await todoExtractionService.extractTodos(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.hasTodos).toBe(true);
      
      const paymentTodo = result.todos.find(todo => 
        todo.description.toLowerCase().includes('payment')
      );
      expect(paymentTodo).toBeDefined();
    });

    it('should extract support action items', async () => {
      const email = testEmails.support[0]; // Support ticket with steps
      const result = await todoExtractionService.extractTodos(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.hasTodos).toBe(true);
      expect(result.todos.length).toBeGreaterThanOrEqual(2);
      
      // Should find todos related to clearing cache, trying incognito, etc.
      const todoDescriptions = result.todos.map(todo => todo.description.toLowerCase());
      expect(todoDescriptions.some(desc => desc.includes('cache'))).toBe(true);
    });

    it('should extract travel preparation todos', async () => {
      const email = testEmails.travel[0]; // Flight confirmation
      const result = await todoExtractionService.extractTodos(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.hasTodos).toBe(true);
      
      // Should find check-in related todos
      const checkInTodo = result.todos.find(todo => 
        todo.description.toLowerCase().includes('check')
      );
      expect(checkInTodo).toBeDefined();
    });

    it('should not extract todos from newsletters without action items', async () => {
      const email = testEmails.newsletter[0]; // Simple newsletter
      const result = await todoExtractionService.extractTodos(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.hasTodos).toBe(false);
      expect(result.todos.length).toBe(0);
    });

    it('should not extract todos from shopping confirmations', async () => {
      const email = testEmails.shopping[0]; // Amazon shipment
      const result = await todoExtractionService.extractTodos(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.hasTodos).toBe(false);
      expect(result.todos.length).toBe(0);
    });

    it('should extract todos from mixed newsletter content', async () => {
      const email = testEmails.mixed[0]; // Company newsletter with action items
      const result = await todoExtractionService.extractTodos(
        email.subject,
        email.body,
        email.sender
      );

      expect(result.hasTodos).toBe(true);
      expect(result.todos.length).toBeGreaterThanOrEqual(2);
      
      // Should find todos about updating contact info and training
      const updateTodo = result.todos.find(todo => 
        todo.description.toLowerCase().includes('update')
      );
      const trainingTodo = result.todos.find(todo => 
        todo.description.toLowerCase().includes('training')
      );
      
      expect(updateTodo || trainingTodo).toBeDefined();
    });
  });

  describe('Due date extraction', () => {
    it('should extract due dates from explicit date mentions', async () => {
      const result = await todoExtractionService.extractTodos(
        'Report Due Friday',
        'Please submit your quarterly report by Friday, January 20, 2024.',
        'manager@company.com'
      );

      expect(result.hasTodos).toBe(true);
      const todoWithDate = result.todos.find(todo => todo.dueDate);
      expect(todoWithDate).toBeDefined();
    });

    it('should extract due dates from relative date mentions', async () => {
      const result = await todoExtractionService.extractTodos(
        'Action Required by Tomorrow',
        'Please complete this task by tomorrow.',
        'team@company.com'
      );

      expect(result.hasTodos).toBe(true);
      const todoWithDate = result.todos.find(todo => todo.dueDate);
      expect(todoWithDate).toBeDefined();
      
      // Tomorrow should be 1 day from now
      if (todoWithDate?.dueDate) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const timeDiff = Math.abs(todoWithDate.dueDate.getTime() - tomorrow.getTime());
        expect(timeDiff).toBeLessThan(24 * 60 * 60 * 1000); // Within 24 hours
      }
    });

    it('should extract due dates from day names', async () => {
      const result = await todoExtractionService.extractTodos(
        'Submit by Monday',
        'Please submit your timesheet by Monday.',
        'hr@company.com'
      );

      expect(result.hasTodos).toBe(true);
      const todoWithDate = result.todos.find(todo => todo.dueDate);
      expect(todoWithDate).toBeDefined();
      
      if (todoWithDate?.dueDate) {
        expect(todoWithDate.dueDate.getDay()).toBe(1); // Monday
      }
    });
  });

  describe('Priority assignment', () => {
    it('should assign urgent priority for urgent keywords', async () => {
      const result = await todoExtractionService.extractTodos(
        'URGENT: Fix critical bug ASAP',
        'We need to fix this critical bug immediately. This is an emergency.',
        'dev@company.com'
      );

      expect(result.hasTodos).toBe(true);
      const urgentTodo = result.todos.find(todo => todo.priority === 'urgent');
      expect(urgentTodo).toBeDefined();
    });

    it('should assign high priority for deadline mentions', async () => {
      const result = await todoExtractionService.extractTodos(
        'Important deadline approaching',
        'This is a critical task with an important deadline.',
        'manager@company.com'
      );

      expect(result.hasTodos).toBe(true);
      const highPriorityTodo = result.todos.find(todo => todo.priority === 'high');
      expect(highPriorityTodo).toBeDefined();
    });

    it('should assign medium priority for polite requests', async () => {
      const result = await todoExtractionService.extractTodos(
        'Please review when possible',
        'Could you please review this document when you get a chance?',
        'colleague@company.com'
      );

      expect(result.hasTodos).toBe(true);
      const mediumPriorityTodo = result.todos.find(todo => todo.priority === 'medium');
      expect(mediumPriorityTodo).toBeDefined();
    });

    it('should assign low priority for optional tasks', async () => {
      const result = await todoExtractionService.extractTodos(
        'Optional task if time permits',
        'If possible, when you get a chance, please consider reviewing this.',
        'team@company.com'
      );

      expect(result.hasTodos).toBe(true);
      if (result.todos.length > 0) {
        const lowPriorityTodo = result.todos.find(todo => todo.priority === 'low');
        expect(lowPriorityTodo).toBeDefined();
      }
    });
  });

  describe('batchExtractTodos', () => {
    it('should process multiple emails in batch', async () => {
      const emailsToProcess = [
        toProcessingInput(testEmails.work[0]),
        toProcessingInput(testEmails.personal[0]),
        toProcessingInput(testEmails.finance[0])
      ];

      const results = await todoExtractionService.batchExtractTodos(emailsToProcess);

      expect(results.size).toBe(3);
      
      // Check work email has todos
      const workResult = results.get(testEmails.work[0].id);
      expect(workResult?.hasTodos).toBe(true);
      
      // Check personal email has RSVP todo
      const personalResult = results.get(testEmails.personal[0].id);
      expect(personalResult?.hasTodos).toBe(true);
      
      // Check finance email has payment todo
      const financeResult = results.get(testEmails.finance[0].id);
      expect(financeResult?.hasTodos).toBe(true);
    });

    it('should handle large batches efficiently', async () => {
      const emails = [
        testEmails.work[0],
        testEmails.work[1],
        testEmails.complexWork[0],
        testEmails.personal[0],
        testEmails.finance[0],
        testEmails.support[0],
        testEmails.travel[0],
        testEmails.mixed[0]
      ].map(toProcessingInput);

      const startTime = Date.now();
      const results = await todoExtractionService.batchExtractTodos(emails);
      const processingTime = Date.now() - startTime;

      expect(results.size).toBe(emails.length);
      expect(processingTime).toBeLessThan(15000); // Should complete within 15 seconds
      
      // Verify each result has required properties
      results.forEach(result => {
        expect(result).toHaveProperty('hasTodos');
        expect(result).toHaveProperty('todos');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('reasoning');
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle emails with no actionable content', async () => {
      const result = await todoExtractionService.extractTodos(
        'Just an update',
        'This is just a status update with no actions required.',
        'info@company.com'
      );

      expect(result.hasTodos).toBe(false);
      expect(result.todos.length).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('should handle very long emails', async () => {
      const email = edgeCaseEmails.veryLongEmail;
      const result = await todoExtractionService.extractTodos(
        email.subject,
        email.body,
        email.sender
      );

      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should handle emails with special characters', async () => {
      const result = await todoExtractionService.extractTodos(
        'Task: Review 中文 content 🚀',
        'Please review the content with special characters: 中文, emojis 🎉, and symbols @#$%',
        'unicode@company.com'
      );

      expect(result).toBeDefined();
      expect(result.hasTodos).toBe(true); // Should detect "review" as action
    });

    it('should handle malformed input gracefully', async () => {
      const result = await todoExtractionService.extractTodos(
        null as any,
        undefined as any,
        ''
      );

      expect(result.hasTodos).toBe(false);
      expect(result.todos.length).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('failed');
    });
  });

  describe('Todo deduplication', () => {
    it('should remove duplicate todos from same email', async () => {
      const result = await todoExtractionService.extractTodos(
        'Duplicate tasks',
        `
        Please do the following:
        1. Review the document
        2. Please review the document
        3. Review the attached document
        4. Send feedback
        `,
        'manager@company.com'
      );

      expect(result.hasTodos).toBe(true);
      
      // Should have fewer todos than the number of similar items listed
      expect(result.todos.length).toBeLessThan(4);
      
      // Should have at least the distinct actions (review and send)
      expect(result.todos.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Action keyword extraction', () => {
    it('should extract relevant action keywords', async () => {
      const result = await todoExtractionService.extractTodos(
        'Urgent: Please review and approve ASAP',
        'Please review the attached document and approve it as soon as possible.',
        'manager@company.com'
      );

      expect(result.hasTodos).toBe(true);
      const todo = result.todos[0];
      expect(todo.actionKeywords.length).toBeGreaterThan(0);
      expect(todo.actionKeywords.some(keyword => 
        ['urgent', 'review', 'approve', 'asap'].includes(keyword.toLowerCase())
      )).toBe(true);
    });
  });

  describe('Confidence scoring', () => {
    it('should assign high confidence to clear action items', async () => {
      const result = await todoExtractionService.extractTodos(
        'Action Required: Submit report by Friday',
        'Please submit your quarterly report by Friday EOD.',
        'manager@company.com'
      );

      expect(result.hasTodos).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should assign lower confidence to ambiguous content', async () => {
      const result = await todoExtractionService.extractTodos(
        'Meeting notes',
        'We discussed various topics during the meeting. Some follow-up might be needed.',
        'team@company.com'
      );

      if (result.hasTodos) {
        expect(result.confidence).toBeLessThan(0.6);
      }
    });
  });
});