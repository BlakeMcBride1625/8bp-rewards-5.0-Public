/**
 * Common type definitions for the backend
 * Consolidates duplicate interfaces and improves type safety
 */

/**
 * User data structure (Discord OAuth)
 */
export interface DiscordUser {
  id: string;
  username: string;
  discriminator?: string;
  avatar?: string;
  email?: string;
}

/**
 * Registration data structure
 */
export interface RegistrationData {
  id?: string;
  eightBallPoolId: string;
  username: string;
  email?: string;
  discordId?: string;
  registrationIp?: string;
  deviceId?: string;
  deviceType?: string;
  userAgent?: string;
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  isActive?: boolean;
  status?: 'active' | 'inactive' | 'deregistered';
  metadata?: Record<string, any>;
}

/**
 * Claim record data structure
 */
export interface ClaimRecord {
  id?: string;
  eightBallPoolId: string;
  websiteUserId?: string;
  status: 'success' | 'failed' | 'partial';
  itemsClaimed?: string[];
  errorMessage?: string;
  claimedAt: Date;
  createdAt?: Date;
}

/**
 * Invalid user data structure
 */
export interface InvalidUser {
  id?: number;
  eightBallPoolId: string;
  deregistrationReason: string;
  sourceModule: string;
  errorMessage?: string;
  correlationId?: string;
  deregisteredAt: Date;
  context?: Record<string, any>;
  createdAt?: Date;
}

/**
 * Validation log data structure
 */
export interface ValidationLog {
  id?: number;
  uniqueId: string;
  sourceModule: string;
  validationResult: Record<string, any>;
  context?: Record<string, any>;
  timestamp: Date;
  correlationId?: string;
  createdAt?: Date;
}

/**
 * Standard API response structure
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  users?: T[];
  error?: string;
  details?: string;
  message?: string;
  count?: number;
  processed?: number;
  total?: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

/**
 * Filter parameters for queries
 */
export interface QueryFilters {
  startDate?: string | Date;
  endDate?: string | Date;
  status?: string;
  sourceModule?: string;
  uniqueId?: string;
  [key: string]: any;
}

/**
 * Request context for logging and tracing
 */
export interface RequestContext {
  userId?: string;
  username?: string;
  ip?: string;
  userAgent?: string;
  correlationId?: string;
  operation?: string;
  timestamp?: string;
  [key: string]: any;
}





