import express, { Request, Response } from 'express';
import ValidationService from '../services/ValidationService';
import { DatabaseService } from '../services/DatabaseService';
import { logger } from '../services/LoggerService';

const router = express.Router();

// Initialize services
const validationService = new ValidationService();
const dbService = DatabaseService.getInstance();

interface ValidationFilters {
  uniqueId?: string;
  sourceModule?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

interface RevalidateUserRequest {
  uniqueId: string;
}

interface CleanupLogsRequest {
  daysToKeep?: number;
}

interface ModuleStatus {
  name: string;
  status: 'integrated' | 'not_integrated';
  stats: {
    validation_attempt: number;
    validation_success: number;
    validation_failure: number;
    validation_error: number;
  };
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  users?: T[];
  error?: string;
  details?: string;
  count?: number;
  filters?: ValidationFilters;
  processed?: number;
  total?: number;
  message?: string;
}

/**
 * Get all deregistered users
 */
router.get('/deregistered-users', async (req: Request, res: Response<ApiResponse>) => {
  try {
    await dbService.connect();
    const invalidUsers = await dbService.findInvalidUsers();
    
    res.json({
      success: true,
      users: invalidUsers,
      count: invalidUsers.length
    });
  } catch (error) {
    logger.error('Failed to fetch deregistered users', {
      action: 'fetch_deregistered_users_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch deregistered users',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get validation logs with filtering
 */
router.get('/validation-logs', async (req: Request, res: Response<ApiResponse>) => {
  try {
    await dbService.connect();
    
    const filters: ValidationFilters = {
      uniqueId: req.query.uniqueId as string,
      sourceModule: req.query.sourceModule as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 100
    };
    
    const logs = await dbService.getValidationLogs(filters);
    
    res.json({
      success: true,
      data: logs,
      count: logs.length,
      filters
    });
  } catch (error) {
    logger.error('Failed to fetch validation logs', {
      action: 'fetch_validation_logs_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch validation logs',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get system health metrics
 */
router.get('/system-health', async (req: Request, res: Response<ApiResponse>) => {
  try {
    await dbService.connect();
    const metrics = await dbService.getSystemHealthMetrics();
    const validationHealth = validationService.getHealthStatus();
    
    // Include heartbeat registry data for active services tracking
    const { HeartbeatRegistry } = require('../services/HeartbeatRegistry');
    const heartbeatRegistry = HeartbeatRegistry.getInstance();
    const heartbeatSummary = heartbeatRegistry.getSummary();
    const activeRecords = heartbeatRegistry.getActiveRecords();
    
    // Format module stats for frontend compatibility
    const moduleStatsObj: Record<string, any> = {};
    Object.entries(validationHealth.moduleStats).forEach(([module, stats]: [string, any]) => {
      moduleStatsObj[module] = {
        validation_attempt: stats.validation_attempt || 0,
        validation_success: stats.validation_success || 0,
        validation_failure: stats.validation_failure || 0,
        validation_error: stats.validation_error || 0
      };
    });
    
    res.json({
      success: true,
      data: {
        database: metrics,
        validation: validationHealth,
        heartbeat: {
          totalActiveFiles: heartbeatSummary.totalActiveFiles,
          activeProcesses: Object.keys(heartbeatSummary.byProcess).length,
          activeRecords: activeRecords.length
        },
        cacheSize: validationHealth.cacheSize, // For backward compatibility
        errorCounts: validationHealth.errorCounts, // For backward compatibility
        moduleStats: moduleStatsObj, // For frontend compatibility
        timestamp: new Date().toISOString(),
        status: 'online' // System is online if we can reach here
      }
    });
  } catch (error) {
    logger.error('Failed to fetch system health', {
      action: 'fetch_system_health_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system health',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get system integration data (alias for module-status)
 * Enhanced to include heartbeat registry data for live service status
 */
router.get('/system-integration', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const moduleStats = validationService.getModuleStats();
    
    // Include heartbeat registry data for live service tracking
    const { HeartbeatRegistry } = require('../services/HeartbeatRegistry');
    const heartbeatRegistry = HeartbeatRegistry.getInstance();
    const heartbeatSummary = heartbeatRegistry.getSummary();
    const activeRecords = heartbeatRegistry.getActiveRecords();
    
    // Map active services from heartbeat to module names
    const activeServices = new Set<string>();
    activeRecords.forEach((rec: any) => {
      if (rec.service) {
        activeServices.add(rec.service);
      }
      // Also check moduleId for service identification
      if (rec.moduleId) {
        const moduleIdLower = rec.moduleId.toLowerCase();
        if (moduleIdLower.includes('claimer')) {
          activeServices.add('claimer');
        } else if (moduleIdLower.includes('discord')) {
          activeServices.add('discord');
        } else if (moduleIdLower.includes('scheduler')) {
          activeServices.add('scheduler');
        }
      }
    });
    
    // Define expected modules with their service mappings
    const expectedModules = [
      { name: 'playwright-claimer-discord', serviceType: 'claimer', category: 'Claimers' },
      { name: 'playwright-claimer', serviceType: 'claimer', category: 'Claimers' },
      { name: 'first-time-claimer', serviceType: 'claimer', category: 'Claimers' },
      { name: 'registration-api', serviceType: 'backend', category: 'Services' },
      { name: 'scheduler-service', serviceType: 'scheduler', category: 'Services' },
      { name: 'validation-service', serviceType: 'backend', category: 'Services' },
      { name: 'monitoring-service', serviceType: 'backend', category: 'Services' },
      { name: 'admin-dashboard', serviceType: 'backend', category: 'Services' }
    ];
    
    const moduleStatus: ModuleStatus[] = expectedModules.map(module => {
      const isIntegrated = moduleStats[module.name] ? true : false;
      const isLive = activeServices.has(module.serviceType) || isIntegrated;
      
      return {
        name: module.name,
        status: isLive ? 'integrated' : 'not_integrated',
        stats: moduleStats[module.name] || {
          validation_attempt: 0,
          validation_success: 0,
          validation_failure: 0,
          validation_error: 0
        },
        serviceType: module.serviceType,
        category: module.category,
        isLive: isLive
      };
    });
    
    // Group modules by category
    const modulesByCategory: { [key: string]: ModuleStatus[] } = {
      'Claimers': [],
      'Services': []
    };
    
    moduleStatus.forEach(module => {
      const category = (module as any).category || 'Services';
      if (!modulesByCategory[category]) {
        modulesByCategory[category] = [];
      }
      modulesByCategory[category].push(module);
    });
    
    res.json({
      success: true,
      data: {
        modules: moduleStatus,
        modulesByCategory: modulesByCategory,
        totalModules: expectedModules.length,
        integratedModules: moduleStatus.filter(m => m.status === 'integrated').length,
        liveModules: moduleStatus.filter(m => (m as any).isLive).length,
        heartbeat: {
          totalActiveFiles: heartbeatSummary.totalActiveFiles,
          activeProcesses: Object.keys(heartbeatSummary.byProcess).length,
          activeServices: Array.from(activeServices)
        }
      }
    });
  } catch (error) {
    logger.error('Failed to fetch system integration data', {
      action: 'fetch_system_integration_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system integration data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get module integration status
 */
router.get('/module-status', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const moduleStats = validationService.getModuleStats();
    
    // Define expected modules
    const expectedModules = [
      'playwright-claimer-discord',
      'playwright-claimer',
      'registration-api',
      'scheduler-service',
      'admin-dashboard'
    ];
    
    const moduleStatus: ModuleStatus[] = expectedModules.map(module => ({
      name: module,
      status: moduleStats[module] ? 'integrated' : 'not_integrated',
      stats: moduleStats[module] || {
        validation_attempt: 0,
        validation_success: 0,
        validation_failure: 0,
        validation_error: 0
      }
    }));
    
    res.json({
      success: true,
      data: {
        modules: moduleStatus,
        totalModules: expectedModules.length,
        integratedModules: moduleStatus.filter(m => m.status === 'integrated').length
      }
    });
  } catch (error) {
    logger.error('Failed to fetch module status', {
      action: 'fetch_module_status_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch module status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Force revalidation of a specific user
 */
router.post('/revalidate-user', async (req: Request<{}, ApiResponse, RevalidateUserRequest>, res: Response<ApiResponse>) => {
  try {
    const { uniqueId } = req.body;
    
    if (!uniqueId) {
      return res.status(400).json({
        success: false,
        error: 'Unique ID is required'
      });
    }
    
    // Clear any cached validation for this user
    validationService.clearCache();
    
    // Perform fresh validation
    const result = await validationService.validateUser(uniqueId, 'admin-dashboard', {
      operation: 'manual_revalidation',
      adminTriggered: true
    });
    
    res.json({
      success: true,
      data: result
    });
    
    return; // Explicit return to satisfy TypeScript
  } catch (error) {
    logger.error('Failed to revalidate user', {
      action: 'revalidate_user_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to revalidate user',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
    return; // Explicit return to satisfy TypeScript
  }
});

/**
 * Force revalidation of all invalid users
 */
router.post('/revalidate-all-invalid', async (req: Request, res: Response<ApiResponse>) => {
  try {
    await dbService.connect();
    const invalidUsers = await dbService.findInvalidUsers();
    
    const results: Array<{ uniqueId: string; result?: any; error?: string }> = [];
    
    for (const user of invalidUsers.slice(0, 10)) { // Limit to 10 for safety
      try {
        const result = await validationService.validateUser(
          user.eight_ball_pool_id, 
          'admin-dashboard', 
          {
            operation: 'bulk_revalidation',
            adminTriggered: true
          }
        );
        
        results.push({
          uniqueId: user.eight_ball_pool_id,
          result
        });
      } catch (error: any) {
        results.push({
          uniqueId: user.eight_ball_pool_id,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      data: results,
      processed: results.length,
      total: invalidUsers.length
    });
  } catch (error) {
    logger.error('Failed to revalidate all invalid users', {
      action: 'revalidate_all_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to revalidate all invalid users',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Cleanup old validation logs
 */
router.post('/cleanup-logs', async (req: Request<{}, ApiResponse, CleanupLogsRequest>, res: Response<ApiResponse>) => {
  try {
    const { daysToKeep = 30 } = req.body;
    
    await dbService.connect();
    const deletedCount = await dbService.cleanupValidationLogs(daysToKeep);
    
    res.json({
      success: true,
      data: {
        deletedCount,
        daysToKeep,
        message: `Cleaned up ${deletedCount} old validation logs`
      }
    });
  } catch (error) {
    logger.error('Failed to cleanup logs', {
      action: 'cleanup_logs_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup logs',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get validation service health
 */
router.get('/validation-health', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const health = validationService.getHealthStatus();
    
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Failed to fetch validation health', {
      action: 'fetch_validation_health_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch validation health',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Clear validation cache
 */
router.post('/clear-cache', async (req: Request, res: Response<ApiResponse>) => {
  try {
    validationService.clearCache();
    validationService.clearErrorCounts();
    
    res.json({
      success: true,
      message: 'Validation cache and error counts cleared'
    });
  } catch (error) {
    logger.error('Failed to clear cache', {
      action: 'clear_cache_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
