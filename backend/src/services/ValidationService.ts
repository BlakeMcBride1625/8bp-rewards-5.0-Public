import axios, { AxiosResponse } from 'axios';
import { DatabaseService } from './DatabaseService';
import { logger } from './LoggerService';
import { isValidIdFormat } from '../utils/validation';
import { ValidationResult, ValidationContext, ModuleStats, HealthStatus } from '../types/validation';
import { InvalidUser, ValidationLog } from '../types/common';

// Type aliases for backward compatibility
type InvalidUserData = InvalidUser;
type ValidationLogData = ValidationLog;

interface CachedValidation {
  result: ValidationResult;
  timestamp: number;
}

class ValidationService {
  private dbService: DatabaseService;
  private validationCache: Map<string, CachedValidation>;
  private cacheExpiry: number;
  private maxRetries: number;
  private retryDelay: number;
  private validationEndpoints: string[];
  private errorCounts: Map<string, number>;
  private moduleStats: Map<string, ModuleStats>;

  constructor() {
    this.dbService = DatabaseService.getInstance();
    this.validationCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes cache
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
    
    // Validation endpoints
    this.validationEndpoints = [
      'https://8ballpool.com/api/user/validate',
      'https://8ballpool.com/api/profile/check',
      'https://8ballpool.com/api/account/status'
    ];
    
    // Error tracking
    this.errorCounts = new Map();
    this.moduleStats = new Map();
  }

  /**
   * Main validation method - called by all modules
   */
  async validateUser(uniqueId: string, sourceModule: string = 'unknown', context: ValidationContext = {}): Promise<ValidationResult> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();
    
    try {
      // Update module stats
      this.updateModuleStats(sourceModule, 'validation_attempt');
      
      // Check cache first
      const cachedResult = this.getCachedValidation(uniqueId);
      if (cachedResult) {
        this.logValidation(sourceModule, uniqueId, 'cache_hit', correlationId, Date.now() - startTime);
        return cachedResult;
      }

      // Validate the user ID format first
      if (!isValidIdFormat(uniqueId)) {
        const result: ValidationResult = {
          isValid: false,
          reason: 'invalid_format',
          error: 'Invalid ID format',
          correlationId,
          sourceModule,
          timestamp: new Date().toISOString()
        };
        
        this.logValidation(sourceModule, uniqueId, 'format_invalid', correlationId, Date.now() - startTime);
        await this.handleInvalidUser(uniqueId, sourceModule, result, context);
        return result;
      }

      // Check if user is already flagged as invalid in database
      const dbStatus = await this.checkDatabaseStatus(uniqueId);
      if (dbStatus.isInvalid) {
        const result: ValidationResult = {
          isValid: false,
          reason: 'database_invalid',
          error: 'User flagged as invalid in database',
          correlationId,
          sourceModule,
          timestamp: new Date().toISOString()
        };
        
        this.logValidation(sourceModule, uniqueId, 'db_invalid', correlationId, Date.now() - startTime);
        return result;
      }

      // Note: Comprehensive validation is now handled by registration-validation.ts script
      // This service provides basic format validation and caching for performance
      // For full validation including login attempts, use the registration-validation.ts script
      const validationResult: ValidationResult = {
        isValid: true,
        reason: 'format_valid',
        correlationId,
        sourceModule,
        timestamp: new Date().toISOString()
      };
      
      // Cache successful validation
      this.cacheValidation(uniqueId, validationResult);
      this.updateModuleStats(sourceModule, 'validation_success');
      this.logValidation(sourceModule, uniqueId, 'success', correlationId, Date.now() - startTime);

      return validationResult;

    } catch (error: any) {
      const result: ValidationResult = {
        isValid: false,
        reason: 'validation_error',
        error: error.message,
        correlationId,
        sourceModule,
        timestamp: new Date().toISOString(),
        stackTrace: error.stack
      };
      
      this.updateModuleStats(sourceModule, 'validation_error');
      this.logValidation(sourceModule, uniqueId, 'error', correlationId, Date.now() - startTime, error);
      
      // If this is a repeated error, consider the user invalid
      const errorCount = this.getErrorCount(uniqueId);
      if (errorCount >= this.maxRetries) {
        await this.handleInvalidUser(uniqueId, sourceModule, result, context);
      }
      
      return result;
    }
  }

  // ID format validation moved to utils/validation.ts

  /**
   * Check database status for user
   */
  private async checkDatabaseStatus(uniqueId: string): Promise<{ isInvalid: boolean; reason: string }> {
    try {
      await this.dbService.connect();
      
      // ONLY check if user is flagged as invalid - don't check if they exist in registrations
      // This allows first-time claims for new users
      const invalidUsers = await this.dbService.findInvalidUsers();
      const isInvalid = invalidUsers.some(u => u.eight_ball_pool_id === uniqueId);
      
      return { isInvalid, reason: isInvalid ? 'flagged_invalid' : 'active' };
      
    } catch (error) {
      logger.error('Database status check failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return { isInvalid: false, reason: 'db_error' };
    }
  }

  /**
   * Perform API validation with retry logic
   */
  private async performApiValidation(uniqueId: string, sourceModule: string, correlationId: string): Promise<ValidationResult> {
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Try different validation endpoints
        for (const endpoint of this.validationEndpoints) {
          try {
            const response: AxiosResponse = await axios.get(`${endpoint}/${uniqueId}`, {
              timeout: 5000,
              headers: {
                'User-Agent': '8BP-Rewards-Validator/1.0',
                'X-Correlation-ID': correlationId,
                'X-Source-Module': sourceModule
              }
            });
            
            if (response.status === 200 && response.data) {
              return {
                isValid: true,
                reason: 'api_valid',
                endpoint,
                responseData: response.data,
                correlationId,
                sourceModule,
                timestamp: new Date().toISOString(),
                attempts: attempt
              };
            }
          } catch (endpointError) {
            lastError = endpointError;
            continue; // Try next endpoint
          }
        }
        
        // If all endpoints failed, wait before retry
        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
        
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }
    
    // All attempts failed
    return {
      isValid: false,
      reason: 'api_failed',
      error: lastError?.message || 'All validation endpoints failed',
      correlationId,
      sourceModule,
      timestamp: new Date().toISOString(),
      attempts: this.maxRetries
    };
  }

  /**
   * Handle invalid user - deregister and log
   */
  private async handleInvalidUser(uniqueId: string, sourceModule: string, validationResult: ValidationResult, context: ValidationContext = {}): Promise<void> {
    try {
      // Increment error count
      this.incrementErrorCount(uniqueId);
      
      // Log the invalid user
      await this.logInvalidUser(uniqueId, sourceModule, validationResult, context);
      
      // Deregister the user
      await this.deregisterUserInternal(uniqueId, sourceModule, validationResult);
      
      // Clear from cache
      this.validationCache.delete(uniqueId);
      
      logger.warn(`User ${uniqueId} flagged as invalid by ${sourceModule}`, {
        uniqueId,
        sourceModule,
        reason: validationResult.reason,
        correlationId: validationResult.correlationId
      });
      
    } catch (error) {
      logger.error(`Failed to handle invalid user ${uniqueId}`, {
        uniqueId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Public method to deregister user (called by claimers)
   */
  public async deregisterUser(uniqueId: string, reason: string, sourceModule: string, errorMessage?: string, correlationId?: string, context?: any): Promise<void> {
    try {
      await this.dbService.connect();
      
      // Move user to invalid users table
      const invalidUserData: InvalidUserData = {
        eightBallPoolId: uniqueId,
        deregistrationReason: reason,
        sourceModule: sourceModule,
        errorMessage: errorMessage || 'No error message provided',
        correlationId: correlationId || 'no_correlation_id',
        deregisteredAt: new Date(),
        context: context || {}
      };
      
      await this.dbService.createInvalidUserRecord(invalidUserData);
      
      // Remove from active registrations
      await this.dbService.removeUserByEightBallPoolId(uniqueId);
      
      logger.info(`User ${uniqueId} deregistered by ${sourceModule}`, {
        uniqueId,
        sourceModule,
        reason,
        correlationId
      });
      
    } catch (error) {
      logger.error(`Failed to deregister user ${uniqueId}`, {
        uniqueId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Private method to deregister user (used internally)
   */
  private async deregisterUserInternal(uniqueId: string, sourceModule: string, validationResult: ValidationResult): Promise<void> {
    try {
      await this.dbService.connect();
      
      // Move user to invalid users table
      const invalidUserData: InvalidUserData = {
        eightBallPoolId: uniqueId,
        deregistrationReason: validationResult.reason,
        sourceModule: sourceModule,
        errorMessage: validationResult.error,
        correlationId: validationResult.correlationId,
        deregisteredAt: new Date(),
        context: validationResult
      };
      
      await this.dbService.createInvalidUserRecord(invalidUserData);
      
      // Remove from active users
      await this.dbService.removeUserByEightBallPoolId(uniqueId);
      
      logger.info(`User ${uniqueId} deregistered by ${sourceModule}`, {
        uniqueId,
        sourceModule
      });
      
    } catch (error) {
      logger.error(`Failed to deregister user ${uniqueId}`, {
        uniqueId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Log invalid user for admin dashboard
   */
  private async logInvalidUser(uniqueId: string, sourceModule: string, validationResult: ValidationResult, context: ValidationContext): Promise<void> {
    try {
      await this.dbService.connect();
      
      const logData: ValidationLogData = {
        uniqueId,
        sourceModule,
        validationResult,
        context,
        timestamp: new Date(),
        correlationId: validationResult.correlationId
      };
      
      await this.dbService.createValidationLog(logData);
      
    } catch (error) {
      logger.error(`Failed to log invalid user ${uniqueId}`, {
        uniqueId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Cache management
   */
  private cacheValidation(uniqueId: string, result: ValidationResult): void {
    this.validationCache.set(uniqueId, {
      result,
      timestamp: Date.now()
    });
  }

  private getCachedValidation(uniqueId: string): ValidationResult | null {
    const cached = this.validationCache.get(uniqueId);
    if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
      return cached.result;
    }
    return null;
  }

  /**
   * Error tracking
   */
  private incrementErrorCount(uniqueId: string): void {
    const count = this.errorCounts.get(uniqueId) || 0;
    this.errorCounts.set(uniqueId, count + 1);
  }

  private getErrorCount(uniqueId: string): number {
    return this.errorCounts.get(uniqueId) || 0;
  }

  /**
   * Module statistics
   */
  private updateModuleStats(module: string, event: keyof ModuleStats): void {
    if (!this.moduleStats.has(module)) {
      this.moduleStats.set(module, {
        validation_attempt: 0,
        validation_success: 0,
        validation_failure: 0,
        validation_error: 0
      });
    }
    
    const stats = this.moduleStats.get(module)!;
    stats[event] = (stats[event] || 0) + 1;
  }

  public getModuleStats(): Record<string, ModuleStats> {
    return Object.fromEntries(this.moduleStats);
  }

  /**
   * Utility methods
   */
  private generateCorrelationId(): string {
    return `val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private logValidation(sourceModule: string, uniqueId: string, status: string, correlationId: string, duration: number, error?: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      sourceModule,
      uniqueId,
      status,
      correlationId,
      duration,
      error: error?.message
    };
    
    logger.info(`Validation [${sourceModule}] ${uniqueId}`, {
      uniqueId,
      sourceModule,
      status,
      duration,
      correlationId
    });
    
    if (error) {
      logger.error(`Validation error [${sourceModule}] ${uniqueId}`, {
        uniqueId,
        sourceModule,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      });
    }
  }

  /**
   * Cleanup methods
   */
  public clearCache(): void {
    this.validationCache.clear();
    logger.info('Validation cache cleared');
  }

  public clearErrorCounts(): void {
    this.errorCounts.clear();
    logger.info('Error counts cleared');
  }

  /**
   * Health check
   */
  public getHealthStatus(): HealthStatus {
    return {
      cacheSize: this.validationCache.size,
      errorCounts: this.errorCounts.size,
      moduleStats: this.getModuleStats(),
      timestamp: new Date().toISOString()
    };
  }
}

export default ValidationService;
