import Imap from 'node-imap';
import { YahooOAuthService } from '../auth/yahoo-oauth';
import { DatabaseService } from '../db/database';
import { EmailMessage, SyncOptions, SyncResult, EmailHeaders } from '../types/email';
import pino from 'pino';
import { simpleParser, ParsedMail } from 'mailparser';

const logger = pino().child({ module: 'YahooFetcher' });

export class YahooFetcherService {
  private yahooOAuth: YahooOAuthService;
  private dbService: DatabaseService;

  constructor() {
    this.yahooOAuth = new YahooOAuthService();
    this.dbService = DatabaseService.getInstance();
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

      if (account.provider !== 'yahoo') {
        throw new Error('Account is not a Yahoo account');
      }

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
        // Get IMAP connection
        const imap = await this.getImapConnection(account);
        
        await new Promise<void>((resolve, reject) => {
          imap.once('ready', async () => {
            try {
              // Select INBOX
              imap.openBox('INBOX', true, async (err, box) => {
                if (err) {
                  reject(err);
                  return;
                }

                logger.info(`Connected to Yahoo IMAP for account ${accountId}`, {
                  totalMessages: box.messages.total
                });

                // Build search criteria
                const searchCriteria = this.buildSearchCriteria(options);
                
                // Search for messages
                imap.search(searchCriteria, async (err, uids) => {
                  if (err) {
                    reject(err);
                    return;
                  }

                  totalFetched = uids.length;
                  logger.info(`Found ${totalFetched} messages for account ${accountId}`);

                  if (uids.length === 0) {
                    imap.end();
                    resolve();
                    return;
                  }

                  // Limit the number of messages to fetch
                  const limitedUids = uids.slice(0, options.maxEmails || 100);

                  // Fetch messages
                  const fetchRequest = imap.fetch(limitedUids, {
                    bodies: '',
                    struct: true
                  });

                  fetchRequest.on('message', (msg, seqno) => {
                    this.processMessage(msg, seqno, accountId)
                      .then(() => {
                        totalProcessed++;
                      })
                      .catch(error => {
                        const errorMsg = `Failed to process message ${seqno}: ${error.message}`;
                        logger.error(errorMsg);
                        errors.push(errorMsg);
                      });
                  });

                  fetchRequest.once('error', reject);

                  fetchRequest.once('end', () => {
                    logger.info(`Finished fetching messages for account ${accountId}`);
                    imap.end();
                    resolve();
                  });
                });
              });
            } catch (error) {
              reject(error);
            }
          });

          imap.once('error', reject);
          imap.connect();
        });

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

        logger.info(`Yahoo sync completed for account ${accountId}`, {
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
      logger.error('Yahoo sync failed', { accountId, error });
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMsg);
    }

    return {
      totalFetched,
      totalProcessed,
      todosExtracted: 0, // Will be implemented in todo extraction phase
      errors,
      duration: Date.now() - startTime
    };
  }

  private async getImapConnection(account: any): Promise<Imap> {
    // Get access token
    const accessToken = this.yahooOAuth.decryptToken(account.accessToken);
    
    // Create IMAP connection with OAuth
    const imap = new Imap({
      host: 'imap.mail.yahoo.com',
      port: 993,
      tls: true,
      authTimeout: 3000,
      connTimeout: 10000,
      user: account.email,
      password: '', // Required but not used with xoauth2
      xoauth2: accessToken
    });

    return imap;
  }

  private buildSearchCriteria(options: Partial<SyncOptions>): any[] {
    const criteria: any[] = ['ALL'];

    // Date filter
    if (options.since) {
      criteria.push(['SINCE', options.since]);
    }

    // Custom query handling (simplified)
    if (options.query) {
      if (options.query.includes('subject:')) {
        const subject = options.query.replace('subject:', '').trim();
        criteria.push(['SUBJECT', subject]);
      }
    }

    return criteria;
  }

  private async processMessage(msg: any, seqno: number, accountId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      
      msg.on('body', (stream: any) => {
        stream.on('data', (chunk: Buffer) => {
          buffer = Buffer.concat([buffer, chunk]);
        });

        stream.once('end', async () => {
          try {
            // Parse the email
            const parsedMail = await simpleParser(buffer);
            
            // Check if we already have this message
            const messageId = parsedMail.messageId || `yahoo_${seqno}_${Date.now()}`;
            
            const existingEmail = await this.dbService.prisma.email.findFirst({
              where: {
                accountId,
                messageId
              }
            });

            if (existingEmail) {
              logger.debug(`Skipping existing message ${messageId}`);
              resolve();
              return;
            }

            // Convert parsed mail to our email format
            const email = this.parseYahooMessage(parsedMail, accountId, messageId);
            await this.storeEmail(email, accountId);
            
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });

      msg.once('attributes', (_attrs: any) => {
        // Could store additional attributes if needed
      });

      msg.once('end', () => {
        // Message processing complete
      });
    });
  }

  private parseYahooMessage(mail: ParsedMail, _accountId: string, messageId: string): EmailMessage {
    const headers: EmailHeaders = {};
    
    // Extract headers
    if (mail.headers) {
      for (const [key, value] of mail.headers) {
        headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value?.toString();
      }
    }

    return {
      id: '', // Will be generated by database
      messageId,
      threadId: mail.references?.[0] || undefined,
      headers,
      from: this.getAddressText(mail.from) || 'Unknown',
      to: this.getAddressArray(mail.to),
      cc: this.getAddressArray(mail.cc),
      bcc: this.getAddressArray(mail.bcc),
      subject: mail.subject || '(no subject)',
      body: {
        text: mail.text,
        html: mail.html || undefined
      },
      snippet: this.generateSnippet(mail.text),
      receivedAt: mail.date || new Date(),
      attachments: mail.attachments?.map(att => ({
        id: att.contentId || att.filename || 'unknown',
        filename: att.filename || 'unnamed',
        contentType: att.contentType || 'application/octet-stream',
        size: att.size || 0,
        contentId: att.contentId
      })) || [],
      raw: undefined // Not storing raw for space efficiency
    };
  }

  private generateSnippet(text?: string): string | undefined {
    if (!text) return undefined;
    
    // Generate a snippet (first 150 characters)
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 150);
    return snippet.length < text.length ? snippet + '...' : snippet;
  }

  private getAddressText(address: any): string | undefined {
    if (!address) return undefined;
    if (Array.isArray(address)) {
      return address[0]?.text || address[0]?.address || undefined;
    }
    return address.text || address.address || undefined;
  }

  private getAddressArray(address: any): string[] {
    if (!address) return [];
    if (Array.isArray(address)) {
      return address.map(addr => addr.text || addr.address || '').filter(Boolean);
    }
    const text = address.text || address.address;
    return text ? [text] : [];
  }

  private async storeEmail(email: EmailMessage, accountId: string): Promise<void> {
    try {
      await this.dbService.prisma.email.create({
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
          metadata: JSON.stringify({
            headers: email.headers,
            attachments: email.attachments || [],
            body: email.body
          }) as any
        }
      });
    } catch (error) {
      logger.error('Failed to store email', { messageId: email.messageId, error });
      throw error;
    }
  }
}