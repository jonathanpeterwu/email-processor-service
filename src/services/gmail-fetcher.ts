import { gmail_v1 } from 'googleapis';
import { GoogleOAuthService } from '../auth/google-oauth';
import { DatabaseService } from '../db/database';
import { AIEmailProcessorService } from './ai-email-processor';
import { EmailMessage, SyncOptions, SyncResult, EmailHeaders } from '../types/email';
import pino from 'pino';

const logger = pino().child({ module: 'GmailFetcher' });

export class GmailFetcherService {
  private googleOAuth: GoogleOAuthService;
  private dbService: DatabaseService;
  private aiProcessor: AIEmailProcessorService;

  constructor() {
    this.googleOAuth = new GoogleOAuthService();
    this.dbService = DatabaseService.getInstance();
    this.aiProcessor = new AIEmailProcessorService();
  }

  async syncEmailsForAccount(accountId: string, options: Partial<SyncOptions> = {}): Promise<SyncResult> {
    const startTime = Date.now();
    let totalFetched = 0;
    let totalProcessed = 0;
    const errors: string[] = [];

    try {
      // Get account details
      const account = await this.dbService.prisma.emailAccount.findUnique({
        where: { id: accountId },
        include: { user: true }
      });

      if (!account || !account.isActive) {
        throw new Error('Account not found or inactive');
      }

      if (account.provider !== 'gmail') {
        throw new Error('Account is not a Gmail account');
      }

      // Get Gmail client
      const accessToken = this.googleOAuth.decryptToken(account.accessToken!);
      const refreshToken = account.refreshToken ? this.googleOAuth.decryptToken(account.refreshToken) : undefined;
      const gmail = this.googleOAuth.getGmailClient(accessToken, refreshToken);

      // Create sync history record
      const syncHistory = await this.dbService.prisma.syncHistory.create({
        data: {
          accountId,
          syncType: options.since ? 'incremental' : 'initial',
          status: 'running',
          metadata: { options }
        }
      });

      try {
        // Build query for messages
        const query = this.buildGmailQuery(options);
        
        // List messages
        const messageList = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: options.maxEmails || 100,
          includeSpamTrash: false
        });

        const messageIds = messageList.data.messages || [];
        totalFetched = messageIds.length;

        logger.info(`Found ${totalFetched} messages for account ${accountId}`);

        // Fetch and process each message
        for (const message of messageIds) {
          try {
            if (!message.id) continue;

            // Check if we already have this message
            const existingEmail = await this.dbService.prisma.email.findFirst({
              where: {
                accountId,
                messageId: message.id
              }
            });

            if (existingEmail) {
              logger.debug(`Skipping existing message ${message.id}`);
              continue;
            }

            // Fetch full message
            const fullMessage = await gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full'
            });

            // Parse and store the email
            const parsedEmail = this.parseGmailMessage(fullMessage.data, accountId);
            const storedEmail = await this.storeEmail(parsedEmail, accountId);
            
            // Process with AI for categorization and todo extraction
            if (storedEmail) {
              try {
                await this.aiProcessor.processEmail({
                  id: storedEmail.id,
                  subject: parsedEmail.subject || '',
                  body: parsedEmail.body?.text || parsedEmail.snippet || '',
                  sender: parsedEmail.from,
                  receivedAt: parsedEmail.receivedAt
                });
              } catch (aiError) {
                logger.warn('AI processing failed for email', { 
                  emailId: storedEmail.id, 
                  error: aiError 
                });
              }
            }
            
            totalProcessed++;

          } catch (error) {
            const errorMsg = `Failed to process message ${message.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            logger.error(errorMsg);
            errors.push(errorMsg);
          }
        }

        // Update sync history as completed
        await this.dbService.prisma.syncHistory.update({
          where: { id: syncHistory.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            emailsFetched: totalFetched,
            emailsProcessed: totalProcessed,
            errorMessage: errors.length > 0 ? errors.join('; ') : null
          }
        });

        // Update account last sync time
        await this.dbService.prisma.emailAccount.update({
          where: { id: accountId },
          data: { lastSyncAt: new Date() }
        });

        logger.info(`Gmail sync completed for account ${accountId}`, {
          totalFetched,
          totalProcessed,
          errors: errors.length,
          duration: Date.now() - startTime
        });

      } catch (error) {
        // Update sync history as failed
        await this.dbService.prisma.syncHistory.update({
          where: { id: syncHistory.id },
          data: {
            status: 'failed',
            completedAt: new Date(),
            emailsFetched: totalFetched,
            emailsProcessed: totalProcessed,
            errorMessage: error instanceof Error ? error.message : 'Unknown error'
          }
        });
        throw error;
      }

    } catch (error) {
      logger.error('Gmail sync failed', { accountId, error });
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMsg);
    }

    return {
      totalFetched,
      totalProcessed,
      todosExtracted: 0,
      errors,
      duration: Date.now() - startTime
    };
  }

  private buildGmailQuery(options: Partial<SyncOptions>): string {
    const queryParts: string[] = [];

    // Date filter
    if (options.since) {
      const dateStr = options.since.toISOString().split('T')[0].replace(/-/g, '/');
      queryParts.push(`after:${dateStr}`);
    }

    // Labels
    if (options.labelIds && options.labelIds.length > 0) {
      queryParts.push(`label:${options.labelIds.join(' OR label:')}`);
    } else {
      // Default: exclude spam and trash
      queryParts.push('-in:spam -in:trash');
    }

    // Custom query
    if (options.query) {
      queryParts.push(options.query);
    }

    return queryParts.join(' ');
  }

  private parseGmailMessage(message: gmail_v1.Schema$Message, _accountId: string): EmailMessage {
    const headers = this.parseHeaders(message.payload?.headers || []);
    const body = this.extractBody(message.payload);

    return {
      id: '', // Will be generated by database
      messageId: message.id!,
      threadId: message.threadId || undefined,
      headers,
      from: headers.from || 'Unknown',
      to: this.parseEmailList(headers.to),
      cc: this.parseEmailList(headers.cc),
      bcc: this.parseEmailList(headers.bcc),
      subject: headers.subject || '(no subject)',
      body: {
        text: body.text,
        html: body.html
      },
      snippet: message.snippet || undefined,
      receivedAt: new Date(parseInt(message.internalDate || '0')),
      labels: message.labelIds || [],
      raw: undefined // Not storing raw for space efficiency
    };
  }

  private parseHeaders(headers: gmail_v1.Schema$MessagePartHeader[]): EmailHeaders {
    const parsedHeaders: EmailHeaders = {};
    
    headers.forEach(header => {
      if (header.name && header.value) {
        const name = header.name.toLowerCase();
        parsedHeaders[name] = header.value;
      }
    });

    return parsedHeaders;
  }

  private extractBody(payload?: gmail_v1.Schema$MessagePart): { text?: string; html?: string } {
    let text: string | undefined;
    let html: string | undefined;

    const extractFromPart = (part: gmail_v1.Schema$MessagePart) => {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        text = Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        html = Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.parts) {
        part.parts.forEach(extractFromPart);
      }
    };

    if (payload) {
      extractFromPart(payload);
    }

    return { text, html };
  }

  private parseEmailList(emailString?: string | string[]): string[] {
    if (!emailString) return [];
    
    if (Array.isArray(emailString)) {
      return emailString.flatMap(email => this.parseEmailList(email));
    }
    
    // Simple email parsing - could be enhanced for more complex cases
    return emailString
      .split(',')
      .map(email => email.trim())
      .filter(email => email.includes('@'));
  }

  private async storeEmail(email: EmailMessage, accountId: string): Promise<{ id: string } | null> {
    try {
      const storedEmail = await this.dbService.prisma.email.create({
        data: {
          accountId,
          messageId: email.messageId,
          threadId: email.threadId,
          subject: email.subject,
          sender: email.from,
          recipients: email.to,
          body: email.body.text,
          snippet: email.snippet,
          receivedAt: email.receivedAt,
          metadata: {
            headers: email.headers,
            labels: email.labels,
            body: email.body
          }
        }
      });
      
      return storedEmail;
    } catch (error) {
      logger.error('Failed to store email', { messageId: email.messageId, error });
      return null;
    }
  }
}