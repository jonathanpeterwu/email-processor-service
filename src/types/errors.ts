// Standardized error types and handling
export interface APIError {
  error: string;
  message: string;
  code: string;
  statusCode: number;
  details?: any;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(message: string, code: string, statusCode: number = 500, details?: any) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    
    Error.captureStackTrace(this, this.constructor);
  }

  toAPIError(): APIError {
    return {
      error: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details
    };
  }
}

// Specific error classes
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND_ERROR', 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT_ERROR', 409);
    this.name = 'ConflictError';
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(`External service error (${service}): ${message}`, 'EXTERNAL_SERVICE_ERROR', 502);
    this.name = 'ExternalServiceError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string) {
    super(`Database error: ${message}`, 'DATABASE_ERROR', 500);
    this.name = 'DatabaseError';
  }
}

// Error handler utility
export function handleError(error: unknown): APIError {
  if (error instanceof AppError) {
    return error.toAPIError();
  }

  if (error instanceof Error) {
    return {
      error: 'InternalServerError',
      message: error.message,
      code: 'INTERNAL_SERVER_ERROR',
      statusCode: 500
    };
  }

  return {
    error: 'UnknownError',
    message: 'An unknown error occurred',
    code: 'UNKNOWN_ERROR',
    statusCode: 500
  };
}