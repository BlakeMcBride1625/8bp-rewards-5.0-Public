import express from 'express';
import mongoose from 'mongoose';
import { logger } from '../services/LoggerService';
import { DatabaseService } from '../services/DatabaseService';

const router = express.Router();

// Get system status
router.get('/', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Database connectivity check using DatabaseService
    const dbService = DatabaseService.getInstance();
    const dbHealthCheck = await dbService.healthCheck();
    
    // Get database stats
    const dbStats = {
      connected: dbHealthCheck.connected,
      readyState: dbHealthCheck.connected ? 1 : 0,
      host: 'Classified',
      port: 'Classified',
      name: 'Classified'
    };

    // Get system uptime
    const uptime = process.uptime();
    const uptimeFormatted = {
      seconds: Math.floor(uptime),
      formatted: formatUptime(uptime)
    };

    // Get memory usage
    const memoryUsage = process.memoryUsage();
    const memoryFormatted = {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`
    };

    // Get environment info
    const environment = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      env: process.env.NODE_ENV || 'development',
      pid: process.pid
    };

    const responseTime = Date.now() - startTime;

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: uptimeFormatted,
      database: dbStats,
      memory: memoryFormatted,
      environment,
      responseTime: `${responseTime}ms`
    });

  } catch (error) {
    logger.error('System status check failed', {
      action: 'system_status_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Failed to retrieve system status'
    });
  }
});

// Get scheduler status
router.get('/scheduler', async (req, res): Promise<void> => {
  try {
    // Import SchedulerService to get actual status with timeout
    try {
      const SchedulerService = require('../services/SchedulerService').default;
      const schedulerService = SchedulerService.getInstance();
      
      if (!schedulerService) {
        res.json({
          status: 'not_initialized',
          message: 'Scheduler service not initialized'
        });
        return;
      }

      const status = {
        status: schedulerService.isRunning ? 'running' : 'idle',
        lastRun: schedulerService.lastRun ? schedulerService.lastRun.toISOString() : null,
        nextRun: schedulerService.nextRun ? schedulerService.nextRun.toISOString() : null,
        schedule: '00:00, 06:00, 12:00, 18:00 UTC',
        timezone: 'UTC'
      };

      res.json(status);
      return;
    } catch (importError) {
      // If import fails, return basic status
      res.json({
        status: 'unknown',
        message: 'Scheduler service unavailable',
        schedule: '00:00, 06:00, 12:00, 18:00 UTC',
        timezone: 'UTC'
      });
      return;
    }

  } catch (error) {
    logger.error('Scheduler status check failed', {
      action: 'scheduler_status_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Failed to retrieve scheduler status'
    });
  }
});

// Get database status
router.get('/database', async (req, res) => {
  try {
    const dbService = DatabaseService.getInstance();
    const healthCheck = await dbService.healthCheck();

    res.json({
      ...healthCheck,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Database status check failed', {
      action: 'database_status_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Failed to retrieve database status'
    });
  }
});

// Get application metrics
router.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      version: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      environment: process.env.NODE_ENV || 'development'
    };

    res.json(metrics);

  } catch (error) {
    logger.error('Metrics retrieval failed', {
      action: 'metrics_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Failed to retrieve metrics'
    });
  }
});

// Get Discord bot status (if running)
router.get('/discord-bot', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // Check if discord-bot process is running
    try {
      const { stdout } = await execAsync('pgrep -f "discord.*bot" || echo ""');
      const isRunning = stdout.trim().length > 0;
      
      res.json({
        status: isRunning ? 'running' : 'not_running',
        pid: isRunning ? stdout.trim() : null,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.json({
        status: 'unknown',
        error: 'Could not check Discord bot status',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    logger.error('Discord bot status check failed', {
      action: 'discord_bot_status_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Failed to retrieve Discord bot status'
    });
  }
});

// Get claimers status
router.get('/claimers', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    const claimers = [
      { name: 'playwright-claimer', file: 'playwright-claimer.js' },
      { name: 'playwright-claimer-discord', file: 'playwright-claimer-discord.js' },
      { name: 'first-time-claim', file: 'first-time-claim.js' }
    ];
    
    const status = [];
    
    for (const claimer of claimers) {
      const filePath = path.join(process.cwd(), claimer.file);
      const exists = fs.existsSync(filePath);
      
      // Check if process is running
      let isRunning = false;
      let pid = null;
      try {
        const { stdout } = await execAsync(`pgrep -f "${claimer.file}" || echo ""`);
        if (stdout.trim().length > 0) {
          isRunning = true;
          pid = stdout.trim().split('\n')[0];
        }
      } catch (e) {
        // Process not running
      }
      
      status.push({
        name: claimer.name,
        file: claimer.file,
        exists,
        running: isRunning,
        pid: pid ? parseInt(pid) : null
      });
    }
    
    res.json({
      claimers: status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Claimers status check failed', {
      action: 'claimers_status_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Failed to retrieve claimers status'
    });
  }
});

// Comprehensive health check endpoint
router.get('/health', async (req, res) => {
  try {
    const dbService = DatabaseService.getInstance();
    const dbHealth = await dbService.healthCheck();
    
    // Check Discord bot
    let discordBotStatus = 'unknown';
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const { stdout } = await execAsync('pgrep -f "discord.*bot" || echo ""');
      discordBotStatus = stdout.trim().length > 0 ? 'running' : 'not_running';
    } catch (e) {
      discordBotStatus = 'unknown';
    }
    
    // Overall health
    const overallHealth = dbHealth.connected && discordBotStatus !== 'error' ? 'healthy' : 'degraded';
    
    res.json({
      status: overallHealth,
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: dbHealth.connected ? 'healthy' : 'unhealthy',
          connected: dbHealth.connected
        },
        backend: {
          status: 'healthy',
          uptime: process.uptime(),
          pid: process.pid
        },
        discordBot: {
          status: discordBotStatus
        },
        scheduler: {
          status: 'unknown' // Will be checked if scheduler is available
        }
      }
    });

  } catch (error) {
    logger.error('Health check failed', {
      action: 'health_check_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      status: 'unhealthy',
      error: 'Health check failed'
    });
  }
});

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0) parts.push(`${secs}s`);

  return parts.join(' ') || '0s';
}

export default router;







