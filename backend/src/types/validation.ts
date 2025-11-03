/**
 * Validation type definitions
 */

import { RequestContext } from './common';

/**
 * Validation result structure
 */
export interface ValidationResult {
  isValid: boolean;
  reason: string;
  error?: string;
  correlationId: string;
  sourceModule: string;
  timestamp: string;
  endpoint?: string;
  responseData?: any;
  attempts?: number;
  stackTrace?: string;
}

/**
 * Validation context for tracking operation details
 */
export interface ValidationContext extends RequestContext {
  operation?: string;
  adminTriggered?: boolean;
  testType?: string;
  [key: string]: any;
}

/**
 * Validation filters for querying logs
 */
export interface ValidationFilters {
  uniqueId?: string;
  sourceModule?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

/**
 * Module statistics structure
 */
export interface ModuleStats {
  validation_attempt: number;
  validation_success: number;
  validation_failure: number;
  validation_error: number;
}

/**
 * Module status structure
 */
export interface ModuleStatus {
  name: string;
  status: 'integrated' | 'not_integrated';
  stats: ModuleStats;
}

/**
 * Health status structure
 */
export interface HealthStatus {
  cacheSize: number;
  errorCounts: number;
  moduleStats: Record<string, ModuleStats>;
  timestamp: string;
}

