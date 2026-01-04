import { EmailCategorizationService } from './email-categorization';
import { TodoExtractionService } from './todo-extraction';
import { DatabaseService } from '../db/database';
import { 
  EmailClassificationResult, 
  TodoExtractionResult, 
  AIProcessingConfig,
  ProcessingMetadata
} from '../types/categorization';
import pino from 'pino';

const logger = pino().child({ module: 'AIEmailProcessor' });

interface EmailProcessingInput {
  id: string;
  subject: string;
  body: string;
  sender: string;
  receivedAt: Date;
}

interface EmailProcessingResult {
  emailId: string;
  classification: EmailClassificationResult;
  todoExtraction: TodoExtractionResult;
  metadata: ProcessingMetadata;
  success: boolean;
  error?: string;
}

export class AIEmailProcessorService {
  private readonly categorizationService: EmailCategorizationService;
  private readonly todoExtractionService: TodoExtractionService;
  private readonly dbService: DatabaseService;
  private readonly config: AIProcessingConfig;

  constructor(config?: Partial<AIProcessingConfig>) {
    this.config = {
      enableCategorization: true,
      enableTodoExtraction: true,
      enableNewsletterDetection: true,
      maxTokensPerEmail: 4000,
      confidenceThreshold: 0.5,
      batchSize: 10,
      ...config
    };

    this.categorizationService = new EmailCategorizationService(this.config);
    this.todoExtractionService = new TodoExtractionService(this.config);
    this.dbService = DatabaseService.getInstance();
  }

  async processEmail(email: EmailProcessingInput): Promise<EmailProcessingResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting email processing', { 
        emailId: email.id, 
        subject: email.subject?.substring(0, 50) || 'No subject' 
      });

      let classification: EmailClassificationResult | null = null;
      let todoExtraction: TodoExtractionResult | null = null;

      // Run categorization and todo extraction in parallel if both enabled
      const promises: Promise<any>[] = [];

      if (this.config.enableCategorization) {
        promises.push(
          this.categorizationService.classifyEmail(
            email.subject || '', 
            email.body || '', 
            email.sender
          )
        );
      }

      if (this.config.enableTodoExtraction) {
        promises.push(
          this.todoExtractionService.extractTodos(
            email.subject || '', 
            email.body || '', 
            email.sender
          )
        );
      }

      const results = await Promise.allSettled(promises);

      // Extract results
      if (this.config.enableCategorization && results[0]) {
        if (results[0].status === 'fulfilled') {
          classification = results[0].value;
        } else {
          logger.error('Categorization failed', results[0].reason);
        }
      }

      if (this.config.enableTodoExtraction) {
        const todoIndex = this.config.enableCategorization ? 1 : 0;
        if (results[todoIndex] && results[todoIndex].status === 'fulfilled') {
          todoExtraction = (results[todoIndex] as PromiseFulfilledResult<TodoExtractionResult>).value;
        } else if (results[todoIndex]) {
          logger.error('Todo extraction failed', (results[todoIndex] as PromiseRejectedResult).reason);
        }
      }

      // Save results to database
      await this.saveProcessingResults(email.id, classification, todoExtraction);

      const processingTime = Date.now() - startTime;
      const metadata: ProcessingMetadata = {
        processedAt: new Date(),
        processingVersion: '1.0.0',
        tokensUsed: this.estimateTokensUsed(email.subject || '', email.body || ''),
        processingTime,
        errors: []
      };

      logger.info('Email processing completed', {
        emailId: email.id,
        processingTime,
        category: classification?.category,
        todosFound: todoExtraction?.todos.length || 0
      });

      return {
        emailId: email.id,
        classification: classification || {
          category: 'other',
          subcategories: [],
          confidence: 0,
          isNewsletter: false,
          priority: null,
          reasoning: 'Classification disabled or failed'
        },
        todoExtraction: todoExtraction || {
          todos: [],
          hasTodos: false,
          confidence: 0,
          reasoning: 'Todo extraction disabled or failed'
        },
        metadata,
        success: true
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Email processing failed', { emailId: email.id, error });

      return {
        emailId: email.id,
        classification: {
          category: 'other',
          subcategories: [],
          confidence: 0,
          isNewsletter: false,
          priority: null,
          reasoning: 'Processing failed due to error'
        },
        todoExtraction: {
          todos: [],
          hasTodos: false,
          confidence: 0,
          reasoning: 'Processing failed due to error'
        },
        metadata: {
          processedAt: new Date(),
          processingVersion: '1.0.0',
          tokensUsed: 0,
          processingTime,
          errors: [error instanceof Error ? error.message : 'Unknown error']
        },
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async processBatchEmails(emails: EmailProcessingInput[]): Promise<EmailProcessingResult[]> {
    logger.info('Starting batch email processing', { emailCount: emails.length });

    const results: EmailProcessingResult[] = [];
    const batchSize = this.config.batchSize;

    // Process in smaller batches to manage memory and avoid timeouts
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      
      logger.info('Processing batch', { 
        batchNumber: Math.floor(i / batchSize) + 1, 
        batchSize: batch.length 
      });

      const batchPromises = batch.map(email => this.processEmail(email));
      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          logger.error('Batch email processing failed', { 
            emailId: batch[index].id, 
            error: result.reason 
          });
          
          // Add failed result
          results.push({
            emailId: batch[index].id,
            classification: {
              category: 'other',
              subcategories: [],
              confidence: 0,
              isNewsletter: false,
              priority: null,
              reasoning: 'Batch processing failed'
            },
            todoExtraction: {
              todos: [],
              hasTodos: false,
              confidence: 0,
              reasoning: 'Batch processing failed'
            },
            metadata: {
              processedAt: new Date(),
              processingVersion: '1.0.0',
              tokensUsed: 0,
              processingTime: 0,
              errors: ['Batch processing failed']
            },
            success: false,
            error: 'Batch processing failed'
          });
        }
      });
    }

    logger.info('Batch email processing completed', { 
      totalEmails: emails.length,
      successfulResults: results.filter(r => r.success).length,
      failedResults: results.filter(r => !r.success).length
    });

    return results;
  }

  private async saveProcessingResults(
    emailId: string, 
    classification: EmailClassificationResult | null,
    todoExtraction: TodoExtractionResult | null
  ): Promise<void> {
    try {
      // Update email with classification results
      if (classification) {
        await this.dbService.prisma.email.update({
          where: { id: emailId },
          data: {
            category: classification.category,
            subcategories: classification.subcategories,
            isNewsletter: classification.isNewsletter,
            priority: (() => {
              const p = classification.priority;
              if (!p) return 3;
              switch (p) {
                case 'urgent': return 1;
                case 'high': return 2;
                case 'medium': return 3;
                case 'low': return 4;
                default: return 3;
              }
            })(),
            hasTodos: todoExtraction?.hasTodos || false,
            processedAt: new Date(),
            metadata: {
              classification: {
                confidence: classification.confidence,
                reasoning: classification.reasoning
              },
              todoExtraction: todoExtraction ? {
                confidence: todoExtraction.confidence,
                reasoning: todoExtraction.reasoning
              } : null
            }
          }
        });
      }

      // Save extracted todos
      if (todoExtraction?.hasTodos && todoExtraction.todos.length > 0) {
        // Get the email with user information
        const emailWithUser = await this.dbService.prisma.email.findUnique({
          where: { id: emailId },
          include: { account: true }
        });

        if (!emailWithUser) {
          logger.error('Email not found for todo creation', { emailId });
          return;
        }

        const todosToCreate = todoExtraction.todos.map(todo => ({
          emailId,
          userId: emailWithUser.account.userId,
          title: todo.title,
          description: todo.description,
          priority: todo.priority.toString(), // Convert TodoPriority to string
          status: todo.status,
          dueDate: todo.dueDate,
          confidence: todo.confidence,
          context: todo.context
        }));

        await this.dbService.prisma.todo.createMany({
          data: todosToCreate,
          skipDuplicates: true
        });
      }

    } catch (error) {
      logger.error('Failed to save processing results', { emailId, error });
      throw error;
    }
  }

  private estimateTokensUsed(subject: string, body: string): number {
    // Rough estimation: ~4 characters per token
    const totalChars = subject.length + body.length;
    return Math.ceil(totalChars / 4);
  }

  async updateProcessingConfig(newConfig: Partial<AIProcessingConfig>): Promise<void> {
    Object.assign(this.config, newConfig);
    logger.info('Processing config updated', { config: this.config });
  }

  getProcessingConfig(): AIProcessingConfig {
    return { ...this.config };
  }

  async reprocessEmail(emailId: string): Promise<EmailProcessingResult | null> {
    try {
      // Fetch email from database
      const email = await this.dbService.prisma.email.findUnique({
        where: { id: emailId }
      });

      if (!email) {
        logger.warn('Email not found for reprocessing', { emailId });
        return null;
      }

      // Clear existing todos
      await this.dbService.prisma.todo.deleteMany({
        where: { emailId }
      });

      // Reprocess
      const result = await this.processEmail({
        id: email.id,
        subject: email.subject || '',
        body: email.body || '',
        sender: email.sender,
        receivedAt: email.receivedAt
      });

      logger.info('Email reprocessed successfully', { emailId });
      return result;

    } catch (error) {
      logger.error('Failed to reprocess email', { emailId, error });
      throw error;
    }
  }
}