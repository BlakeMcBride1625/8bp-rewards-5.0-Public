import { Request, Response, NextFunction } from 'express';
import { TIMEOUTS } from '../constants';

/**
 * Request timeout middleware
 * Automatically terminates requests that exceed the specified timeout
 */
export function timeoutMiddleware(timeoutMs: number = TIMEOUTS.REQUEST_TIMEOUT) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Set a timeout for the request
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          error: 'Request timeout',
          message: `Request exceeded ${timeoutMs}ms timeout`
        });
      }
    }, timeoutMs);

    // Clear timeout when response is finished
    const originalEnd = res.end.bind(res);
    res.end = function(...args: any[]) {
      clearTimeout(timeout);
      return originalEnd(...args);
    };

    next();
  };
}

/**
 * Route-specific timeout middleware
 * Use for routes that may take longer (e.g., database operations, external API calls)
 */
export function routeTimeout(timeoutMs: number) {
  return timeoutMiddleware(timeoutMs);
}

