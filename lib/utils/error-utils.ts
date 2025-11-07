/**
 * ERROR HANDLING UTILITIES
 * Type-safe error handling for TypeScript strict mode
 * Date: November 6, 2025
 */

/**
 * Type guard to check if error is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard to check if error has a message property
 */
export function hasMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

/**
 * Type guard for Supabase errors
 */
export function isSupabaseError(error: unknown): error is {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

/**
 * Type guard for API errors
 */
export function isApiError(error: unknown): error is {
  error: string;
  message?: string;
  status?: number;
} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof (error as { error: unknown }).error === 'string'
  );
}

/**
 * Safely extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  
  if (hasMessage(error)) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return 'An unknown error occurred';
}

/**
 * Safely extract error details for logging
 */
export function getErrorDetails(error: unknown): {
  message: string;
  stack?: string;
  details?: unknown;
} {
  const message = getErrorMessage(error);
  
  if (isError(error)) {
    return {
      message,
      stack: error.stack,
      details: error,
    };
  }
  
  return {
    message,
    details: error,
  };
}

/**
 * Format error for API response
 */
export function formatApiError(error: unknown): {
  error: string;
  message: string;
  details?: string;
} {
  const message = getErrorMessage(error);
  
  if (isSupabaseError(error)) {
    return {
      error: 'Database error',
      message,
      details: error.details || error.hint,
    };
  }
  
  if (isApiError(error)) {
    return {
      error: error.error,
      message: error.message || message,
    };
  }
  
  return {
    error: 'Internal server error',
    message,
  };
}

/**
 * Log error safely with context
 */
export function logError(context: string, error: unknown): void {
  const details = getErrorDetails(error);
  console.error(`[${context}]`, details.message);
  
  if (details.stack) {
    console.error('Stack trace:', details.stack);
  }
  
  if (details.details && typeof details.details === 'object') {
    console.error('Error details:', JSON.stringify(details.details, null, 2));
  }
}

/**
 * Custom error classes for specific scenarios
 */
export class DatabaseError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}
