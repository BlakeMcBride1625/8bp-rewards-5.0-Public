// @ts-ignore
const DiscordService = require('../../../services/discord-service');
import { DatabaseService } from './DatabaseService';
import ValidationService from './ValidationService';

interface AlertThresholds {
  failureRate: number;
  timeWindow: number;
  maxErrorsPerUser: number;
  alertCooldown: number;
}

interface Alert {
  type: string;
  message: string;
  severity: 'critical' | 'warning';
  data: Record<string, any>;
}

interface MonitoringStatus {
  isRunning: boolean;
  thresholds: AlertThresholds;
  lastAlertCount: number;
  errorCountCount: number;
  moduleStats: Record<string, any>;
}

class MonitoringService {
  private dbService: DatabaseService;
  private validationService: ValidationService;
  private discordService: any;
  
  // Alert thresholds
  private thresholds: AlertThresholds;
  
  // Alert state
  private lastAlertTime: Map<string, number>;
  private errorCounts: Map<string, number>;
  private moduleStats: Map<string, any>;
  
  // Monitoring intervals
  private monitoringInterval: NodeJS.Timeout | null;
  private cleanupInterval: NodeJS.Timeout | null;
  
  constructor() {
    this.dbService = DatabaseService.getInstance();
    this.validationService = new ValidationService();
    this.discordService = null;
    
    // Alert thresholds
    this.thresholds = {
      failureRate: 0.10, // 10% failure rate
      timeWindow: 5 * 60 * 1000, // 5 minutes
      maxErrorsPerUser: 3, // Max errors per user before flagging
      alertCooldown: 10 * 60 * 1000 // 10 minutes between alerts
    };
    
    // Alert state
    this.lastAlertTime = new Map();
    this.errorCounts = new Map();
    this.moduleStats = new Map();
    
    // Monitoring intervals
    this.monitoringInterval = null;
    this.cleanupInterval = null;
    
    console.log('🔍 MonitoringService initialized');
  }

  /**
   * Start monitoring system
   */
  public async start(): Promise<void> {
    try {
      // Initialize Discord service for alerts
      this.discordService = new DiscordService();
      await this.discordService.login();
      
      // Start monitoring intervals
      this.startMonitoring();
      this.startCleanup();
      
      console.log('✅ MonitoringService started');
    } catch (error) {
      console.error('❌ Failed to start MonitoringService:', error);
    }
  }

  /**
   * Stop monitoring system
   */
  public async stop(): Promise<void> {
    try {
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }
      
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }
      
      if (this.discordService) {
        await this.discordService.logout();
      }
      
      console.log('🛑 MonitoringService stopped');
    } catch (error) {
      console.error('❌ Failed to stop MonitoringService:', error);
    }
  }

  /**
   * Start monitoring interval
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkSystemHealth();
        await this.checkModuleHealth();
        await this.checkUserErrorPatterns();
      } catch (error) {
        console.error('❌ Monitoring check failed:', error);
      }
    }, this.thresholds.timeWindow); // Check every 5 minutes
  }

  /**
   * Start cleanup interval
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldData();
    }, 60 * 60 * 1000); // Cleanup every hour
  }

  /**
   * Check overall system health
   */
  private async checkSystemHealth(): Promise<void> {
    try {
      await this.dbService.connect();
      const metrics = await this.dbService.getSystemHealthMetrics();
      
      // Check for critical issues
      const issues: Alert[] = [];
      
      if (metrics.validationFailures && metrics.validationFailures > 0) {
        const failureRate = metrics.validationFailures / metrics.recentValidations;
        if (failureRate > this.thresholds.failureRate) {
          issues.push({
            type: 'high_failure_rate',
            message: `High validation failure rate: ${(failureRate * 100).toFixed(1)}%`,
            severity: 'critical',
            data: { failureRate, failures: metrics.validationFailures, total: metrics.recentValidations }
          });
        }
      }
      
      if (metrics.invalidUsers && metrics.invalidUsers > 50) {
        issues.push({
          type: 'high_invalid_users',
          message: `High number of invalid users: ${metrics.invalidUsers}`,
          severity: 'warning',
          data: { invalidUsers: metrics.invalidUsers }
        });
      }
      
      // Send alerts for critical issues
      for (const issue of issues) {
        if (issue.severity === 'critical') {
          await this.sendAlert(issue);
        }
      }
      
    } catch (error) {
      console.error('❌ System health check failed:', error);
    }
  }

  /**
   * Check individual module health
   */
  private async checkModuleHealth(): Promise<void> {
    try {
      const moduleStats = this.validationService.getModuleStats();
      
      for (const [moduleName, stats] of Object.entries(moduleStats)) {
        const totalAttempts = stats.validation_attempt || 0;
        const failures = stats.validation_failure || 0;
        const errors = stats.validation_error || 0;
        
        if (totalAttempts > 0) {
          const failureRate = (failures + errors) / totalAttempts;
          
          if (failureRate > this.thresholds.failureRate) {
            await this.sendAlert({
              type: 'module_failure_rate',
              message: `Module ${moduleName} has high failure rate: ${(failureRate * 100).toFixed(1)}%`,
              severity: 'warning',
              data: { moduleName, failureRate, totalAttempts, failures, errors }
            });
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Module health check failed:', error);
    }
  }

  /**
   * Check for problematic user error patterns
   */
  private async checkUserErrorPatterns(): Promise<void> {
    try {
      await this.dbService.connect();
      
      // Get recent validation logs
      const recentLogs = await this.dbService.getValidationLogs({
        startDate: new Date(Date.now() - this.thresholds.timeWindow),
        limit: 1000
      });
      
      // Count errors per user
      const userErrorCounts = new Map<string, number>();
      
      for (const log of recentLogs) {
        if (log.validation_result && !log.validation_result.isValid) {
          const count = userErrorCounts.get(log.unique_id) || 0;
          userErrorCounts.set(log.unique_id, count + 1);
        }
      }
      
      // Flag users with too many errors
      for (const [userId, errorCount] of userErrorCounts) {
        if (errorCount >= this.thresholds.maxErrorsPerUser) {
          await this.sendAlert({
            type: 'user_error_pattern',
            message: `User ${userId} has ${errorCount} errors in the last 5 minutes`,
            severity: 'warning',
            data: { userId, errorCount, timeWindow: this.thresholds.timeWindow }
          });
        }
      }
      
    } catch (error) {
      console.error('❌ User error pattern check failed:', error);
    }
  }

  /**
   * Send alert via Discord
   */
  private async sendAlert(alert: Alert): Promise<void> {
    try {
      const alertKey = `${alert.type}_${JSON.stringify(alert.data)}`;
      const lastAlert = this.lastAlertTime.get(alertKey);
      
      // Check cooldown
      if (lastAlert && (Date.now() - lastAlert) < this.thresholds.alertCooldown) {
        return; // Skip alert due to cooldown
      }
      
      if (!this.discordService || !this.discordService.isReady) {
        console.log('⚠️ Discord service not available for alert');
        return;
      }
      
      // Create alert embed
      const embed = {
        title: `🚨 System Alert: ${alert.type.replace(/_/g, ' ').toUpperCase()}`,
        description: alert.message,
        color: alert.severity === 'critical' ? 0xFF0000 : 0xFFA500, // Red for critical, orange for warning
        fields: [
          {
            name: 'Severity',
            value: alert.severity.toUpperCase(),
            inline: true
          },
          {
            name: 'Timestamp',
            value: new Date().toISOString(),
            inline: true
          }
        ],
        timestamp: new Date()
      };
      
      // Add data fields if available
      if (alert.data) {
        for (const [key, value] of Object.entries(alert.data)) {
          embed.fields.push({
            name: key.replace(/_/g, ' ').toUpperCase(),
            value: String(value),
            inline: true
          });
        }
      }
      
      // Send to Discord
      const channelId = process.env.ALERTS_CHANNEL_ID || process.env.REWARDS_CHANNEL_ID;
      if (channelId) {
        const channel = this.discordService.client.channels.cache.get(channelId);
        if (channel && channel.isTextBased()) {
          await channel.send({ embeds: [embed] });
          console.log(`🚨 Alert sent: ${alert.type}`);
          
          // Update last alert time
          this.lastAlertTime.set(alertKey, Date.now());
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to send alert:', error);
    }
  }

  /**
   * Cleanup old monitoring data
   */
  private cleanupOldData(): void {
    try {
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      // Cleanup old alert times
      for (const [key, timestamp] of this.lastAlertTime) {
        if (now - timestamp > maxAge) {
          this.lastAlertTime.delete(key);
        }
      }
      
      // Cleanup old error counts
      for (const [key, timestamp] of this.errorCounts) {
        if (now - timestamp > maxAge) {
          this.errorCounts.delete(key);
        }
      }
      
      console.log('🧹 Monitoring data cleaned up');
      
    } catch (error) {
      console.error('❌ Failed to cleanup monitoring data:', error);
    }
  }

  /**
   * Get monitoring status
   */
  public getStatus(): MonitoringStatus {
    return {
      isRunning: this.monitoringInterval !== null,
      thresholds: this.thresholds,
      lastAlertCount: this.lastAlertTime.size,
      errorCountCount: this.errorCounts.size,
      moduleStats: this.validationService.getModuleStats()
    };
  }

  /**
   * Update thresholds
   */
  public updateThresholds(newThresholds: Partial<AlertThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    console.log('📊 Monitoring thresholds updated:', this.thresholds);
  }
}

export default MonitoringService;
