import { FastifyPluginAsync } from 'fastify';
import { DatabaseService } from '../db/database';
import { AIEmailProcessorService } from '../services/ai-email-processor';
import { 
  todoQuerySchema, 
  todoCreateSchema, 
  todoUpdateSchema, 
  todoParamsSchema,
  emailReprocessSchema
} from '../schemas/categorization';
import { ValidationError, NotFoundError, handleError } from '../types/errors';
import { getAuthenticatedUser } from '../utils/auth';
import pino from 'pino';

const logger = pino().child({ module: 'TodoRoutes' });

export const todoRoutes: FastifyPluginAsync = async (fastify) => {
  const dbService = DatabaseService.getInstance();
  const aiProcessor = new AIEmailProcessorService();

  // Get todos for authenticated user
  fastify.get('/', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const user = getAuthenticatedUser(request);
      const userId = user.userId;

      // Validate query parameters
      const queryResult = todoQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        throw new ValidationError('Invalid query parameters', queryResult.error.errors);
      }

      const { page, limit, status, priority, dueBefore, dueAfter, search } = queryResult.data;
      const offset = (page - 1) * limit;

      // Build where conditions
      const whereConditions: any = {
        email: {
          account: {
            userId
          }
        }
      };

      if (status) {
        whereConditions.status = status;
      }

      if (priority) {
        whereConditions.priority = priority;
      }

      if (dueBefore || dueAfter) {
        whereConditions.dueDate = {};
        if (dueBefore) whereConditions.dueDate.lte = dueBefore;
        if (dueAfter) whereConditions.dueDate.gte = dueAfter;
      }

      if (search) {
        whereConditions.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ];
      }

      // Fetch todos with pagination
      const [todos, total] = await Promise.all([
        dbService.prisma.todo.findMany({
          where: whereConditions,
          include: {
            email: {
              select: {
                id: true,
                subject: true,
                sender: true,
                receivedAt: true,
                account: {
                  select: {
                    provider: true,
                    email: true
                  }
                }
              }
            }
          },
          orderBy: [
            { priority: 'desc' },
            { dueDate: 'asc' },
            { createdAt: 'desc' }
          ],
          skip: offset,
          take: limit
        }),
        dbService.prisma.todo.count({
          where: whereConditions
        })
      ]);

      return {
        todos: todos.map((todo: any) => ({
          id: todo.id,
          title: todo.title,
          description: todo.description,
          priority: todo.priority,
          status: todo.status,
          dueDate: todo.dueDate,
          confidence: todo.confidence,
          context: todo.context,
          completedAt: todo.completedAt,
          createdAt: todo.createdAt,
          updatedAt: todo.updatedAt,
          email: (todo as any).email
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      logger.error('Failed to fetch todos', error);
      const apiError = handleError(error);
      return reply.status(apiError.statusCode).send(apiError);
    }
  });

  // Create a new todo
  fastify.post('/', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const user = getAuthenticatedUser(request);
      const userId = user.userId;

      // Validate request body
      const bodyResult = todoCreateSchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw new ValidationError('Invalid request body', bodyResult.error.errors);
      }

      const { emailId, title, description, priority, dueDate, context } = bodyResult.data;

      // Verify email belongs to user
      const email = await dbService.prisma.email.findFirst({
        where: {
          id: emailId,
          account: {
            userId
          }
        }
      });

      if (!email) {
        throw new NotFoundError('Email');
      }

      // Create todo
      const todo = await dbService.prisma.todo.create({
        data: {
          emailId,
          userId,
          title,
          description,
          priority,
          status: 'pending',
          dueDate,
          confidence: 1.0, // Manual todos have 100% confidence
          context: context ? JSON.stringify({ text: context }) : JSON.stringify({ text: title })
        },
        include: {
          email: {
            select: {
              id: true,
              subject: true,
              sender: true,
              receivedAt: true,
              account: {
                select: {
                  provider: true,
                  email: true
                }
              }
            }
          }
        }
      });

      // Update email to mark as having todos
      await dbService.prisma.email.update({
        where: { id: emailId },
        data: { hasTodos: true }
      });

      logger.info('Todo created', { todoId: todo.id, emailId });

      return {
        success: true,
        todo: {
          id: todo.id,
          title: todo.title,
          description: todo.description,
          priority: todo.priority,
          status: todo.status,
          dueDate: todo.dueDate,
          confidence: todo.confidence,
          context: todo.context,
          createdAt: todo.createdAt,
          email: (todo as any).email
        }
      };

    } catch (error) {
      logger.error('Failed to create todo', error);
      const apiError = handleError(error);
      return reply.status(apiError.statusCode).send(apiError);
    }
  });

  // Update a todo
  fastify.patch('/:todoId', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const user = getAuthenticatedUser(request);
      const userId = user.userId;

      // Validate parameters
      const paramsResult = todoParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        throw new ValidationError('Invalid parameters', paramsResult.error.errors);
      }

      // Validate request body
      const bodyResult = todoUpdateSchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw new ValidationError('Invalid request body', bodyResult.error.errors);
      }

      const { todoId } = paramsResult.data;
      const updateData = bodyResult.data;

      // Verify todo belongs to user
      const existingTodo = await dbService.prisma.todo.findFirst({
        where: {
          id: todoId,
          email: {
            account: {
              userId
            }
          }
        }
      });

      if (!existingTodo) {
        throw new NotFoundError('Todo');
      }

      // Handle status change to completed
      if (updateData.status === 'completed' && existingTodo.status !== 'completed') {
        (updateData as any).completedAt = new Date();
      }

      // Update todo
      const updatedTodo = await dbService.prisma.todo.update({
        where: { id: todoId },
        data: updateData,
        include: {
          email: {
            select: {
              id: true,
              subject: true,
              sender: true,
              receivedAt: true,
              account: {
                select: {
                  provider: true,
                  email: true
                }
              }
            }
          }
        }
      });

      logger.info('Todo updated', { todoId, updateData });

      return {
        success: true,
        todo: {
          id: updatedTodo.id,
          title: updatedTodo.title,
          description: updatedTodo.description,
          priority: updatedTodo.priority,
          status: updatedTodo.status,
          dueDate: updatedTodo.dueDate,
          confidence: updatedTodo.confidence,
          context: updatedTodo.context,
          completedAt: updatedTodo.completedAt,
          createdAt: updatedTodo.createdAt,
          updatedAt: updatedTodo.updatedAt,
          email: updatedTodo.email
        }
      };

    } catch (error) {
      logger.error('Failed to update todo', error);
      const apiError = handleError(error);
      return reply.status(apiError.statusCode).send(apiError);
    }
  });

  // Delete a todo
  fastify.delete('/:todoId', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const user = getAuthenticatedUser(request);
      const userId = user.userId;

      // Validate parameters
      const paramsResult = todoParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        throw new ValidationError('Invalid parameters', paramsResult.error.errors);
      }

      const { todoId } = paramsResult.data;

      // Verify todo belongs to user
      const existingTodo = await dbService.prisma.todo.findFirst({
        where: {
          id: todoId,
          email: {
            account: {
              userId
            }
          }
        }
      });

      if (!existingTodo) {
        throw new NotFoundError('Todo');
      }

      // Delete todo
      await dbService.prisma.todo.delete({
        where: { id: todoId }
      });

      // Check if email still has other todos
      const remainingTodos = await dbService.prisma.todo.count({
        where: { emailId: existingTodo.emailId }
      });

      // Update email hasTodos flag if no todos remain
      if (remainingTodos === 0) {
        await dbService.prisma.email.update({
          where: { id: existingTodo.emailId },
          data: { hasTodos: false }
        });
      }

      logger.info('Todo deleted', { todoId });

      return {
        success: true,
        message: 'Todo deleted successfully'
      };

    } catch (error) {
      logger.error('Failed to delete todo', error);
      const apiError = handleError(error);
      return reply.status(apiError.statusCode).send(apiError);
    }
  });

  // Get todo by ID
  fastify.get('/:todoId', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const user = getAuthenticatedUser(request);
      const userId = user.userId;

      // Validate parameters
      const paramsResult = todoParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        throw new ValidationError('Invalid parameters', paramsResult.error.errors);
      }

      const { todoId } = paramsResult.data;

      const todo = await dbService.prisma.todo.findFirst({
        where: {
          id: todoId,
          email: {
            account: {
              userId
            }
          }
        },
        include: {
          email: {
            select: {
              id: true,
              subject: true,
              sender: true,
              receivedAt: true,
              body: true,
              account: {
                select: {
                  provider: true,
                  email: true
                }
              }
            }
          }
        }
      });

      if (!todo) {
        throw new NotFoundError('Todo');
      }

      return {
        todo: {
          id: todo.id,
          title: todo.title,
          description: todo.description,
          priority: todo.priority,
          status: todo.status,
          dueDate: todo.dueDate,
          confidence: todo.confidence,
          context: todo.context,
          completedAt: todo.completedAt,
          createdAt: todo.createdAt,
          updatedAt: todo.updatedAt,
          email: (todo as any).email
        }
      };

    } catch (error) {
      logger.error('Failed to fetch todo', error);
      const apiError = handleError(error);
      return reply.status(apiError.statusCode).send(apiError);
    }
  });

  // Reprocess email for todo extraction
  fastify.post('/reprocess', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const user = getAuthenticatedUser(request);
      const userId = user.userId;

      // Validate request body
      const bodyResult = emailReprocessSchema.safeParse(request.body);
      if (!bodyResult.success) {
        throw new ValidationError('Invalid request body', bodyResult.error.errors);
      }

      const { emailId, enableCategorization, enableTodoExtraction } = bodyResult.data;

      // Verify email belongs to user
      const email = await dbService.prisma.email.findFirst({
        where: {
          id: emailId,
          account: {
            userId
          }
        }
      });

      if (!email) {
        throw new NotFoundError('Email');
      }

      // Configure AI processor
      await aiProcessor.updateProcessingConfig({
        enableCategorization,
        enableTodoExtraction
      });

      // Reprocess email
      const result = await aiProcessor.reprocessEmail(emailId);

      if (!result) {
        throw new NotFoundError('Email processing result');
      }

      logger.info('Email reprocessed', { emailId, result: result.success });

      return {
        success: result.success,
        processing: {
          classification: result.classification,
          todoExtraction: result.todoExtraction,
          metadata: result.metadata
        }
      };

    } catch (error) {
      logger.error('Failed to reprocess email', error);
      const apiError = handleError(error);
      return reply.status(apiError.statusCode).send(apiError);
    }
  });
};