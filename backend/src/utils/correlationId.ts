/**
 * Correlation ID utility functions
 * Generates consistent correlation IDs for tracing requests across services
 */

export interface CorrelationIdOptions {
  prefix?: string;
  suffix?: string;
  includeTimestamp?: boolean;
}

/**
 * Generate a correlation ID for registration validation
 */
export function generateValidationCorrelationId(eightBallPoolId: string): string {
  return `reg-val-${Date.now()}-${eightBallPoolId}`;
}

/**
 * Generate a generic correlation ID
 */
export function generateCorrelationId(
  identifier: string, 
  options: CorrelationIdOptions = {}
): string {
  const {
    prefix = 'req',
    suffix = '',
    includeTimestamp = true
  } = options;

  const parts = [prefix];
  
  if (includeTimestamp) {
    parts.push(Date.now().toString());
  }
  
  parts.push(identifier);
  
  if (suffix) {
    parts.push(suffix);
  }

  return parts.join('-');
}



