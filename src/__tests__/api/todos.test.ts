import fastify from 'fastify';
import { todoRoutes } from '../../api/todos';
import { DatabaseService } from '../../db/database';
import { AIEmailProcessorService } from '../../services/ai-email-processor';

// Mock dependencies
jest.mock('../../db/database');
jest.mock('../../services/ai-email-processor');

describe('Todo API Routes', () => {
  let app: any;
  let mockDbService: jest.Mocked<DatabaseService>;
  let mockAIProcessor: jest.Mocked<AIEmailProcessorService>;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock database service
    mockDbService = {
      prisma: {
        todo: {
          findMany: jest.fn(),
          count: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
          findFirst: jest.fn()
        },
        email: {
          findFirst: jest.fn(),
          update: jest.fn()
        }
      }
    } as any;

    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDbService);
    
    // Mock AI processor
    mockAIProcessor = {
      updateProcessingConfig: jest.fn(),
      reprocessEmail: jest.fn()
    } as any;

    // Create fastify app
    app = fastify();
    
    // Mock authentication
    app.decorate('authenticate', async (request: any) => {
      request.user = { userId: 'test-user-123', email: 'test@example.com' };
    });
    
    // Mock JWT sign
    app.decorate('jwtSign', jest.fn());
    
    await app.register(todoRoutes, { prefix: '/todos' });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /todos', () => {
    it('should fetch todos for authenticated user', async () => {
      const mockTodos = [
        {
          id: 'todo-1',
          title: 'Review document',
          description: 'Please review the attached document',
          priority: 'medium',
          status: 'pending',
          dueDate: new Date('2024-01-20'),
          confidence: 0.8,
          context: 'Email context',
          actionKeywords: ['review'],
          snoozedUntil: null,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          email: {
            id: 'email-1',
            subject: 'Document Review',
            sender: 'manager@company.com',
            receivedAt: new Date(),
            account: {
              provider: 'gmail',
              email: 'test@example.com'
            }
          }
        }
      ];

      mockDbService.prisma.todo.findMany.mockResolvedValue(mockTodos as any);
      mockDbService.prisma.todo.count.mockResolvedValue(1);

      const response = await app.inject({
        method: 'GET',
        url: '/todos?page=1&limit=50'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.todos).toHaveLength(1);
      expect(body.todos[0].id).toBe('todo-1');
      expect(body.pagination.total).toBe(1);
    });

    it('should filter todos by status', async () => {
      mockDbService.prisma.todo.findMany.mockResolvedValue([]);
      mockDbService.prisma.todo.count.mockResolvedValue(0);

      const response = await app.inject({
        method: 'GET',
        url: '/todos?status=completed'
      });

      expect(response.statusCode).toBe(200);
      
      // Check that the correct where clause was used
      expect(mockDbService.prisma.todo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'completed'
          })
        })
      );
    });

    it('should filter todos by priority', async () => {
      mockDbService.prisma.todo.findMany.mockResolvedValue([]);
      mockDbService.prisma.todo.count.mockResolvedValue(0);

      const response = await app.inject({
        method: 'GET',
        url: '/todos?priority=urgent'
      });

      expect(response.statusCode).toBe(200);
      expect(mockDbService.prisma.todo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            priority: 'urgent'
          })
        })
      );
    });

    it('should filter todos by due date range', async () => {
      mockDbService.prisma.todo.findMany.mockResolvedValue([]);
      mockDbService.prisma.todo.count.mockResolvedValue(0);

      const response = await app.inject({
        method: 'GET',
        url: '/todos?dueAfter=2024-01-01&dueBefore=2024-01-31'
      });

      expect(response.statusCode).toBe(200);
      expect(mockDbService.prisma.todo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dueDate: {
              gte: new Date('2024-01-01'),
              lte: new Date('2024-01-31')
            }
          })
        })
      );
    });

    it('should search todos by text', async () => {
      mockDbService.prisma.todo.findMany.mockResolvedValue([]);
      mockDbService.prisma.todo.count.mockResolvedValue(0);

      const response = await app.inject({
        method: 'GET',
        url: '/todos?search=review'
      });

      expect(response.statusCode).toBe(200);
      expect(mockDbService.prisma.todo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'review', mode: 'insensitive' } },
              { description: { contains: 'review', mode: 'insensitive' } }
            ]
          })
        })
      );
    });

    it('should handle pagination', async () => {
      mockDbService.prisma.todo.findMany.mockResolvedValue([]);
      mockDbService.prisma.todo.count.mockResolvedValue(100);

      const response = await app.inject({
        method: 'GET',
        url: '/todos?page=2&limit=10'
      });

      expect(response.statusCode).toBe(200);
      expect(mockDbService.prisma.todo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (page 2 - 1) * limit 10
          take: 10
        })
      );
    });
  });

  describe('POST /todos', () => {
    it('should create a new todo', async () => {
      const mockEmail = {
        id: 'email-1',
        subject: 'Test Email',
        sender: 'test@example.com'
      };

      const mockTodo = {
        id: 'todo-1',
        title: 'Review document',
        description: 'Please review the document',
        priority: 'medium',
        status: 'pending',
        dueDate: new Date('2024-01-20'),
        confidence: 1.0,
        context: 'Manual todo',
        actionKeywords: [],
        createdAt: new Date(),
        email: mockEmail
      };

      mockDbService.prisma.email.findFirst.mockResolvedValue(mockEmail as any);
      mockDbService.prisma.todo.create.mockResolvedValue(mockTodo as any);
      mockDbService.prisma.email.update.mockResolvedValue({} as any);

      const response = await app.inject({
        method: 'POST',
        url: '/todos',
        payload: {
          emailId: 'email-1',
          title: 'Review document',
          description: 'Please review the document',
          priority: 'medium',
          dueDate: '2024-01-20'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.todo.id).toBe('todo-1');
      expect(body.todo.title).toBe('Review document');
    });

    it('should reject todo creation for non-existent email', async () => {
      mockDbService.prisma.email.findFirst.mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/todos',
        payload: {
          emailId: 'non-existent',
          title: 'Test todo',
          description: 'Test description'
        }
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Email not found');
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/todos',
        payload: {
          emailId: 'email-1'
          // Missing title and description
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid request body');
    });
  });

  describe('PATCH /todos/:todoId', () => {
    it('should update an existing todo', async () => {
      const mockTodo = {
        id: 'todo-1',
        status: 'pending',
        email: {
          account: { userId: 'test-user-123' }
        }
      };

      const updatedTodo = {
        ...mockTodo,
        status: 'completed',
        completedAt: new Date(),
        email: {
          id: 'email-1',
          subject: 'Test Email',
          sender: 'test@example.com',
          receivedAt: new Date(),
          account: {
            provider: 'gmail',
            email: 'test@example.com'
          }
        }
      };

      mockDbService.prisma.todo.findFirst.mockResolvedValue(mockTodo as any);
      mockDbService.prisma.todo.update.mockResolvedValue(updatedTodo as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/todos/todo-1',
        payload: {
          status: 'completed'
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.todo.status).toBe('completed');
      expect(body.todo.completedAt).toBeDefined();
    });

    it('should reject update for non-existent todo', async () => {
      mockDbService.prisma.todo.findFirst.mockResolvedValue(null);

      const response = await app.inject({
        method: 'PATCH',
        url: '/todos/non-existent',
        payload: {
          status: 'completed'
        }
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Todo not found');
    });

    it('should validate todo ID format', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/todos/invalid-uuid',
        payload: {
          status: 'completed'
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid parameters');
    });
  });

  describe('DELETE /todos/:todoId', () => {
    it('should delete an existing todo', async () => {
      const mockTodo = {
        id: 'todo-1',
        emailId: 'email-1',
        email: {
          account: { userId: 'test-user-123' }
        }
      };

      mockDbService.prisma.todo.findFirst.mockResolvedValue(mockTodo as any);
      mockDbService.prisma.todo.delete.mockResolvedValue({} as any);
      mockDbService.prisma.todo.count.mockResolvedValue(0); // No remaining todos
      mockDbService.prisma.email.update.mockResolvedValue({} as any);

      const response = await app.inject({
        method: 'DELETE',
        url: '/todos/todo-1'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Todo deleted successfully');

      // Should update email's hasTodos flag
      expect(mockDbService.prisma.email.update).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { hasTodos: false }
      });
    });

    it('should not update email hasTodos if other todos remain', async () => {
      const mockTodo = {
        id: 'todo-1',
        emailId: 'email-1',
        email: {
          account: { userId: 'test-user-123' }
        }
      };

      mockDbService.prisma.todo.findFirst.mockResolvedValue(mockTodo as any);
      mockDbService.prisma.todo.delete.mockResolvedValue({} as any);
      mockDbService.prisma.todo.count.mockResolvedValue(2); // Other todos remain

      const response = await app.inject({
        method: 'DELETE',
        url: '/todos/todo-1'
      });

      expect(response.statusCode).toBe(200);
      // Should not update email's hasTodos flag
      expect(mockDbService.prisma.email.update).not.toHaveBeenCalled();
    });

    it('should reject deletion of non-existent todo', async () => {
      mockDbService.prisma.todo.findFirst.mockResolvedValue(null);

      const response = await app.inject({
        method: 'DELETE',
        url: '/todos/non-existent'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Todo not found');
    });
  });

  describe('GET /todos/:todoId', () => {
    it('should fetch a specific todo by ID', async () => {
      const mockTodo = {
        id: 'todo-1',
        title: 'Review document',
        description: 'Please review the document',
        priority: 'medium',
        status: 'pending',
        confidence: 0.8,
        email: {
          id: 'email-1',
          subject: 'Test Email',
          sender: 'test@example.com',
          receivedAt: new Date(),
          body: 'Email body content',
          account: {
            provider: 'gmail',
            email: 'test@example.com'
          }
        }
      };

      mockDbService.prisma.todo.findFirst.mockResolvedValue(mockTodo as any);

      const response = await app.inject({
        method: 'GET',
        url: '/todos/todo-1'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.todo.id).toBe('todo-1');
      expect(body.todo.title).toBe('Review document');
      expect(body.todo.email).toBeDefined();
    });

    it('should return 404 for non-existent todo', async () => {
      mockDbService.prisma.todo.findFirst.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/todos/non-existent'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Todo not found');
    });
  });

  describe('POST /todos/reprocess', () => {
    it('should reprocess email for todo extraction', async () => {
      const mockEmail = {
        id: 'email-1',
        account: { userId: 'test-user-123' }
      };

      const mockResult = {
        success: true,
        emailId: 'email-1',
        classification: {
          category: 'work',
          confidence: 0.8
        },
        todoExtraction: {
          hasTodos: true,
          todos: [{ title: 'Review document' }]
        },
        metadata: {
          processingTime: 1000
        }
      };

      mockDbService.prisma.email.findFirst.mockResolvedValue(mockEmail as any);
      mockAIProcessor.updateProcessingConfig.mockResolvedValue();
      mockAIProcessor.reprocessEmail.mockResolvedValue(mockResult as any);

      const response = await app.inject({
        method: 'POST',
        url: '/todos/reprocess',
        payload: {
          emailId: 'email-1',
          enableCategorization: true,
          enableTodoExtraction: true
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.processing.classification).toBeDefined();
      expect(body.processing.todoExtraction).toBeDefined();
    });

    it('should reject reprocessing for non-existent email', async () => {
      mockDbService.prisma.email.findFirst.mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/todos/reprocess',
        payload: {
          emailId: 'non-existent',
          enableTodoExtraction: true
        }
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Email not found');
    });

    it('should handle reprocessing failures', async () => {
      const mockEmail = {
        id: 'email-1',
        account: { userId: 'test-user-123' }
      };

      mockDbService.prisma.email.findFirst.mockResolvedValue(mockEmail as any);
      mockAIProcessor.updateProcessingConfig.mockResolvedValue();
      mockAIProcessor.reprocessEmail.mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/todos/reprocess',
        payload: {
          emailId: 'email-1',
          enableTodoExtraction: true
        }
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Email processing result not found');
    });
  });

  describe('Authentication', () => {
    beforeEach(async () => {
      await app.close();
      
      // Create app without authentication mock
      app = fastify();
      app.decorate('authenticate', async () => {
        throw new Error('Unauthorized');
      });
      
      await app.register(todoRoutes, { prefix: '/todos' });
    });

    it('should require authentication for all routes', async () => {
      const routes = [
        { method: 'GET', url: '/todos' },
        { method: 'POST', url: '/todos' },
        { method: 'PATCH', url: '/todos/123' },
        { method: 'DELETE', url: '/todos/123' },
        { method: 'GET', url: '/todos/123' },
        { method: 'POST', url: '/todos/reprocess' }
      ];

      for (const route of routes) {
        const response = await app.inject({
          method: route.method,
          url: route.url,
          payload: route.method !== 'GET' ? {} : undefined
        });
        
        expect(response.statusCode).toBe(500); // Fastify throws 500 for unhandled auth errors
      }
    });
  });
});