/**
 * Universal Error Handler Utility
 * Handles unknown errors safely with TypeScript strict mode
 */

export interface ErrorResponse {
  message: string;
  code?: string;
  details?: unknown;
}

export function handleError(error: unknown): ErrorResponse {
  // Handle Error instances
  if (error instanceof Error) {
    return {
      message: error.message,
      code: (error as any).code,
      details: error
    };
  }

  // Handle string errors
  if (typeof error === 'string') {
    return {
      message: error
    };
  }

  // Handle objects with message property
  if (error && typeof error === 'object' && 'message' in error) {
    return {
      message: String((error as any).message),
      details: error
    };
  }

  // Unknown error type
  return {
    message: 'An unknown error occurred',
    details: error
  };
}

export function getErrorMessage(error: unknown): string {
  return handleError(error).message;
}

export function logError(error: unknown, context?: string): void {
  const errorResponse = handleError(error);
  console.error(`[ERROR]${context ? ` ${context}:` : ''}`, errorResponse);
}
