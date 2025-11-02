/**
 * TypeScript declarations for ValidationService
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

export interface ValidationContext {
  operation?: string;
  username?: string;
  timestamp?: string;
  adminTriggered?: boolean;
  [key: string]: any;
}

export interface ModuleStats {
  validation_attempt: number;
  validation_success: number;
  validation_failure: number;
  validation_error: number;
}

export interface HealthStatus {
  cacheSize: number;
  errorCounts: number;
  moduleStats: Record<string, ModuleStats>;
  timestamp: string;
}

declare class ValidationService {
  constructor();
  
  validateUser(uniqueId: string, sourceModule?: string, context?: ValidationContext): Promise<ValidationResult>;
  
  isValidIdFormat(uniqueId: string): boolean;
  
  checkDatabaseStatus(uniqueId: string): Promise<{ isInvalid: boolean; reason: string }>;
  
  performApiValidation(uniqueId: string, sourceModule: string, correlationId: string): Promise<ValidationResult>;
  
  handleInvalidUser(uniqueId: string, sourceModule: string, validationResult: ValidationResult, context?: ValidationContext): Promise<void>;
  
  deregisterUser(uniqueId: string, sourceModule: string, validationResult: ValidationResult): Promise<void>;
  
  logInvalidUser(uniqueId: string, sourceModule: string, validationResult: ValidationResult, context: ValidationContext): Promise<void>;
  
  cacheValidation(uniqueId: string, result: ValidationResult): void;
  
  getCachedValidation(uniqueId: string): ValidationResult | null;
  
  incrementErrorCount(uniqueId: string): void;
  
  getErrorCount(uniqueId: string): number;
  
  updateModuleStats(module: string, event: string): void;
  
  getModuleStats(): Record<string, ModuleStats>;
  
  generateCorrelationId(): string;
  
  logValidation(sourceModule: string, uniqueId: string, status: string, correlationId: string, duration: number, error?: Error): void;
  
  clearCache(): void;
  
  clearErrorCounts(): void;
  
  getHealthStatus(): HealthStatus;
}

export default ValidationService;




