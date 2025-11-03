/**
 * Application-wide constants
 * Centralized location for magic numbers, strings, and configuration values
 */

// Timeout values (in milliseconds)
export const TIMEOUTS = {
  VALIDATION_PROCESS: 300000,      // 5 minutes - registration validation timeout
  VALIDATION_CLAIM: 300000,        // 5 minutes - first-time claim timeout
  PAGE_NAVIGATION: 30000,          // 30 seconds - page navigation timeout
  QUERY_TIMEOUT: 30000,            // 30 seconds - database query timeout
  REQUEST_TIMEOUT: 30000,          // 30 seconds - HTTP request timeout
  TERMINAL_COMMAND: 30000,          // 30 seconds - terminal command timeout
  WEBHOOK: 5000,                   // 5 seconds - webhook timeout
  API_CALL: 30000                   // 30 seconds - external API timeout
} as const;

// Correlation ID prefixes
export const CORRELATION_ID_PREFIXES = {
  REGISTRATION_VALIDATION: 'reg-val',
  CLAIM_PROCESS: 'claim',
  ADMIN_ACTION: 'admin',
  API_REQUEST: 'api',
  SCHEDULER: 'scheduler',
  DEFAULT: 'req'
} as const;

// User status values
export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  INVALID: 'invalid',
  DEREGISTERED: 'deregistered'
} as const;

// Validation reasons
export const VALIDATION_REASONS = {
  INVALID_USER: 'invalid_user',
  VALID_USER: 'valid_user',
  AMBIGUOUS_RESULT: 'ambiguous_result',
  ERROR_FALLBACK: 'error_fallback',
  API_FAILED: 'api_failed',
  API_VALID: 'api_valid',
  FLAGGED_INVALID: 'flagged_invalid'
} as const;

// Claim status values
export const CLAIM_STATUS = {
  SUCCESS: 'success',
  FAILED: 'failed',
  PENDING: 'pending'
} as const;

// Invalid user indicators (for validation)
export const INVALID_USER_INDICATORS = [
  'Invalid Unique ID',
  'Invalid ID',
  'user not found',
  'user not valid',
  'banned',
  'not found',
  'error'
] as const;

// Valid user indicators (for validation)
export const VALID_USER_INDICATORS = {
  URL_KEYWORDS: ['profile', 'dashboard', 'account'],
  PAGE_CONTENT: ['welcome', 'logged in', 'profile']
} as const;

// Source modules (for logging and tracking)
export const SOURCE_MODULES = {
  REGISTRATION_VALIDATION: 'registration-validation',
  FIRST_TIME_CLAIM: 'first-time-claim',
  SCHEDULER: 'scheduler',
  ADMIN: 'admin',
  API: 'api',
  CLAIMER: 'claimer'
} as const;

// Error messages
export const ERROR_MESSAGES = {
  USER_NOT_FOUND: 'User not found',
  VALIDATION_FAILED: 'User validation failed',
  DATABASE_ERROR: 'Database operation failed',
  NETWORK_ERROR: 'Network request failed',
  TIMEOUT: 'Operation timed out',
  PERMISSION_DENIED: 'Permission denied'
} as const;

// Screenshot paths
export const SCREENSHOT_PATHS = {
  SHOP_PAGE: 'screenshots/shop-page',
  ID_ENTRY: 'screenshots/id-entry',
  GO_CLICK: 'screenshots/go-click'
} as const;



