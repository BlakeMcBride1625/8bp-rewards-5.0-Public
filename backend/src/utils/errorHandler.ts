import { Request, Response } from 'express';
import { logger } from '../services/LoggerService';
import { generateCorrelationId } from './correlationId';

export interface ApiError extends Error {
  statusCode?: number;
  correlationId?: string;
  context?: Record<string, any>;
}

/**
 * Create a standardized API error
 */
export function createApiError(
  message: string,
  statusCode: number = 500,
  context?: Record<string, any>
): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.correlationId = generateCorrelationId('error');
  error.context = context;
  return error;
}

/**
 * Standardized error response handler
 */
export function sendErrorResponse(
  res: Response,
  error: Error | ApiError,
  defaultStatusCode: number = 500,
  correlationId?: string
): void {
  const apiError = error as ApiError;
  const statusCode = apiError.statusCode || defaultStatusCode;
  const errorCorrelationId = apiError.correlationId || correlationId || generateCorrelationId('error');
  
  // Log error with context
  logger.error('API error response', {
    action: 'api_error',
    statusCode,
    correlationId: errorCorrelationId,
    error: error.message,
    stack: error.stack,
    context: apiError.context
  });
  
  // Send standardized error response
  res.status(statusCode).json({
    error: error.message || 'Internal server error',
    correlationId: errorCorrelationId,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { 
      stack: error.stack,
      context: apiError.context 
    })
  });
}

/**
 * Async route error handler wrapper
 * Catches errors and sends standardized responses
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: (error?: Error) => void) => Promise<void>
) {
  return async (req: Request, res: Response, next: (error?: Error) => void): Promise<void> => {
    try {
      await fn(req, res, next);
    } catch (error) {
      sendErrorResponse(res, error instanceof Error ? error : new Error('Unknown error'));
    }
  };
}



