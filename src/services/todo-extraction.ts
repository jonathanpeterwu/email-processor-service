import { 
  TodoItem, 
  TodoExtractionResult, 
  TodoPriority, 
  TodoStatus,
  AIProcessingConfig 
} from '../types/categorization';
import pino from 'pino';

const logger = pino().child({ module: 'TodoExtraction' });

interface ActionPattern {
  keywords: string[];
  priority: TodoPriority;
  confidence: number;
}

export class TodoExtractionService {
  private readonly actionPatterns: ActionPattern[];
  private readonly timePatterns: RegExp[];
  private readonly config: AIProcessingConfig;

  constructor(config: AIProcessingConfig) {
    this.config = config;
    this.actionPatterns = this.initializeActionPatterns();
    this.timePatterns = this.initializeTimePatterns();
  }

  private initializeActionPatterns(): ActionPattern[] {
    return [
      {
        keywords: ['urgent', 'asap', 'immediately', 'emergency'],
        priority: 'urgent',
        confidence: 0.9
      },
      {
        keywords: ['deadline', 'due', 'expires', 'critical', 'important'],
        priority: 'high',
        confidence: 0.8
      },
      {
        keywords: ['please review', 'need to', 'action required', 'follow up'],
        priority: 'medium',
        confidence: 0.7
      },
      {
        keywords: ['when you get a chance', 'whenever', 'if possible'],
        priority: 'low',
        confidence: 0.6
      }
    ];
  }

  private initializeTimePatterns(): RegExp[] {
    return [
      /by\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/gi,
      /by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
      /due\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/gi,
      /deadline\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/gi,
      /before\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/gi,
      /by\s+(today|tomorrow|this\s+week|next\s+week)/gi
    ];
  }

  async extractTodos(
    subject: string,
    body: string,
    _sender: string
  ): Promise<TodoExtractionResult> {
    try {
      const text = `${subject} ${body}`;
      // Find action items using pattern matching
      const actionItems = this.findActionItems(text);
      
      // Extract explicit todos
      const explicitTodos = this.extractExplicitTodos(text);
      
      // Combine and deduplicate
      const allTodos = [...actionItems, ...explicitTodos];
      const uniqueTodos = this.deduplicateTodos(allTodos);
      
      // Filter by confidence threshold
      const filteredTodos = uniqueTodos.filter(
        todo => todo.confidence >= this.config.confidenceThreshold
      );

      const hasTodos = filteredTodos.length > 0;
      const averageConfidence = hasTodos 
        ? filteredTodos.reduce((sum, todo) => sum + todo.confidence, 0) / filteredTodos.length
        : 0;

      const result: TodoExtractionResult = {
        todos: filteredTodos,
        hasTodos,
        confidence: averageConfidence,
        reasoning: this.generateReasoning(filteredTodos, text)
      };

      logger.info('Todo extraction completed', {
        todosFound: filteredTodos.length,
        averageConfidence,
        hasTodos
      });

      return result;

    } catch (error) {
      logger.error('Todo extraction failed', error);
      
      return {
        todos: [],
        hasTodos: false,
        confidence: 0,
        reasoning: 'Extraction failed due to error'
      };
    }
  }

  private findActionItems(text: string): Omit<TodoItem, 'id' | 'emailId' | 'extractedAt'>[] {
    const todos: Omit<TodoItem, 'id' | 'emailId' | 'extractedAt'>[] = [];
    const sentences = this.splitIntoSentences(text);

    sentences.forEach((sentence, index) => {
      const actionMatch = this.findActionInSentence(sentence);
      if (actionMatch) {
        const todo = this.createTodoFromSentence(sentence, actionMatch, index);
        if (todo) {
          todos.push(todo);
        }
      }
    });

    return todos;
  }

  private extractExplicitTodos(text: string): Omit<TodoItem, 'id' | 'emailId' | 'extractedAt'>[] {
    const todos: Omit<TodoItem, 'id' | 'emailId' | 'extractedAt'>[] = [];
    
    // Look for numbered lists (1. 2. 3.)
    const numberedItems = text.match(/\d+\.\s+([^\n\r]+)/g);
    if (numberedItems) {
      numberedItems.forEach((item, index) => {
        const content = item.replace(/^\d+\.\s+/, '');
        if (this.looksLikeTodo(content)) {
          todos.push(this.createTodoFromText(content, index, 'medium'));
        }
      });
    }

    // Look for bullet points (- • *)
    const bulletItems = text.match(/[-•*]\s+([^\n\r]+)/g);
    if (bulletItems) {
      bulletItems.forEach((item, index) => {
        const content = item.replace(/^[-•*]\s+/, '');
        if (this.looksLikeTodo(content)) {
          todos.push(this.createTodoFromText(content, index, 'medium'));
        }
      });
    }

    // Look for checkbox items
    const checkboxItems = text.match(/\[[\sx]\]\s+([^\n\r]+)/gi);
    if (checkboxItems) {
      checkboxItems.forEach((item, index) => {
        const content = item.replace(/\[[\sx]\]\s+/i, '');
        const isCompleted = /\[x\]/i.test(item);
        const status: TodoStatus = isCompleted ? 'completed' : 'pending';
        
        const todo = this.createTodoFromText(content, index, 'medium');
        todo.status = status;
        todos.push(todo);
      });
    }

    return todos;
  }

  private splitIntoSentences(text: string): string[] {
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10); // Filter out very short fragments
  }

  private findActionInSentence(sentence: string): ActionPattern | null {
    const lowerSentence = sentence.toLowerCase();
    
    for (const pattern of this.actionPatterns) {
      const hasKeywords = pattern.keywords.some(keyword => 
        lowerSentence.includes(keyword)
      );
      
      if (hasKeywords) {
        return pattern;
      }
    }

    // Check for imperative verbs
    const imperativePatterns = [
      /^(please\s+)?(review|send|complete|finish|update|check|verify|confirm|schedule|call|email)/i,
      /(need to|have to|must|should|could you|would you|can you)/i
    ];

    for (const pattern of imperativePatterns) {
      if (pattern.test(sentence)) {
        return {
          keywords: ['action_verb'],
          priority: 'medium',
          confidence: 0.6
        };
      }
    }

    return null;
  }

  private createTodoFromSentence(
    sentence: string, 
    actionMatch: ActionPattern, 
    _index: number
  ): Omit<TodoItem, 'id' | 'emailId' | 'extractedAt'> | null {
    
    const cleanSentence = sentence.trim();
    if (cleanSentence.length < 10 || cleanSentence.length > 200) {
      return null; // Too short or too long to be a meaningful todo
    }

    const dueDate = this.extractDueDate(sentence);
    const actionKeywords = actionMatch.keywords.filter(keyword => 
      sentence.toLowerCase().includes(keyword)
    );

    return {
      title: this.generateTodoTitle(cleanSentence),
      description: cleanSentence,
      priority: actionMatch.priority,
      status: 'pending' as TodoStatus,
      dueDate,
      confidence: actionMatch.confidence,
      context: sentence,
      actionKeywords
    };
  }

  private createTodoFromText(
    content: string, 
    _index: number, 
    priority: TodoPriority
  ): Omit<TodoItem, 'id' | 'emailId' | 'extractedAt'> {
    
    const dueDate = this.extractDueDate(content);
    
    return {
      title: this.generateTodoTitle(content),
      description: content,
      priority,
      status: 'pending' as TodoStatus,
      dueDate,
      confidence: 0.7,
      context: content,
      actionKeywords: []
    };
  }

  private looksLikeTodo(content: string): boolean {
    const todoIndicators = [
      /\b(need|must|should|review|complete|send|update|check|verify|call|email|schedule)\b/i,
      /\b(action|task|todo|follow up|deadline|due)\b/i,
      /\b(please|kindly|would you|can you|could you)\b/i
    ];

    return todoIndicators.some(pattern => pattern.test(content));
  }

  private extractDueDate(text: string): Date | undefined {
    for (const pattern of this.timePatterns) {
      const match = pattern.exec(text);
      if (match) {
        try {
          return this.parseDateString(match[1] || match[0]);
        } catch (error) {
          logger.warn('Failed to parse date', { dateString: match[0] });
        }
      }
    }
    return undefined;
  }

  private parseDateString(dateString: string): Date | undefined {
    const lowerDateString = dateString.toLowerCase().trim();
    
    // Handle relative dates
    const today = new Date();
    
    if (lowerDateString.includes('today')) {
      return today;
    }
    
    if (lowerDateString.includes('tomorrow')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      return tomorrow;
    }
    
    if (lowerDateString.includes('this week')) {
      const endOfWeek = new Date(today);
      endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
      return endOfWeek;
    }
    
    if (lowerDateString.includes('next week')) {
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);
      return nextWeek;
    }
    
    // Handle day names
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < dayNames.length; i++) {
      if (lowerDateString.includes(dayNames[i])) {
        const targetDay = new Date(today);
        const currentDay = today.getDay();
        let daysUntilTarget = i - currentDay;
        if (daysUntilTarget <= 0) daysUntilTarget += 7; // Next occurrence
        targetDay.setDate(today.getDate() + daysUntilTarget);
        return targetDay;
      }
    }
    
    // Try to parse as regular date
    try {
      const parsed = new Date(dateString);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    } catch (error) {
      // Ignore parsing errors
    }
    
    return undefined;
  }

  private generateTodoTitle(content: string): string {
    // Extract the main action/object from the content
    let title = content;
    
    // Remove common prefixes
    title = title.replace(/^(please\s+|kindly\s+|could you\s+|can you\s+|would you\s+)/i, '');
    
    // Limit length
    if (title.length > 60) {
      title = title.substring(0, 57) + '...';
    }
    
    // Capitalize first letter
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  private deduplicateTodos(
    todos: Omit<TodoItem, 'id' | 'emailId' | 'extractedAt'>[]
  ): Omit<TodoItem, 'id' | 'emailId' | 'extractedAt'>[] {
    const uniqueTodos: Omit<TodoItem, 'id' | 'emailId' | 'extractedAt'>[] = [];
    const seen = new Set<string>();

    for (const todo of todos) {
      // Create a signature based on title and description
      const signature = `${todo.title.toLowerCase()}_${todo.description.toLowerCase()}`;
      const normalizedSignature = signature.replace(/\s+/g, '').substring(0, 50);
      
      if (!seen.has(normalizedSignature)) {
        seen.add(normalizedSignature);
        uniqueTodos.push(todo);
      }
    }

    return uniqueTodos;
  }

  private generateReasoning(
    todos: Omit<TodoItem, 'id' | 'emailId' | 'extractedAt'>[],
    _text: string
  ): string {
    if (todos.length === 0) {
      return 'No actionable items detected in email content';
    }

    const reasons: string[] = [];
    
    todos.forEach((todo, index) => {
      const keywords = todo.actionKeywords.length > 0 
        ? todo.actionKeywords.join(', ') 
        : 'action verbs';
      reasons.push(`Todo ${index + 1}: Detected "${keywords}" indicating ${todo.priority} priority action`);
    });

    return reasons.join('; ');
  }

  async batchExtractTodos(
    emails: { subject: string; body: string; sender: string; id: string }[]
  ): Promise<Map<string, TodoExtractionResult>> {
    const results = new Map<string, TodoExtractionResult>();
    
    // Process in batches
    const batchSize = this.config.batchSize;
    
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const batchPromises = batch.map(async email => {
        const result = await this.extractTodos(email.subject, email.body, email.sender);
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