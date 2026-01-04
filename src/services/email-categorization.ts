import { 
  EmailCategory, 
  EmailClassificationResult, 
  CategoryPatterns, 
  NewsletterDetectionResult,
  AIProcessingConfig 
} from '../types/categorization';
import pino from 'pino';

const logger = pino().child({ module: 'EmailCategorization' });

export class EmailCategorizationService {
  private readonly categoryPatterns: Record<EmailCategory, CategoryPatterns>;
  private readonly config: AIProcessingConfig;

  constructor(config: AIProcessingConfig) {
    this.config = config;
    this.categoryPatterns = this.initializeCategoryPatterns();
  }

  private initializeCategoryPatterns(): Record<EmailCategory, CategoryPatterns> {
    return {
      newsletter: {
        keywords: ['newsletter', 'unsubscribe', 'digest', 'weekly', 'monthly', 'edition'],
        senderPatterns: ['newsletter@', 'news@', 'updates@', 'marketing@'],
        subjectPatterns: ['newsletter', 'weekly digest', 'monthly update', 'edition'],
        bodyPatterns: ['unsubscribe', 'manage preferences', 'view in browser', 'list-unsubscribe'],
        domainPatterns: ['mailchimp.com', 'constantcontact.com', 'aweber.com']
      },
      social: {
        keywords: ['notification', 'friend', 'like', 'comment', 'share', 'follow'],
        senderPatterns: ['notification@', 'noreply@facebook', 'noreply@twitter', 'noreply@linkedin'],
        subjectPatterns: ['liked your', 'commented on', 'friend request', 'mentioned you'],
        bodyPatterns: ['social network', 'your profile', 'activity on'],
        domainPatterns: ['facebook.com', 'twitter.com', 'linkedin.com', 'instagram.com']
      },
      promotional: {
        keywords: ['sale', 'discount', 'offer', 'deal', 'promotion', 'coupon', 'save'],
        senderPatterns: ['promo@', 'deals@', 'offers@', 'marketing@'],
        subjectPatterns: ['% off', 'sale', 'discount', 'limited time', 'expires'],
        bodyPatterns: ['promotional', 'limited time', 'act now', 'shop now'],
        domainPatterns: ['amazon.com', 'ebay.com', 'groupon.com']
      },
      work: {
        keywords: ['meeting', 'deadline', 'project', 'report', 'team', 'urgent'],
        senderPatterns: ['hr@', 'team@', 'admin@'],
        subjectPatterns: ['re:', 'fwd:', 'meeting', 'project', 'urgent'],
        bodyPatterns: ['deadline', 'meeting', 'project', 'deliverable'],
        domainPatterns: []
      },
      personal: {
        keywords: ['family', 'friend', 'birthday', 'invitation', 'personal'],
        senderPatterns: [],
        subjectPatterns: ['birthday', 'invitation', 'personal'],
        bodyPatterns: ['family', 'friend', 'personal'],
        domainPatterns: ['gmail.com', 'yahoo.com', 'hotmail.com']
      },
      finance: {
        keywords: ['bank', 'credit', 'payment', 'invoice', 'statement', 'transaction'],
        senderPatterns: ['bank@', 'billing@', 'finance@', 'accounting@'],
        subjectPatterns: ['statement', 'payment', 'invoice', 'transaction'],
        bodyPatterns: ['account balance', 'payment due', 'financial'],
        domainPatterns: ['paypal.com', 'stripe.com', 'bank.']
      },
      travel: {
        keywords: ['flight', 'hotel', 'booking', 'reservation', 'itinerary', 'travel'],
        senderPatterns: ['booking@', 'travel@', 'reservations@'],
        subjectPatterns: ['booking confirmation', 'itinerary', 'flight'],
        bodyPatterns: ['reservation', 'check-in', 'travel'],
        domainPatterns: ['booking.com', 'expedia.com', 'airlines.']
      },
      shopping: {
        keywords: ['order', 'shipping', 'delivery', 'package', 'tracking'],
        senderPatterns: ['orders@', 'shipping@', 'delivery@'],
        subjectPatterns: ['order confirmation', 'shipped', 'delivery'],
        bodyPatterns: ['tracking number', 'shipped', 'delivery'],
        domainPatterns: ['amazon.com', 'ebay.com', 'shopify.']
      },
      support: {
        keywords: ['support', 'ticket', 'help', 'issue', 'problem', 'assistance'],
        senderPatterns: ['support@', 'help@', 'noreply@'],
        subjectPatterns: ['ticket', 'support', 'help'],
        bodyPatterns: ['support ticket', 'assistance', 'help'],
        domainPatterns: ['zendesk.com', 'freshdesk.com']
      },
      spam: {
        keywords: ['viagra', 'lottery', 'winner', 'congratulations', 'million'],
        senderPatterns: [],
        subjectPatterns: ['congratulations', 'winner', 'lottery'],
        bodyPatterns: ['click here', 'limited time', 'act now'],
        domainPatterns: []
      },
      important: {
        keywords: ['urgent', 'important', 'asap', 'emergency', 'critical'],
        senderPatterns: ['urgent@', 'emergency@'],
        subjectPatterns: ['urgent', 'important', 'asap', 'emergency'],
        bodyPatterns: ['urgent', 'important', 'critical'],
        domainPatterns: []
      },
      todo: {
        keywords: ['action required', 'please', 'need', 'request', 'follow up'],
        senderPatterns: [],
        subjectPatterns: ['action required', 'please review', 'follow up'],
        bodyPatterns: ['action required', 'please', 'need to', 'follow up'],
        domainPatterns: []
      },
      other: {
        keywords: [],
        senderPatterns: [],
        subjectPatterns: [],
        bodyPatterns: [],
        domainPatterns: []
      }
    };
  }

  async classifyEmail(
    subject: string, 
    body: string, 
    sender: string
  ): Promise<EmailClassificationResult> {
    try {
      const scores: Record<EmailCategory, number> = {} as Record<EmailCategory, number>;
      
      // Initialize scores
      Object.keys(this.categoryPatterns).forEach(category => {
        scores[category as EmailCategory] = 0;
      });

      // Score each category
      for (const [category, patterns] of Object.entries(this.categoryPatterns)) {
        const categoryKey = category as EmailCategory;
        scores[categoryKey] = this.calculateCategoryScore(
          patterns,
          subject.toLowerCase(),
          body.toLowerCase(),
          sender.toLowerCase()
        );
      }

      // Find highest scoring category
      const sortedCategories = Object.entries(scores)
        .sort(([,a], [,b]) => b - a);
      
      const [primaryCategory, primaryScore] = sortedCategories[0];
      const confidence = Math.min(primaryScore / 10, 1); // Normalize to 0-1

      // Generate subcategories (top 3 categories with score > 2)
      const subcategories = sortedCategories
        .filter(([cat, score]) => cat !== primaryCategory && score > 2)
        .slice(0, 3)
        .map(([cat]) => cat);

      // Determine if newsletter
      const isNewsletter = primaryCategory === 'newsletter' || 
        this.detectNewsletter(subject, body, sender).isNewsletter;

      // Determine priority for todo-like emails
      const priority = this.determinePriority(subject, body);

      const result: EmailClassificationResult = {
        category: primaryCategory as EmailCategory,
        subcategories,
        confidence,
        isNewsletter,
        priority,
        reasoning: `Primary indicators: ${this.getTopIndicators(this.categoryPatterns[primaryCategory as EmailCategory], subject, body, sender).join(', ')}`
      };

      logger.info('Email classified', {
        category: primaryCategory,
        confidence,
        isNewsletter
      });

      return result;

    } catch (error) {
      logger.error('Email classification failed', error);
      
      // Return default classification on error
      return {
        category: 'other',
        subcategories: [],
        confidence: 0,
        isNewsletter: false,
        priority: null,
        reasoning: 'Classification failed due to error'
      };
    }
  }

  private calculateCategoryScore(
    patterns: CategoryPatterns,
    subject: string,
    body: string,
    sender: string
  ): number {
    let score = 0;
    
    // Keyword scoring (body text)
    patterns.keywords.forEach(keyword => {
      if (body.includes(keyword)) score += 2;
      if (subject.includes(keyword)) score += 3; // Subject keywords weighted higher
    });

    // Sender pattern scoring
    patterns.senderPatterns.forEach(pattern => {
      if (sender.includes(pattern)) score += 4;
    });

    // Subject pattern scoring
    patterns.subjectPatterns.forEach(pattern => {
      if (subject.includes(pattern)) score += 3;
    });

    // Body pattern scoring
    patterns.bodyPatterns.forEach(pattern => {
      if (body.includes(pattern)) score += 2;
    });

    // Domain pattern scoring
    patterns.domainPatterns.forEach(pattern => {
      if (sender.includes(pattern)) score += 3;
    });

    return score;
  }

  private getTopIndicators(
    patterns: CategoryPatterns,
    subject: string,
    body: string,
    sender: string
  ): string[] {
    const indicators: string[] = [];
    
    patterns.keywords.forEach(keyword => {
      if (subject.includes(keyword) || body.includes(keyword)) {
        indicators.push(`keyword: ${keyword}`);
      }
    });

    patterns.senderPatterns.forEach(pattern => {
      if (sender.includes(pattern)) {
        indicators.push(`sender pattern: ${pattern}`);
      }
    });

    return indicators.slice(0, 3); // Return top 3 indicators
  }

  detectNewsletter(subject: string, body: string, sender: string): NewsletterDetectionResult {
    const unsubscribeLinks = this.extractUnsubscribeLinks(body);
    const hasUnsubscribe = unsubscribeLinks.length > 0;
    
    const newsletterScore = this.calculateCategoryScore(
      this.categoryPatterns.newsletter,
      subject.toLowerCase(),
      body.toLowerCase(),
      sender.toLowerCase()
    );

    const isNewsletter = newsletterScore > 5 || hasUnsubscribe;
    const confidence = Math.min((newsletterScore + (hasUnsubscribe ? 5 : 0)) / 10, 1);

    return {
      isNewsletter,
      confidence,
      unsubscribeLinks,
      senderReputation: 'unknown',
      frequency: 'unknown'
    };
  }

  private extractUnsubscribeLinks(body: string): string[] {
    const unsubscribePatterns = [
      /href=["'](.*?unsubscribe.*?)["']/gi,
      /href=["'](.*?opt-out.*?)["']/gi,
      /href=["'](.*?remove.*?)["']/gi
    ];

    const links: string[] = [];
    unsubscribePatterns.forEach(pattern => {
      const matches = body.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const link = match.match(/href=["'](.*?)["']/)?.[1];
          if (link) links.push(link);
        });
      }
    });

    return [...new Set(links)]; // Remove duplicates
  }

  private determinePriority(subject: string, body: string): 'low' | 'medium' | 'high' | 'urgent' | null {
    const text = (subject + ' ' + body).toLowerCase();
    
    if (text.includes('urgent') || text.includes('asap') || text.includes('emergency')) {
      return 'urgent';
    }
    
    if (text.includes('important') || text.includes('deadline') || text.includes('critical')) {
      return 'high';
    }
    
    if (text.includes('please') || text.includes('request') || text.includes('need')) {
      return 'medium';
    }
    
    return null;
  }

  async batchClassifyEmails(
    emails: { subject: string; body: string; sender: string; id: string }[]
  ): Promise<Map<string, EmailClassificationResult>> {
    const results = new Map<string, EmailClassificationResult>();
    
    // Process in batches to avoid overwhelming the system
    const batchSize = this.config.batchSize;
    
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const batchPromises = batch.map(async email => {
        const result = await this.classifyEmail(email.subject, email.body, email.sender);
        return { id: email.id, result };
      });
      
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(({ id, result }) => {
        results.set(id, result);
      });
    }
    
    return results;
  }
}