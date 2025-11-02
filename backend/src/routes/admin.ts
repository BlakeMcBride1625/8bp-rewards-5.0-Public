import express from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { logger } from '../services/LoggerService';
import { HeartbeatRegistry } from '../services/HeartbeatRegistry';
import { authenticateAdmin } from '../middleware/auth';
import DiscordNotificationService from '../services/DiscordNotificationService';
import TelegramNotificationService from '../services/TelegramNotificationService';
import { EmailNotificationService } from '../services/EmailNotificationService';
import { exec } from 'child_process';
import path from 'path';
import { DeviceDetectionService } from '../services/DeviceDetectionService';
import { BlockingService } from '../services/BlockingService';
import { checkDeviceBlocking, logDeviceInfo } from '../middleware/deviceBlocking';
import crypto from 'crypto';
import axios from 'axios';

// Global type declarations for in-memory storage
declare global {
  var vpsCodes: Map<string, { discordCode: string; telegramCode: string; emailCode: string; userEmail: string; userId: string; username: string; expiresAt: Date; attempts: number; discordMessageId?: string; telegramMessageId?: string }> | undefined;
  var vpsAccess: Map<string, { grantedAt: Date; expiresAt: Date }> | undefined;
  var resetLeaderboardCodes: Map<string, { discordCode: string; telegramCode: string; emailCode: string; userEmail: string; userId: string; username: string; expiresAt: Date; attempts: number; discordMessageId?: string; telegramMessageId?: string }> | undefined;
  var resetLeaderboardAccess: Map<string, { grantedAt: Date; expiresAt: Date }> | undefined;
}

const router = express.Router();
const dbService = DatabaseService.getInstance();
const deviceDetectionService = DeviceDetectionService.getInstance();
const blockingService = BlockingService.getInstance();

// Public bot status endpoint (no auth required)
router.get('/bot-status-public', async (req, res) => {
  try {
    // Make a request to the Discord bot service to get current status
    const botServiceUrl = 'http://localhost:2700'; // Use localhost for hybrid mode
    
    try {
      const response = await axios.get(`${botServiceUrl}/api/bot-status`, {
        timeout: 5000
      });
      
      return res.json({
        success: true,
        data: response.data
      });
    } catch (botError) {
      // If bot service is not available, return basic info
      return res.json({
        success: true,
        data: {
          success: true,
          currentStatus: 'offline',
          environmentStatus: 'dnd',
          botReady: false,
          botTag: null,
          message: 'Bot service unavailable'
        }
      });
    }
    
  } catch (error: any) {
    logger.error('Error in bot status endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get bot status',
      details: error.message
    });
  }
});

// Apply admin authentication to all remaining routes
router.use(authenticateAdmin);

// Get admin dashboard overview
router.get('/overview', async (req, res) => {
  try {
    const user = req.user as any;
    
    // Get registration count
    const totalRegistrations = await dbService.findRegistrations();
    
    // Get recent registrations (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentRegistrations = await dbService.findRegistrations({
      createdAt: { $gte: sevenDaysAgo }
    });

    // Get claim statistics (all-time)
    const claimStats = await dbService.getClaimStats(); // Get all-time stats
    
    // Get log statistics (last 7 days) from database
    let logStats: any[] = [];
    try {
      const { Pool } = require('pg');
      const pool = new Pool({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || '8bp_rewards',
        user: process.env.POSTGRES_USER || 'admin',
        password: process.env.POSTGRES_PASSWORD || '192837DB25',
        ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
      });
      
      // Get log counts by level for last 7 days
      const result = await pool.query(`
        SELECT level, COUNT(*) as count 
        FROM log_entries 
        WHERE timestamp > NOW() - INTERVAL '7 days'
        GROUP BY level
      `);
      
      // Convert to array format
      logStats = result.rows.map((row: any) => ({
        _id: row.level,
        count: parseInt(row.count),
        latest: new Date().toISOString()
      }));
      
      await pool.end();
    } catch (error) {
      logger.warn('Failed to read log statistics from database', { error: error instanceof Error ? error.message : 'Unknown error' });
    }

    // Get recent claims
    const recentClaims = await dbService.findClaimRecords();
    
    // Debug logging for claim status
    logger.info('Admin overview - recent claims debug', {
      action: 'admin_overview_debug',
      totalClaims: recentClaims.length,
      claimStatuses: recentClaims.slice(0, 5).map((claim: any) => ({
        id: claim.id,
        eightBallPoolId: claim.eightBallPoolId,
        status: claim.status,
        itemsClaimed: claim.itemsClaimed,
        claimedAt: claim.claimedAt
      }))
    });

    res.json({
      registrations: {
        total: totalRegistrations.length,
        recent: recentRegistrations.length,
        period: '7 days'
      },
      claims: claimStats,
      logs: logStats,
      recentClaims: recentClaims.slice(0, 10).map((claim: any) => ({
        eightBallPoolId: claim.eightBallPoolId,
        status: claim.status,
        itemsClaimed: claim.itemsClaimed,
        claimedAt: claim.claimedAt
      }))
    });

  } catch (error) {
    logger.error('Failed to retrieve admin overview', {
      action: 'admin_overview_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      adminId: (req.user as any)?.id
    });

    res.status(500).json({
      error: 'Failed to retrieve dashboard overview'
    });
  }
});

// Heartbeat admin proxy endpoints (surface summary into admin routes)
router.get('/heartbeat/summary', async (req, res) => {
  const registry = HeartbeatRegistry.getInstance();
  return res.json({ success: true, data: registry.getSummary() });
});
router.get('/heartbeat/active', async (req, res) => {
  const registry = HeartbeatRegistry.getInstance();
  return res.json({ success: true, data: registry.getActiveRecords() });
});

// Get test users configuration
router.get('/test-users', async (req, res) => {
  try {
    // Default test users - can be configured via environment variables
    const defaultTestUsers = [
      { id: '1826254746', username: 'TestUser1', description: 'Primary test user' },
      { id: '3057211056', username: 'TestUser2', description: 'Secondary test user' },
      { id: '110141', username: 'TestUser3', description: 'Tertiary test user' }
    ];

    // Check if custom test users are configured via environment
    const customTestUsers = process.env.TEST_USERS;
    let testUsers = defaultTestUsers;

    if (customTestUsers) {
      try {
        const parsed = JSON.parse(customTestUsers);
        if (Array.isArray(parsed)) {
          testUsers = parsed;
        }
      } catch (error) {
        logger.warn('Failed to parse TEST_USERS environment variable', {
          action: 'test_users_parse_error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    res.json({
      testUsers,
      configured: !!customTestUsers,
      count: testUsers.length
    });

  } catch (error) {
    logger.error('Failed to retrieve test users', {
      action: 'admin_test_users_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      adminId: (req.user as any)?.id
    });

    res.status(500).json({
      error: 'Failed to retrieve test users'
    });
  }
});

// Get all registrations with pagination
router.get('/registrations', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = req.query.search as string;

    let filter = {};
    if (search) {
      filter = {
        $or: [
          { eightBallPoolId: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const registrations = await dbService.findRegistrations(filter);
    const total = registrations.length;

    res.json({
      registrations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Failed to retrieve registrations for admin', {
      action: 'admin_registrations_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      adminId: (req.user as any)?.id
    });

    res.status(500).json({
      error: 'Failed to retrieve registrations'
    });
  }
});

// Add new registration (admin)
router.post('/registrations', checkDeviceBlocking, logDeviceInfo, async (req, res): Promise<void> => {
  try {
    const { eightBallPoolId, username } = req.body;

    if (!eightBallPoolId || !username) {
      res.status(400).json({
        error: 'Missing required fields: eightBallPoolId, username'
      });
      return;
    }

    // Check if user already exists
    const existingUser = await dbService.findRegistration({ eightBallPoolId });
    if (existingUser) {
      res.status(409).json({
        error: 'User with this 8 Ball Pool ID already exists'
      });
      return;
    }

    // Extract client IP with better proxy handling
    console.log('🔍 Admin IP Detection Debug - Starting IP detection for user:', username);
    const clientIP = req.ip || 
                     req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
                     req.headers['x-real-ip']?.toString() ||
                     req.headers['cf-connecting-ip']?.toString() ||
                     req.connection?.remoteAddress ||
                     req.socket?.remoteAddress ||
                     'Admin Dashboard';
    console.log('🔍 Admin IP Detection Debug - Final clientIP:', clientIP);

    // Extract device information
    const deviceInfo = deviceDetectionService.extractDeviceInfo(req);
    
    logger.info('Admin device detection completed', {
      action: 'admin_device_detection',
      eightBallPoolId,
      username,
      deviceId: deviceInfo.deviceId.substring(0, 8) + '...', // Log partial ID for privacy
      deviceType: deviceInfo.deviceType,
      platform: deviceInfo.platform,
      browser: deviceInfo.browser
    });

    const registration = await dbService.createRegistration({
      eightBallPoolId,
      username,
      registrationIp: clientIP,
      deviceId: deviceInfo.deviceId,
      deviceType: deviceInfo.deviceType,
      userAgent: deviceInfo.userAgent,
      lastLoginAt: new Date()
    });

    logger.logAdminAction((req.user as any)?.id, 'add_registration', {
      eightBallPoolId,
      username
    });

    // Send Discord notification for admin-added registration
    const discordNotification = new DiscordNotificationService();
    discordNotification.sendRegistrationNotification(
      eightBallPoolId, 
      username, 
      clientIP
    ).catch(error => {
      logger.error('Discord notification failed (non-blocking)', {
        action: 'discord_notification_error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    });

    // Trigger immediate first-time claim using the working claimer
    logger.info('Triggering first-time claim for admin-added user', {
      action: 'first_claim_trigger',
      eightBallPoolId,
      username
    });
    
    // Use the working claimer script directly
    // Run in background (don't await - let it run async)
    (async () => {
      try {
        logger.info('🚀 ASYNC CLAIM STARTED', { eightBallPoolId });
        const EightBallPoolClaimer = require('../../../playwright-claimer-discord');
        logger.info('✅ Claimer module loaded', { eightBallPoolId });
        const claimer = new EightBallPoolClaimer();
        logger.info('✅ Claimer instance created', { eightBallPoolId });
        
        // Initialize Discord and Database before claiming
        logger.info('Initializing Discord service for claim', { eightBallPoolId });
        await claimer.initializeDiscord();
        
        logger.info('Connecting to MongoDB for claim', { eightBallPoolId });
        await claimer.connectToDatabase();
        
        logger.info('Starting claim process', { eightBallPoolId });
        const result = await claimer.claimRewardsForUser(eightBallPoolId);
        
        if (result.success) {
          logger.info('First-time claim completed', {
            action: 'first_claim_success',
            eightBallPoolId,
            itemsClaimed: result.claimedItems
          });
        } else {
          logger.error('First-time claim failed', {
            action: 'first_claim_error',
            eightBallPoolId,
            error: result.error
          });
        }
      } catch (error) {
        logger.error('First-time claim error', {
          action: 'first_claim_error',
          eightBallPoolId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    })();

    res.status(201).json({
      message: 'Registration added successfully',
      registration
    });

  } catch (error) {
    logger.error('Failed to add registration', {
      action: 'admin_add_registration_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      adminId: (req.user as any)?.id
    });

    res.status(500).json({
      error: 'Failed to add registration'
    });
  }
});

// Remove registration (admin)
router.delete('/registrations/:eightBallPoolId', async (req, res): Promise<void> => {
  try {
    const { eightBallPoolId } = req.params;

    const registration = await dbService.findRegistration({ eightBallPoolId });
    
    if (!registration) {
      res.status(404).json({
        error: 'Registration not found'
      });
      return;
    }

    await dbService.deleteRegistration(eightBallPoolId);

    logger.logAdminAction((req.user as any)?.id, 'remove_registration', {
      eightBallPoolId,
      username: registration.username
    });

    res.json({
      message: 'Registration removed successfully',
      registration
    });

  } catch (error) {
    logger.error('Failed to remove registration', {
      action: 'admin_remove_registration_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      adminId: (req.user as any)?.id,
      eightBallPoolId: req.params.eightBallPoolId
    });

    res.status(500).json({
      error: 'Failed to remove registration'
    });
  }
});

// Remove failed claims (admin)
router.delete('/claim-records/failed', async (req, res): Promise<void> => {
  try {
    const deletedCount = await dbService.deleteClaimRecords({ status: 'failed' });

    logger.logAdminAction((req.user as any)?.id, 'clear_failed_claims', {
      deletedCount
    });

    res.json({
      message: 'Failed claims removed successfully',
      deletedCount
    });

  } catch (error) {
    logger.error('Failed to remove failed claims', {
      action: 'admin_clear_failed_claims_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      adminId: (req.user as any)?.id
    });

    res.status(500).json({
      error: 'Failed to remove failed claims'
    });
  }
});

// Get logs with pagination and filters
router.get('/logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const level = req.query.level as string;
    const service = req.query.service as string;
    const action = req.query.action as string;

    let filters: any = {};
    if (level) filters.level = level;
    if (service) filters.service = service;
    if (action) filters.action = action;

    // Read from PostgreSQL database
    const { Pool } = require('pg');
    const pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || '8bp_rewards',
      user: process.env.POSTGRES_USER || 'admin',
      password: process.env.POSTGRES_PASSWORD || '192837DB25',
      ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
      // Connection pool settings to prevent disconnections
      max: 20,
      min: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });
    
    let logs: any[] = [];
    
    try {
      // Build query with filters
      let query = 'SELECT * FROM log_entries WHERE 1=1';
      const queryParams: any[] = [];
      let paramCount = 0;
      
      if (level) {
        query += ` AND level = $${++paramCount}`;
        queryParams.push(level);
      }
      if (service) {
        query += ` AND service = $${++paramCount}`;
        queryParams.push(service);
      }
      if (action) {
        query += ` AND metadata->>'action' = $${++paramCount}`;
        queryParams.push(action);
      }
      
      query += ` ORDER BY timestamp DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
      queryParams.push(limit, (page - 1) * limit);
      
      const result = await pool.query(query, queryParams);
      logs = result.rows.map((row: any) => ({
        id: row.id,
        timestamp: row.timestamp,
        level: row.level,
        message: row.message,
        service: row.service,
        metadata: row.metadata
      }));
      
      // Get total count for pagination
      let countQuery = 'SELECT COUNT(*) as total FROM log_entries WHERE 1=1';
      const countParams: any[] = [];
      let countParamCount = 0;
      
      if (level) {
        countQuery += ` AND level = $${++countParamCount}`;
        countParams.push(level);
      }
      if (service) {
        countQuery += ` AND service = $${++countParamCount}`;
        countParams.push(service);
      }
      if (action) {
        countQuery += ` AND metadata->>'action' = $${++countParamCount}`;
        countParams.push(action);
      }
      
      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total);
      
      await pool.end();
      
      res.json({
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
      
      return;
    } catch (dbError) {
      console.error('Database query error:', dbError);
      await pool.end();
      
      // Fallback to reading from log files
      const fs = require('fs');
      const path = require('path');
      
      try {
        // Read from combined log file
        const logPath = path.join(__dirname, '../../../../../logs/combined.log');
        if (fs.existsSync(logPath)) {
          const logContent = fs.readFileSync(logPath, 'utf8');
        const logLines = logContent.split('\n').filter((line: string) => line.trim());
        
        logs = logLines.slice(-100).map((line: string, index: number) => {
          try {
            const parsed = JSON.parse(line);
            return {
              id: index,
              level: parsed.level || 'info',
              message: parsed.message || line,
              timestamp: parsed.timestamp || new Date().toISOString(),
              service: parsed.service || '8bp-rewards',
              action: parsed.action || 'unknown'
            };
          } catch {
            return {
              id: index,
              level: 'info',
              message: line,
              timestamp: new Date().toISOString(),
              service: '8bp-rewards',
              action: 'unknown'
            };
          }
        }).reverse(); // Most recent first
        }
      } catch (error) {
        logger.error('Failed to read log files', { error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    // Apply filters
    if (level) {
      logs = logs.filter(log => log.level === level);
    }
    if (service) {
      logs = logs.filter(log => log.service === service);
    }
    if (action) {
      logs = logs.filter(log => log.action === action);
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedLogs = logs.slice(startIndex, endIndex);

    res.json({
      logs: paginatedLogs,
      pagination: {
        page,
        limit,
        total: logs.length,
        pages: Math.ceil(logs.length / limit)
      }
    });

  } catch (error) {
    logger.error('Failed to retrieve logs for admin', {
      action: 'admin_logs_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      adminId: (req.user as any)?.id
    });

    res.status(500).json({
      error: 'Failed to retrieve logs'
    });
  }
});

// In-memory storage for progress tracking
const claimProgress = new Map<string, any>();

// Manual claim for specific users (admin)
router.post('/claim-users', async (req, res): Promise<any> => {
  try {
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        error: 'userIds array is required and must not be empty'
      });
    }

    logger.logAdminAction((req.user as any)?.id, 'manual_claim_users_trigger', {
      userIds,
      count: userIds.length,
      timestamp: new Date().toISOString()
    });

    // Trigger the claim script asynchronously with specific users
    const { spawn } = require('child_process');
    const claimProcess = spawn('node', ['playwright-claimer-discord.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MONGO_URI: process.env.MONGO_URI,
        ENABLE_PROGRESS_TRACKING: 'true',
        TARGET_USER_IDS: userIds.join(',') // Pass specific user IDs
      },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const processId = claimProcess.pid?.toString() || Date.now().toString();
    
    // Initialize progress tracking
    claimProgress.set(processId, {
      status: 'starting',
      startTime: new Date(),
      currentUser: null,
      totalUsers: userIds.length,
      completedUsers: 0,
      failedUsers: 0,
      userProgress: [],
      logs: [],
      targetUsers: userIds
    });

    // Log process output for debugging and progress tracking
    claimProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString().trim();
      logger.info('Targeted claim process output', {
        action: 'targeted_claim_process_output',
        output,
        pid: claimProcess.pid,
        targetUsers: userIds
      });

      // Parse progress updates from the claimer script
      const progress = claimProgress.get(processId);
      if (progress) {
        progress.logs.push({
          timestamp: new Date(),
          message: output,
          type: 'info'
        });

        // Parse specific progress indicators (same as claim-all)
        if (output.includes('🚀 Starting claim process for User ID:')) {
          const userIdMatch = output.match(/User ID: (\d+)/);
          if (userIdMatch) {
            progress.currentUser = userIdMatch[1];
            progress.userProgress.push({
              userId: userIdMatch[1],
              status: 'starting',
              startTime: new Date(),
              steps: []
            });
          }
        } else if (output.includes('✅ Claim process completed for user:')) {
          const userIdMatch = output.match(/Claim process completed for user: (\d+)/);
          if (userIdMatch) {
            const completedUserId = userIdMatch[1];
            
            const userProgressEntry = progress.userProgress.find((up: any) => up.userId === completedUserId);
            if (userProgressEntry && userProgressEntry.status !== 'completed') {
              userProgressEntry.status = 'completed';
              userProgressEntry.steps.push({ step: 'completed', timestamp: new Date() });
              progress.completedUsers++;
              
              const activeUsers = progress.userProgress.filter((up: any) => up.status === 'starting' || up.status === 'in_progress');
              if (activeUsers.length > 0) {
                progress.currentUser = activeUsers[0].userId;
              } else {
                progress.currentUser = 'All target users processed';
              }
            }
          }
        } else if (output.includes('⚠️ Failed to send Discord confirmation') || output.includes('Error claiming')) {
          const currentUserProgress = progress.userProgress[progress.userProgress.length - 1];
          if (currentUserProgress && currentUserProgress.status !== 'failed') {
            currentUserProgress.status = 'failed';
            currentUserProgress.steps.push({ step: 'failed', timestamp: new Date() });
            progress.failedUsers++;
            
            const activeUsers = progress.userProgress.filter((up: any) => up.status === 'starting' || up.status === 'in_progress');
            if (activeUsers.length > 0) {
              progress.currentUser = activeUsers[0].userId;
            } else {
              progress.currentUser = 'All target users processed';
            }
          }
        }

        claimProgress.set(processId, progress);
      }
    });

    claimProcess.stderr.on('data', (data: Buffer) => {
      const error = data.toString().trim();
      logger.error('Targeted claim process error', {
        action: 'targeted_claim_process_error',
        error,
        pid: claimProcess.pid,
        targetUsers: userIds
      });

      const progress = claimProgress.get(processId);
      if (progress) {
        progress.logs.push({
          timestamp: new Date(),
          message: error,
          type: 'error'
        });
        claimProgress.set(processId, progress);
      }
    });

    claimProcess.on('close', (code: number | null) => {
      logger.info('Targeted claim process completed', {
        action: 'targeted_claim_process_completed',
        exitCode: code,
        pid: claimProcess.pid,
        targetUsers: userIds
      });

      const progress = claimProgress.get(processId);
      if (progress) {
        progress.status = 'completed';
        progress.endTime = new Date();
        progress.exitCode = code;
        claimProgress.set(processId, progress);
      }
    });

    // Detach the process so it runs independently
    claimProcess.unref();

    logger.info('Manual claim process started for specific users', {
      action: 'manual_claim_users_started',
      pid: claimProcess.pid,
      adminId: (req.user as any)?.id,
      targetUsers: userIds
    });

    res.json({
      message: `Manual claim process started for ${userIds.length} users`,
      pid: claimProcess.pid,
      processId,
      targetUsers: userIds,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to trigger manual claim for specific users', {
      action: 'admin_manual_claim_users_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      adminId: (req.user as any)?.id
    });

    res.status(500).json({
      error: 'Failed to trigger manual claim for specific users'
    });
  }
});

// Manual claim trigger (admin) - keep existing functionality
router.post('/claim-all', async (req, res) => {
  try {
    logger.logAdminAction((req.user as any)?.id, 'manual_claim_trigger', {
      timestamp: new Date().toISOString()
    });

    // Trigger the claim script asynchronously
    const { spawn } = require('child_process');
    const claimProcess = spawn('node', ['playwright-claimer-discord.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MONGO_URI: process.env.MONGO_URI,
        ENABLE_PROGRESS_TRACKING: 'true'
      },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const processId = claimProcess.pid?.toString() || Date.now().toString();
    
    // Initialize progress tracking
    claimProgress.set(processId, {
      status: 'starting',
      startTime: new Date(),
      currentUser: null,
      totalUsers: 0,
      completedUsers: 0,
      failedUsers: 0,
      userProgress: [],
      logs: []
    });

    // Log process output for debugging and progress tracking
    claimProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString().trim();
      logger.info('Claim process output', {
        action: 'claim_process_output',
        output,
        pid: claimProcess.pid
      });

      // Parse progress updates from the claimer script
      const progress = claimProgress.get(processId);
      if (progress) {
        progress.logs.push({
          timestamp: new Date(),
          message: output,
          type: 'info'
        });

        // Parse specific progress indicators
        if (output.includes('🚀 Starting claim process for User ID:')) {
          const userIdMatch = output.match(/User ID: (\d+)/);
          if (userIdMatch) {
            progress.currentUser = userIdMatch[1];
            progress.userProgress.push({
              userId: userIdMatch[1],
              status: 'starting',
              startTime: new Date(),
              steps: []
            });
          }
        } else if (output.includes('🌐 Navigating to Daily Reward section')) {
          const currentUserProgress = progress.userProgress[progress.userProgress.length - 1];
          if (currentUserProgress && !currentUserProgress.steps.some((step: any) => step.step === 'navigating')) {
            currentUserProgress.steps.push({ step: 'navigating', timestamp: new Date() });
          }
        } else if (output.includes('✅ Login modal appeared')) {
          const currentUserProgress = progress.userProgress[progress.userProgress.length - 1];
          if (currentUserProgress && !currentUserProgress.steps.some((step: any) => step.step === 'login_modal')) {
            currentUserProgress.steps.push({ step: 'login_modal', timestamp: new Date() });
          }
        } else if (output.includes('✅ Successfully loaded Daily Reward page')) {
          const currentUserProgress = progress.userProgress[progress.userProgress.length - 1];
          if (currentUserProgress && !currentUserProgress.steps.some((step: any) => step.step === 'logged_in')) {
            currentUserProgress.steps.push({ step: 'logged_in', timestamp: new Date() });
            // Mark as in progress once they're logged in
            if (currentUserProgress.status === 'starting') {
              currentUserProgress.status = 'in_progress';
            }
          }
        } else if (output.includes('✅ Entered User ID:')) {
          const currentUserProgress = progress.userProgress[progress.userProgress.length - 1];
          if (currentUserProgress && !currentUserProgress.steps.some((step: any) => step.step === 'entering_id')) {
            currentUserProgress.steps.push({ step: 'entering_id', timestamp: new Date() });
          }
        } else if (output.includes('✅ Clicked') && output.includes('Go button')) {
          const currentUserProgress = progress.userProgress[progress.userProgress.length - 1];
          if (currentUserProgress && !currentUserProgress.steps.some((step: any) => step.step === 'go_clicked')) {
            currentUserProgress.steps.push({ step: 'go_clicked', timestamp: new Date() });
          }
        } else if (output.includes('✅ Successfully clicked FREE button')) {
          const currentUserProgress = progress.userProgress[progress.userProgress.length - 1];
          if (currentUserProgress) {
            // Allow multiple FREE button clicks (multiple items can be claimed)
            currentUserProgress.steps.push({ step: 'item_claimed', timestamp: new Date() });
          }
        } else if (output.includes('⚠️ Button text changed to') && output.includes('already claimed')) {
          const currentUserProgress = progress.userProgress[progress.userProgress.length - 1];
          if (currentUserProgress) {
            // Allow multiple already-claimed items
            currentUserProgress.steps.push({ step: 'item_already_claimed', timestamp: new Date() });
          }
        } else if (output.includes('✅ Claim process completed for user:')) {
          const userIdMatch = output.match(/Claim process completed for user: (\d+)/);
          if (userIdMatch) {
            const completedUserId = userIdMatch[1];
            
            // Find the user progress entry for this specific user
            const userProgressEntry = progress.userProgress.find((up: any) => up.userId === completedUserId);
            if (userProgressEntry && userProgressEntry.status !== 'completed') {
              userProgressEntry.status = 'completed';
              userProgressEntry.steps.push({ step: 'completed', timestamp: new Date() });
              progress.completedUsers++;
              
              // Update currentUser to show the next active user or processing status
              const activeUsers = progress.userProgress.filter((up: any) => up.status === 'starting' || up.status === 'in_progress');
              if (activeUsers.length > 0) {
                // Show the first active user
                progress.currentUser = activeUsers[0].userId;
              } else {
                // Check if there are more users to process
                const totalProcessed = progress.userProgress.length;
                if (totalProcessed < progress.totalUsers) {
                  progress.currentUser = 'Processing next user...';
                } else {
                  progress.currentUser = 'All users processed';
                }
              }
            }
          }
        } else if (output.includes('⚠️ Failed to send Discord confirmation') || output.includes('Error claiming')) {
          // Find the most recent user progress entry that's not completed
          const currentUserProgress = progress.userProgress[progress.userProgress.length - 1];
          if (currentUserProgress && currentUserProgress.status !== 'failed') {
            currentUserProgress.status = 'failed';
            currentUserProgress.steps.push({ step: 'failed', timestamp: new Date() });
            progress.failedUsers++;
            
            // Update currentUser to show the next active user or processing status
            const activeUsers = progress.userProgress.filter((up: any) => up.status === 'starting' || up.status === 'in_progress');
            if (activeUsers.length > 0) {
              // Show the first active user
              progress.currentUser = activeUsers[0].userId;
            } else {
              // Check if there are more users to process
              const totalProcessed = progress.userProgress.length;
              if (totalProcessed < progress.totalUsers) {
                progress.currentUser = 'Processing next user...';
              } else {
                progress.currentUser = 'All users processed';
              }
            }
          }
        } else if (output.includes('📊 Found') && output.includes('users in database')) {
          const userCountMatch = output.match(/Found (\d+) users/);
          if (userCountMatch) {
            progress.totalUsers = parseInt(userCountMatch[1]);
          }
        }

        claimProgress.set(processId, progress);
      }
    });

    claimProcess.stderr.on('data', (data: Buffer) => {
      const error = data.toString().trim();
      logger.error('Claim process error', {
        action: 'claim_process_error',
        error,
        pid: claimProcess.pid
      });

      const progress = claimProgress.get(processId);
      if (progress) {
        progress.logs.push({
          timestamp: new Date(),
          message: error,
          type: 'error'
        });
        claimProgress.set(processId, progress);
      }
    });

    claimProcess.on('close', (code: number | null) => {
      logger.info('Claim process completed', {
        action: 'claim_process_completed',
        exitCode: code,
        pid: claimProcess.pid
      });

      const progress = claimProgress.get(processId);
      if (progress) {
        progress.status = 'completed';
        progress.endTime = new Date();
        progress.exitCode = code;
        claimProgress.set(processId, progress);
      }
    });

    // Detach the process so it runs independently
    claimProcess.unref();

    logger.info('Manual claim process started', {
      action: 'manual_claim_started',
      pid: claimProcess.pid,
      adminId: (req.user as any)?.id
    });

    res.json({
      message: 'Manual claim process started',
      pid: claimProcess.pid,
      processId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to trigger manual claim', {
      action: 'admin_manual_claim_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      adminId: (req.user as any)?.id
    });

    res.status(500).json({
      error: 'Failed to trigger manual claim'
    });
  }
});

// Get claim progress
router.get('/claim-progress/:processId', async (req, res) => {
  try {
    const { processId } = req.params;
    const progress = claimProgress.get(processId);
    
    if (!progress) {
      return res.status(404).json({
        error: 'Process not found'
      });
    }

    return res.json(progress);
  } catch (error) {
    logger.error('Failed to get claim progress', {
      action: 'get_claim_progress_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return res.status(500).json({
      error: 'Failed to get claim progress'
    });
  }
});

// Clear old progress data (older than 1 hour)
router.delete('/claim-progress/cleanup', async (req, res) => {
  try {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    let cleanedCount = 0;
    
    for (const [processId, progress] of claimProgress.entries()) {
      if (progress.startTime && progress.startTime.getTime() < oneHourAgo) {
        claimProgress.delete(processId);
        cleanedCount++;
      }
    }

    return res.json({ 
      message: `Cleaned up ${cleanedCount} old progress entries`,
      remainingProcesses: claimProgress.size 
    });
  } catch (error) {
    logger.error('Failed to cleanup progress data', {
      action: 'cleanup_progress_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return res.status(500).json({
      error: 'Failed to cleanup progress data'
    });
  }
});

// Get all active claim processes
router.get('/claim-progress', async (req, res) => {
  try {
    const allProgress = Array.from(claimProgress.entries()).map(([processId, progress]) => ({
      processId,
      ...progress
    }));

    return res.json(allProgress);
  } catch (error) {
    logger.error('Failed to get all claim progress', {
      action: 'get_all_claim_progress_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return res.status(500).json({
      error: 'Failed to get claim progress'
    });
  }
});

// Get claim totals for different timeframes
router.get('/claim-totals', async (req, res) => {
  try {
    const timeframes = ['7d', '14d', '28d'];
    const totals: any = {};

    for (const timeframe of timeframes) {
      const days = timeframe === '7d' ? 7 : timeframe === '14d' ? 14 : 28;
      const stats = await dbService.getClaimStats(days);
      totals[timeframe] = stats;
    }

    res.json(totals);

  } catch (error) {
    logger.error('Failed to retrieve claim totals', {
      action: 'admin_claim_totals_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      adminId: (req.user as any)?.id
    });

    res.status(500).json({
      error: 'Failed to retrieve claim totals'
    });
  }
});

// Search functionality
router.get('/search', async (req, res): Promise<void> => {
  try {
    const query = req.query.q as string || req.query.query as string;
    const type = req.query.type as string || 'all';

    if (!query) {
      res.status(400).json({
        error: 'Search query is required'
      });
      return;
    }

    const results: any = {};

    if (type === 'all' || type === 'registrations') {
      // Get all registrations and filter in memory for PostgreSQL compatibility
      const allRegistrations = await dbService.findRegistrations();
      const registrations = allRegistrations.filter(reg => 
        reg.eightBallPoolId.includes(query) || 
        reg.username.toLowerCase().includes(query.toLowerCase())
      );

      results.registrations = registrations;
    }

    if (type === 'all' || type === 'claims') {
      // Get all claims and filter in memory for PostgreSQL compatibility
      const allClaims = await dbService.findClaimRecords();
      const claims = allClaims.filter(claim => 
        claim.eightBallPoolId.includes(query) ||
        (claim.itemsClaimed && claim.itemsClaimed.some((item: string) => 
          item.toLowerCase().includes(query.toLowerCase())
        ))
      );

      results.claims = claims;
    }

    if (type === 'all' || type === 'logs') {
      // Logs functionality disabled for PostgreSQL migration
      results.logs = [];
    }

    res.json({
      query,
      type,
      results
    });

  } catch (error) {
    logger.error('Admin search failed', {
      action: 'admin_search_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      adminId: (req.user as any)?.id,
      query: req.query.q
    });

    res.status(500).json({
      error: 'Search failed'
    });
  }
});

// Toggle notifications (placeholder)
router.post('/notifications/toggle', async (req, res) => {
  try {
    const { enabled } = req.body;

    logger.logAdminAction((req.user as any)?.id, 'toggle_notifications', {
      enabled,
      timestamp: new Date().toISOString()
    });

    res.json({
      message: 'Notification settings updated',
      enabled,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to toggle notifications', {
      action: 'admin_toggle_notifications_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      adminId: (req.user as any)?.id
    });

    res.status(500).json({
      error: 'Failed to update notification settings'
    });
  }
});

// Block/Unblock user
router.post('/users/:eightBallPoolId/block', async (req, res): Promise<void> => {
  try {
    const { eightBallPoolId } = req.params;
    const { isBlocked, reason } = req.body;

    const registration = await dbService.findRegistration({ eightBallPoolId });
    
    if (!registration) {
      res.status(404).json({ error: 'Registration not found' });
      return;
    }

    await dbService.updateRegistration(eightBallPoolId, {
      isBlocked,
      blockedReason: isBlocked ? reason : undefined
    });

    if (isBlocked) {
      // Enhanced blocking with device tracking
      const deviceInfo = deviceDetectionService.extractDeviceInfo(req);
      const clientIP = req.ip || 
                       req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
                       req.headers['x-real-ip']?.toString() ||
                       req.headers['cf-connecting-ip']?.toString() ||
                       req.connection?.remoteAddress ||
                       req.socket?.remoteAddress ||
                       'Admin Dashboard';

      // Block all devices associated with this user
      const blockedDevices = await blockingService.blockUserByEightBallPoolId(
        eightBallPoolId,
        (req.user as any)?.id || 'admin',
        reason || 'Blocked by admin'
      );

      logger.info('User blocked with device tracking', {
        action: 'enhanced_user_blocked',
        eightBallPoolId,
        username: registration.username,
        blockedDevicesCount: blockedDevices.length,
        adminId: (req.user as any)?.id,
        reason
      });
    } else {
      // Unblock user (remove from blocked_devices table)
      const blockedDevices = await blockingService.getBlockedDevices(1000, 0);
      const userBlockedDevices = blockedDevices.filter(
        device => device.eightBallPoolId === eightBallPoolId && device.isActive
      );

      for (const blockedDevice of userBlockedDevices) {
        await blockingService.unblockDevice(blockedDevice.id, (req.user as any)?.id || 'admin');
      }

      logger.info('User unblocked with device tracking', {
        action: 'enhanced_user_unblocked',
        eightBallPoolId,
        username: registration.username,
        unblockedDevicesCount: userBlockedDevices.length,
        adminId: (req.user as any)?.id
      });
    }

    logger.logAdminAction((req.user as any)?.id, isBlocked ? 'block_user' : 'unblock_user', {
      eightBallPoolId,
      username: registration.username,
      reason
    });

    res.json({
      message: isBlocked ? 'User blocked successfully with device tracking' : 'User unblocked successfully',
      user: {
        eightBallPoolId: registration.eightBallPoolId,
        username: registration.username,
        isBlocked: registration.isBlocked,
        deviceId: registration.deviceId,
        deviceType: registration.deviceType,
        registrationIp: registration.registrationIp,
        blockedReason: registration.blockedReason
      }
    });

  } catch (error) {
    logger.error('Failed to block/unblock user', {
      action: 'admin_block_user_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      adminId: (req.user as any)?.id
    });

    res.status(500).json({
      error: 'Failed to block/unblock user'
    });
  }
});

// Get blocked devices
router.get('/blocked-devices', authenticateAdmin, async (req, res): Promise<void> => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const blockedDevices = await blockingService.getBlockedDevices(
      parseInt(limit as string),
      parseInt(offset as string)
    );
    
    const totalCount = await blockingService.getBlockedDevicesCount();
    
    res.json({
      blockedDevices,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit as string))
      }
    });
    
  } catch (error) {
    logger.error('Failed to get blocked devices', {
      action: 'get_blocked_devices_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      adminId: (req.user as any)?.id
    });
    
    res.status(500).json({
      error: 'Failed to get blocked devices'
    });
  }
});

// Unblock a specific device
router.post('/blocked-devices/:deviceId/unblock', authenticateAdmin, async (req, res): Promise<void> => {
  try {
    const { deviceId } = req.params;
    
    const success = await blockingService.unblockDevice(deviceId, (req.user as any)?.id || 'admin');
    
    if (success) {
      res.json({
        message: 'Device unblocked successfully'
      });
    } else {
      res.status(404).json({
        error: 'Blocked device not found'
      });
    }
    
  } catch (error) {
    logger.error('Failed to unblock device', {
      action: 'unblock_device_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      deviceId: req.params.deviceId,
      adminId: (req.user as any)?.id
    });
    
    res.status(500).json({
      error: 'Failed to unblock device'
    });
  }
});

// VPS Monitor Multi-Channel Authentication System
interface VPSCode {
  discordCode: string;
  telegramCode: string;
  emailCode: string;
  userEmail: string;
  userId: string;
  username: string;
  expiresAt: Date;
  discordMessageId?: string;
  telegramMessageId?: string;
  isUsed: boolean;
}

// In-memory storage for VPS codes (in production, use Redis or database)
// Key format: userId, Value: VPSCode object
const vpsCodes = new Map<string, VPSCode>();

// Clean up expired codes every minute
setInterval(() => {
  const now = new Date();
  for (const [userId, vpsCode] of vpsCodes.entries()) {
    if (vpsCode.expiresAt < now) {
      vpsCodes.delete(userId);
    }
  }
}, 60000);

// Generate 16-character random code
function generateVPSCode(): string {
  return crypto.randomBytes(8).toString('hex').toUpperCase();
}

// Generate 6-digit PIN for email
function generate6DigitPin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Check if user is allowed VPS access
function isAllowedForVPS(userId: string): boolean {
  const allowedAdmins = process.env.ALLOWED_VPS_ADMINS?.split(',').map(id => id.trim()) || [];
  return allowedAdmins.includes(userId);
}

// Check if user is allowed Telegram access (by Discord user ID)
function isAllowedForTelegram(discordUserId: string): boolean {
  const allowedVpsAdmins = process.env.ALLOWED_VPS_ADMINS?.split(',').map(id => id.trim()) || [];
  return allowedVpsAdmins.includes(discordUserId);
}

// Check if user's email is allowed for email authentication
function isAllowedForEmail(userEmail: string): boolean {
  if (!userEmail) return false;
  
  const allowedEmails = process.env.ADMIN_EMAILS?.split(',').map(email => email.trim().toLowerCase()) || [];
  if (allowedEmails.length === 0) return false; // No emails configured
  
  return allowedEmails.includes(userEmail.toLowerCase());
}

// Request VPS access codes (Discord or Telegram)
router.post('/vps/request-access', async (req, res) => {
  try {
    const user = req.user as any;
    const userId = user?.id;
    const username = user?.username;
    const { channel, email } = req.body; // 'discord', 'telegram', or undefined for both, plus optional email

    // Debug logging (can be removed in production)
    console.log('VPS request access debug:', {
      hasUser: !!user,
      userId,
      username,
      channel,
      userEmail: user?.email,
      providedEmail: email
    });

    // Check if user is authenticated
    if (!user || !userId) {
      return res.status(401).json({
        error: 'Authentication required. Please log in through Discord.'
      });
    }

    // Check if user is allowed VPS access
    if (!isAllowedForVPS(userId)) {
      return res.status(403).json({
        error: 'Access denied. You are not authorized to access VPS Monitor.'
      });
    }

    // Get or create codes for this user
    let vpsCode = vpsCodes.get(userId);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    if (!vpsCode) {
      // Generate new codes
      const discordCode = generateVPSCode();
      const telegramCode = generateVPSCode();
      const emailCode = generate6DigitPin();
      
      vpsCode = {
        discordCode,
        telegramCode,
        emailCode,
        userEmail: email || user.email || '', // Use provided email or Discord email
        userId,
        username,
        expiresAt,
        isUsed: false
      };
      
      vpsCodes.set(userId, vpsCode);
    } else {
      // Update expiration time and regenerate email code if requested
      vpsCode.expiresAt = expiresAt;
      if (!vpsCode.emailCode) {
        vpsCode.emailCode = generate6DigitPin();
      }
      if (!vpsCode.userEmail) {
        vpsCode.userEmail = user.email || '';
      }
    }

    let discordSent = false;
    let telegramSent = false;
    let emailSent = false;

    // Send Discord code if requested
    if (!channel || channel === 'discord') {
      try {
        const discordService = new DiscordNotificationService();
        const discordMessage = await discordService.sendDirectMessage(
          userId,
          `🔐 **VPS Monitor Access Code (Discord)**\n\n` +
          `Your Discord access code is: **${vpsCode.discordCode}**\n` +
          `This code expires in 5 minutes.\n\n` +
          `⚠️ **Security Notice**: This code is required for VPS Monitor access.`
        );

        discordSent = discordMessage !== null;
        
        // Store Discord message ID for cleanup
        if (discordMessage && discordMessage.id) {
          vpsCode.discordMessageId = discordMessage.id;
        }

      } catch (discordError) {
        console.error('Failed to send Discord DM:', discordError);
      }
    }

    // Send Telegram code if requested and allowed - only to the logged-in user
    if ((!channel || channel === 'telegram') && isAllowedForTelegram(userId) && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'your_telegram_bot_token_here') {
      try {
        const telegramService = new TelegramNotificationService();
        
        // Map Discord user ID to Telegram user ID for the logged-in user only
        // Read mapping from environment variable: DISCORD_TO_TELEGRAM_MAPPING=discord_id1:telegram_id1,discord_id2:telegram_id2
        const mappingEnv = process.env.DISCORD_TO_TELEGRAM_MAPPING || '';
        const userMapping: Record<string, string> = {};
        
        if (mappingEnv) {
          mappingEnv.split(',').forEach(mapping => {
            const [discordId, telegramId] = mapping.trim().split(':');
            if (discordId && telegramId) {
              userMapping[discordId] = telegramId;
            }
          });
        }
        
        const telegramUserId = userMapping[userId];
        
        if (telegramUserId) {
          const telegramMessage = await telegramService.sendDirectMessage(
            telegramUserId,
            `🔐 *VPS Monitor Access Code (Telegram)*\n\n` +
            `Your Telegram access code is: *${vpsCode.telegramCode}*\n` +
            `This code expires in 5 minutes.\n\n` +
            `⚠️ *Security Notice*: This code is required for VPS Monitor access.`
          );

          telegramSent = telegramMessage !== null;
          
          // Store Telegram message ID for cleanup
          if (telegramMessage && telegramMessage.id) {
            vpsCode.telegramMessageId = telegramMessage.id;
          }
        } else {
          logger.warn('No Telegram mapping found for Discord user', {
            action: 'telegram_mapping_not_found',
            userId,
            username
          });
        }

      } catch (telegramError) {
        console.error('Failed to send Telegram DM:', telegramError);
        logger.warn('Telegram bot not working', {
          action: 'telegram_error',
          userId,
          username,
          error: telegramError instanceof Error ? telegramError.message : 'Unknown error'
        });
      }
    } else if (!channel || channel === 'telegram') {
      logger.warn('User not allowed for Telegram access or bot not configured', {
        action: 'telegram_access_denied',
        userId,
        username,
        reason: !isAllowedForTelegram(userId) ? 'user_not_allowed' : 'bot_not_configured'
      });
    }

    // Send Email code if requested
    if ((!channel || channel === 'email') && vpsCode.userEmail) {
      // Check if user's email is in the allowed list
      if (!isAllowedForEmail(vpsCode.userEmail)) {
        logger.warn('Email not in ADMIN_EMAILS whitelist', {
          action: 'email_not_whitelisted',
          userId,
          username,
          email: vpsCode.userEmail
        });
        
        if (channel === 'email') {
          return res.status(403).json({
            error: 'Your email is not authorized for email authentication. Please contact an administrator or use Discord/Telegram authentication.'
          });
        }
      } else {
        try {
          const emailService = new EmailNotificationService();
          
          if (emailService.isConfigured()) {
            emailSent = await emailService.sendPinCode(
              vpsCode.userEmail,
              vpsCode.emailCode,
              'VPS Monitor Access'
            );
            
            if (emailSent) {
              logger.info('VPS access email code sent', {
                action: 'vps_email_sent',
                userId,
                username,
                email: vpsCode.userEmail
              });
            }
          } else {
            logger.warn('Email service not configured', {
              action: 'email_not_configured',
              userId,
              username
            });
          }
        } catch (emailError) {
          console.error('Failed to send email:', emailError);
          logger.warn('Email sending failed', {
            action: 'email_error',
            userId,
            username,
            error: emailError instanceof Error ? emailError.message : 'Unknown error'
          });
        }
      }
    }

    // Check if the requested channel succeeded
    if (channel === 'discord' && !discordSent) {
      return res.status(500).json({
        error: 'Failed to send Discord access code. Please try again.'
      });
    }
    
    if (channel === 'telegram' && !telegramSent) {
      return res.status(500).json({
        error: 'Failed to send Telegram access code. Please try again.'
      });
    }
    
    if (channel === 'email' && !emailSent) {
      return res.status(500).json({
        error: 'Failed to send email access code. Please check your email configuration.'
      });
    }

    logger.logAdminAction(userId, 'vps_access_requested', {
      username,
      channel: channel || 'all',
      discordCodeGenerated: discordSent,
      telegramCodeGenerated: telegramSent,
      emailCodeGenerated: emailSent
    });

    return res.json({
      message: channel === 'discord' ? 'Discord access code sent!' : 
               channel === 'telegram' ? 'Telegram access code sent!' : 
               channel === 'email' ? 'Email access code sent!' :
               `Access codes sent to: ${[discordSent && 'Discord', telegramSent && 'Telegram', emailSent && 'Email'].filter(Boolean).join(', ')}`,
      discordSent,
      telegramSent,
      emailSent,
      userEmail: vpsCode.userEmail || null,
      expiresIn: 5 * 60 * 1000 // 5 minutes in milliseconds
    });

  } catch (error) {
    console.error('VPS access request error:', error);
    return res.status(500).json({
      error: 'Failed to process access request'
    });
  }
});

// Verify VPS access codes (Discord + Telegram OR Email)
router.post('/vps/verify-access', async (req, res) => {
  try {
    const { discordCode, telegramCode, emailCode } = req.body;
    const user = req.user as any;
    const userId = user.id;

    // User must provide either (Discord + Telegram) OR (Email)
    const hasDiscordTelegram = discordCode && (telegramCode || !isAllowedForTelegram(userId));
    const hasEmail = emailCode;

    if (!hasDiscordTelegram && !hasEmail) {
      return res.status(400).json({
        error: 'Please provide either Discord code (and Telegram if applicable) OR email code'
      });
    }

    // Find the codes for this user
    const vpsCode = vpsCodes.get(userId);
    
    if (!vpsCode) {
      return res.status(400).json({
        error: 'No access codes found. Please request access first.'
      });
    }

    // Check if codes are expired
    if (vpsCode.expiresAt < new Date()) {
      vpsCodes.delete(userId);
      return res.status(400).json({
        error: 'Access codes have expired. Please request new codes.'
      });
    }

    // Check if codes are already used
    if (vpsCode.isUsed) {
      return res.status(400).json({
        error: 'Access codes have already been used'
      });
    }

    let verificationMethod = '';

    // Verify Email code if provided
    if (hasEmail && !hasDiscordTelegram) {
      if (vpsCode.emailCode !== emailCode.trim()) {
        return res.status(400).json({
          error: 'Invalid email access code.'
        });
      }
      verificationMethod = 'email';
    }
    // Verify Discord + Telegram codes if provided
    else if (hasDiscordTelegram) {
      // Verify Discord code
      if (vpsCode.discordCode !== discordCode.toUpperCase()) {
        return res.status(400).json({
          error: 'Invalid Discord access code.'
        });
      }

      // Verify Telegram code (only if user is allowed for Telegram)
      if (isAllowedForTelegram(userId)) {
        if (vpsCode.telegramCode !== telegramCode.toUpperCase()) {
          return res.status(400).json({
            error: 'Invalid Telegram access code.'
          });
        }
        verificationMethod = 'discord+telegram';
      } else {
        // If user is not allowed for Telegram, they should not have a Telegram code
        if (telegramCode && telegramCode.trim()) {
          return res.status(400).json({
            error: 'You are not authorized to use Telegram authentication.'
          });
        }
        verificationMethod = 'discord';
      }
    }

    // Mark codes as used
    vpsCode.isUsed = true;

    // Send approval messages and schedule cleanup
    try {
      // Send approval based on verification method
      if (verificationMethod === 'email') {
        // Send email approval
        const emailService = new EmailNotificationService();
        if (emailService.isConfigured() && vpsCode.userEmail) {
          await emailService.sendPinCode(
            vpsCode.userEmail,
            '✅ ACCESS GRANTED',
            'VPS Monitor Access Approved'
          );
        }

        logger.logAdminAction(userId, 'vps_access_granted', {
          username: vpsCode.username,
          verificationMethod: 'email',
          emailUsed: vpsCode.userEmail
        });
      } else {
        // Send Discord/Telegram approval messages
        const discordService = new DiscordNotificationService();
        const telegramService = new TelegramNotificationService();
        
        // Delete the original code messages
        if (vpsCode.discordMessageId) {
          try {
            await discordService.deleteMessage(userId, vpsCode.discordMessageId);
          } catch (deleteError) {
            console.error('Failed to delete Discord code message:', deleteError);
          }
        }

        if (vpsCode.telegramMessageId) {
          try {
            await telegramService.deleteMessage(userId, vpsCode.telegramMessageId);
          } catch (deleteError) {
            console.error('Failed to delete Telegram code message:', deleteError);
          }
        }

        // Send approval messages
        const authMethod = verificationMethod === 'discord+telegram' ? 
          'Both Discord and Telegram codes verified successfully.' :
          'Discord code verified successfully.';
        
        const discordApproval = await discordService.sendDirectMessage(
          userId,
          `✅ **VPS Monitor Access Approved**\n\n` +
          `You now have access to the VPS Monitor for this session.\n` +
          `${authMethod}\n` +
          `This message will be automatically deleted in 24 hours.`
        );

        if (verificationMethod === 'discord+telegram') {
          const telegramApproval = await telegramService.sendDirectMessage(
            userId,
            `✅ *VPS Monitor Access Approved*\n\n` +
            `You now have access to the VPS Monitor for this session.\n` +
            `${authMethod}\n` +
            `This message will be automatically deleted in 24 hours.`
          );

          // Schedule approval message deletion after 24 hours
          if (telegramApproval && telegramApproval.id) {
            setTimeout(async () => {
              try {
                await telegramService.deleteMessage(userId, telegramApproval.id!);
              } catch (deleteError) {
                console.error('Failed to delete Telegram approval message:', deleteError);
              }
            }, 24 * 60 * 60 * 1000); // 24 hours
          }
        }

        // Schedule approval message deletion after 24 hours
        if (discordApproval && discordApproval.id) {
          setTimeout(async () => {
            try {
              await discordService.deleteMessage(userId, discordApproval.id!);
            } catch (deleteError) {
              console.error('Failed to delete Discord approval message:', deleteError);
            }
          }, 24 * 60 * 60 * 1000); // 24 hours
        }

        logger.logAdminAction(userId, 'vps_access_granted', {
          username: vpsCode.username,
          verificationMethod,
          discordCodeUsed: discordCode,
          telegramCodeUsed: telegramCode
        });
      }

      // Clean up the codes
      vpsCodes.delete(userId);

      return res.json({
        message: `Access granted - ${verificationMethod === 'email' ? 'email code' : 'codes'} verified successfully`,
        accessToken: crypto.randomBytes(32).toString('hex') // Simple session token
      });

    } catch (approvalError) {
      console.error('Failed to send approval messages:', approvalError);
      return res.status(500).json({
        error: 'Access granted but failed to send confirmation messages'
      });
    }

  } catch (error) {
    console.error('VPS access verification error:', error);
    return res.status(500).json({
      error: 'Failed to verify access codes'
    });
  }
});

// Check VPS access status
router.get('/vps/access-status', async (req, res) => {
  try {
    const user = req.user as any;
    const userId = user.id;

    // Check if user is allowed VPS access
    const isAllowed = isAllowedForVPS(userId);
    
    // Check if user has active codes
    const userVpsCode = vpsCodes.get(userId);
    const hasActiveCodes = userVpsCode && !userVpsCode.isUsed && userVpsCode.expiresAt > new Date();
    
    res.json({
      isAllowed,
      hasActiveCodes,
      dualChannelAuth: true
    });

  } catch (error) {
    console.error('VPS access status error:', error);
    res.status(500).json({
      error: 'Failed to check access status'
    });
  }
});

// Test Discord bot functionality (development only)
router.post('/vps/test-discord', async (req, res) => {
  try {
    const user = req.user as any;
    const userId = user.id;

    if (!isAllowedForVPS(userId)) {
      return res.status(403).json({
        error: 'Access denied. You are not authorized to access VPS Monitor.'
      });
    }

    // Test Discord DM
    const discordService = new DiscordNotificationService();
    const testMessage = `🧪 **Discord Bot Test**\n\nThis is a test message to verify the bot can send DMs.\n\nTime: ${new Date().toLocaleString()}`;
    
    const message = await discordService.sendDirectMessage(userId, testMessage);
    
    return res.json({
      success: true,
      message: 'Test message sent to your Discord DMs',
      messageId: message?.id || 'unknown'
    });

  } catch (error: any) {
    console.error('Discord bot test error:', error);
    return res.status(500).json({
      error: 'Failed to send test message',
      details: error.message
    });
  }
});

// Test Telegram bot functionality (development only)
router.post('/vps/test-telegram', async (req, res) => {
  try {
    const user = req.user as any;
    const userId = user.id;

    if (!isAllowedForVPS(userId)) {
      return res.status(403).json({
        error: 'Access denied. You are not authorized to access VPS Monitor.'
      });
    }

    // Test Telegram DM
    const telegramService = new TelegramNotificationService();
    const testMessage = `🧪 *Telegram Bot Test*\n\nThis is a test message to verify the bot can send DMs.\n\nTime: ${new Date().toLocaleString()}`;
    
    const message = await telegramService.sendDirectMessage(userId, testMessage);
    
    return res.json({
      success: true,
      message: 'Test message sent to your Telegram DMs',
      messageId: message?.id || 'unknown'
    });

  } catch (error: any) {
    console.error('Telegram bot test error:', error);
    return res.status(500).json({
      error: 'Failed to send test message',
      details: error.message
    });
  }
});

// Test email service functionality (development only)
router.post('/vps/test-email', async (req, res) => {
  try {
    const user = req.user as any;
    const userId = user.id;

    if (!isAllowedForVPS(userId)) {
      return res.status(403).json({
        error: 'Access denied. You are not authorized to access VPS Monitor.'
      });
    }

    // Test email service
    const emailService = new EmailNotificationService();
    
    return res.json({
      success: true,
      configured: emailService.isConfigured(),
      smtpHost: process.env.SMTP_HOST,
      smtpPort: process.env.SMTP_PORT,
      smtpUser: process.env.SMTP_USER,
      mailFrom: process.env.MAIL_FROM,
      hasPassword: !!process.env.SMTP_PASS
    });
    
  } catch (error: any) {
    logger.error('Email test error:', error);
    return res.status(500).json({
      error: 'Failed to test email service',
      details: error.message
    });
  }
});

// Debug environment variables (development only)
router.get('/debug/env', async (req, res) => {
  try {
    return res.json({
      success: true,
      smtpHost: process.env.SMTP_HOST,
      smtpPort: process.env.SMTP_PORT,
      smtpUser: process.env.SMTP_USER,
      mailFrom: process.env.MAIL_FROM,
      hasPassword: !!process.env.SMTP_PASS,
      nodeEnv: process.env.NODE_ENV,
      allEnvKeys: Object.keys(process.env).filter(key => key.includes('SMTP') || key.includes('MAIL'))
    });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Failed to get environment variables',
      details: error.message
    });
  }
});

// Request access to reset leaderboard (Discord or Telegram)
router.post('/reset-leaderboard/request-access', async (req, res) => {
  try {
    const user = req.user as any;
    const userId = user.id;
    const username = user.username;
    const { channel } = req.body; // 'discord', 'telegram', or undefined for both

    // Check if user is allowed VPS access
    if (!isAllowedForVPS(userId)) {
      return res.status(403).json({
        error: 'Access denied. You are not authorized to reset the leaderboard.'
      });
    }

    // Get or create codes for this user
    let resetCode = global.resetLeaderboardCodes?.get(userId);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    if (!resetCode) {
      // Generate new codes
      const discordCode = generateVPSCode();
      const telegramCode = generateVPSCode();
      const emailCode = generate6DigitPin();
      
      resetCode = {
        discordCode,
        telegramCode,
        emailCode,
        userEmail: user.email || '',
        userId,
        username,
        expiresAt,
        attempts: 0
      };
      
      if (!global.resetLeaderboardCodes) {
        global.resetLeaderboardCodes = new Map();
      }
      global.resetLeaderboardCodes.set(userId, resetCode);
    } else {
      // Update expiration time and regenerate email code if requested
      resetCode.expiresAt = expiresAt;
      if (!resetCode.emailCode) {
        resetCode.emailCode = generate6DigitPin();
      }
      if (!resetCode.userEmail) {
        resetCode.userEmail = user.email || '';
      }
    }

    let discordSent = false;
    let telegramSent = false;
    let emailSent = false;

    // Send Discord code if requested
    if (!channel || channel === 'discord') {
      try {
        const discordService = new DiscordNotificationService();
        const discordMessage = await discordService.sendDirectMessage(
          userId,
          `🔐 **Reset Leaderboard Access Code (Discord)**\n\n` +
          `Your Discord access code is: **${resetCode.discordCode}**\n` +
          `This code expires in 5 minutes.\n\n` +
          `⚠️ **Security Notice**: This code is required for leaderboard reset access.`
        );

        discordSent = discordMessage !== null;
        
        // Store Discord message ID for cleanup
        if (discordMessage && discordMessage.id) {
          resetCode.discordMessageId = discordMessage.id;
        }

      } catch (discordError) {
        console.error('Failed to send Discord DM:', discordError);
      }
    }

    // Send Telegram code if requested and allowed
    if ((!channel || channel === 'telegram') && isAllowedForTelegram(userId) && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'your_telegram_bot_token_here') {
      try {
        const telegramService = new TelegramNotificationService();
        // Use the Telegram user ID (7631397609) for sending messages
        const telegramUserId = '7631397609';
        
        const telegramMessage = await telegramService.sendDirectMessage(
          telegramUserId,
          `🔐 *Reset Leaderboard Access Code (Telegram)*\n\n` +
          `Your Telegram access code is: *${resetCode.telegramCode}*\n` +
          `This code expires in 5 minutes.\n\n` +
          `⚠️ *Security Notice*: This code is required for leaderboard reset access.`
        );

        telegramSent = telegramMessage !== null;
        
        // Store Telegram message ID for cleanup
        if (telegramMessage && telegramMessage.id) {
          resetCode.telegramMessageId = telegramMessage.id;
        }

      } catch (telegramError) {
        console.error('Failed to send Telegram DM:', telegramError);
        logger.warn('Telegram bot not working', {
          action: 'telegram_error',
          userId,
          username,
          error: telegramError instanceof Error ? telegramError.message : 'Unknown error'
        });
      }
    } else if (!channel || channel === 'telegram') {
      logger.warn('User not allowed for Telegram access or bot not configured', {
        action: 'telegram_access_denied',
        userId,
        username,
        reason: !isAllowedForTelegram(userId) ? 'user_not_allowed' : 'bot_not_configured'
      });
    }

    // Send Email code if requested
    if ((!channel || channel === 'email') && resetCode.userEmail) {
      // Check if user's email is in the allowed list
      if (!isAllowedForEmail(resetCode.userEmail)) {
        logger.warn('Email not in ADMIN_EMAILS whitelist for leaderboard reset', {
          action: 'email_not_whitelisted',
          userId,
          username,
          email: resetCode.userEmail
        });
        
        if (channel === 'email') {
          return res.status(403).json({
            error: 'Your email is not authorized for email authentication. Please contact an administrator or use Discord/Telegram authentication.'
          });
        }
      } else {
        try {
          const emailService = new EmailNotificationService();
          
          if (emailService.isConfigured()) {
            emailSent = await emailService.sendPinCode(
              resetCode.userEmail,
              resetCode.emailCode,
              'Leaderboard Reset Access'
            );
            
            if (emailSent) {
              logger.info('Leaderboard reset email code sent', {
                action: 'reset_leaderboard_email_sent',
                userId,
                username,
                email: resetCode.userEmail
              });
            }
          } else {
            logger.warn('Email service not configured', {
              action: 'email_not_configured',
              userId,
              username
            });
          }
        } catch (emailError) {
          console.error('Failed to send email:', emailError);
          logger.warn('Email sending failed', {
            action: 'email_error',
            userId,
            username,
            error: emailError instanceof Error ? emailError.message : 'Unknown error'
          });
        }
      }
    }

    // Check if the requested channel succeeded
    if (channel === 'discord' && !discordSent) {
      return res.status(500).json({
        error: 'Failed to send Discord access code. Please try again.'
      });
    }
    
    if (channel === 'telegram' && !telegramSent) {
      return res.status(500).json({
        error: 'Failed to send Telegram access code. Please try again.'
      });
    }
    
    if (channel === 'email' && !emailSent) {
      return res.status(500).json({
        error: 'Failed to send email access code. Please check your email configuration.'
      });
    }

    logger.logAdminAction(userId, 'reset_leaderboard_access_requested', {
      username,
      channel: channel || 'all',
      discordCodeGenerated: discordSent,
      telegramCodeGenerated: telegramSent,
      emailCodeGenerated: emailSent
    });

    return res.json({
      message: channel === 'discord' ? 'Discord access code sent!' : 
               channel === 'telegram' ? 'Telegram access code sent!' : 
               channel === 'email' ? 'Email access code sent!' :
               `Access codes sent to: ${[discordSent && 'Discord', telegramSent && 'Telegram', emailSent && 'Email'].filter(Boolean).join(', ')}`,
      discordSent,
      telegramSent,
      emailSent,
      userEmail: resetCode.userEmail || null,
      expiresIn: 5 * 60 * 1000 // 5 minutes in milliseconds
    });

  } catch (error) {
    console.error('Reset leaderboard access request error:', error);
    return res.status(500).json({
      error: 'Failed to process access request'
    });
  }
});

// Verify access codes for reset leaderboard
router.post('/reset-leaderboard/verify-access', async (req, res) => {
  try {
    const user = req.user as any;
    const userId = user.id;
    const username = user.username;
    const { discordCode, telegramCode } = req.body;

    if (!discordCode || typeof discordCode !== 'string') {
      return res.status(400).json({
        error: 'Discord verification code is required'
      });
    }

    // Check if user has a pending verification code
    if (!global.resetLeaderboardCodes || !global.resetLeaderboardCodes.has(userId)) {
      return res.status(400).json({
        error: 'No verification codes found. Please request access first.'
      });
    }

    const verificationData = global.resetLeaderboardCodes.get(userId);
    
    if (!verificationData) {
      return res.status(400).json({
        error: 'No verification codes found. Please request access first.'
      });
    }
    
    // Check if codes have expired
    if (new Date() > verificationData.expiresAt) {
      global.resetLeaderboardCodes.delete(userId);
      return res.status(400).json({
        error: 'Verification codes have expired. Please request new ones.'
      });
    }

    // Check attempt limit (max 3 attempts)
    if (verificationData.attempts >= 3) {
      global.resetLeaderboardCodes.delete(userId);
      return res.status(400).json({
        error: 'Too many failed attempts. Please request new verification codes.'
      });
    }

    // Verify Discord code
    if (discordCode !== verificationData.discordCode) {
      verificationData.attempts++;
      global.resetLeaderboardCodes.set(userId, verificationData);
      
      return res.status(400).json({
        error: 'Invalid Discord verification code',
        attemptsRemaining: 3 - verificationData.attempts
      });
    }

    // Check if Telegram verification is needed
    const needsTelegramCode = isAllowedForTelegram(userId) && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'your_telegram_bot_token_here';
    
    if (needsTelegramCode) {
      if (!telegramCode || typeof telegramCode !== 'string') {
        return res.status(400).json({
          error: 'Telegram verification code is required'
        });
      }

      if (telegramCode !== verificationData.telegramCode) {
        verificationData.attempts++;
        global.resetLeaderboardCodes.set(userId, verificationData);
        
        return res.status(400).json({
          error: 'Invalid Telegram verification code',
          attemptsRemaining: 3 - verificationData.attempts
        });
      }
    }

    // All codes are valid - delete the verification codes and grant access
    global.resetLeaderboardCodes.delete(userId);
    
    // Delete the original verification messages
    try {
      if (verificationData.discordMessageId) {
        const discordService = new DiscordNotificationService();
        await discordService.deleteMessage(userId, verificationData.discordMessageId);
      }
      
      if (verificationData.telegramMessageId) {
        const telegramService = new TelegramNotificationService();
        const telegramUserId = '7631397609'; // Use the Telegram user ID
        await telegramService.deleteMessage(telegramUserId, verificationData.telegramMessageId);
      }
    } catch (deleteError) {
      logger.warn('Failed to delete verification messages', {
        action: 'verification_message_delete_error',
        error: deleteError instanceof Error ? deleteError.message : 'Unknown error'
      });
    }
    
    // Send confirmation messages
    try {
      const discordService = new DiscordNotificationService();
      const confirmMessage = `✅ **Reset Leaderboard Access Granted**\n\n**Admin:** ${username}\n**Verified:** Discord${needsTelegramCode ? ' + Telegram' : ''}\n**Time:** ${new Date().toLocaleString()}\n\n🎉 You now have access to reset the leaderboard. This message will auto-delete in 24 hours.`;
      
      const confirmSentMessage = await discordService.sendDirectMessage(userId, confirmMessage);
      
      // Schedule auto-deletion of confirmation message after 24 hours
      if (confirmSentMessage?.id) {
        setTimeout(async () => {
          try {
            const discordService = new DiscordNotificationService();
            await discordService.deleteMessage(userId, confirmSentMessage.id);
          } catch (deleteError) {
            logger.warn('Failed to auto-delete confirmation message', {
              action: 'discord_auto_delete_error',
              error: deleteError instanceof Error ? deleteError.message : 'Unknown error'
            });
          }
        }, 24 * 60 * 60 * 1000); // 24 hours
      }
      
      if (needsTelegramCode) {
        const telegramService = new TelegramNotificationService();
        const telegramUserId = '7631397609';
        const telegramConfirmMessage = `✅ *Reset Leaderboard Access Granted*\n\n*Admin:* ${username}\n*Verified:* Discord + Telegram\n*Time:* ${new Date().toLocaleString()}\n\n🎉 You now have access to reset the leaderboard.`;
        await telegramService.sendDirectMessage(telegramUserId, telegramConfirmMessage);
      }
    } catch (confirmError) {
      logger.warn('Failed to send confirmation messages', {
        action: 'confirmation_message_error',
        error: confirmError instanceof Error ? confirmError.message : 'Unknown error'
      });
    }
    
    // Grant access for 10 minutes
    const accessExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    if (!global.resetLeaderboardAccess) {
      global.resetLeaderboardAccess = new Map();
    }
    global.resetLeaderboardAccess.set(userId, {
      grantedAt: new Date(),
      expiresAt: accessExpiresAt
    });

    logger.info(`Reset leaderboard access granted to admin ${user.username} (${userId})`);
    
    return res.json({
      success: true,
      message: 'Access granted successfully',
      expiresAt: accessExpiresAt.toISOString()
    });
    
  } catch (error: any) {
    logger.error('Reset leaderboard verification error:', error);
    return res.status(500).json({
      error: 'Failed to verify access code',
      details: error.message
    });
  }
});

// Check reset leaderboard access status
router.get('/reset-leaderboard/access-status', async (req, res) => {
  try {
    const user = req.user as any;
    const userId = user.id;

    // Check if user is allowed VPS access
    const isAllowed = isAllowedForVPS(userId);
    const hasActiveCode = global.resetLeaderboardCodes?.has(userId) || false;
    const dualChannelAuth = isAllowedForTelegram(userId) && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'your_telegram_bot_token_here';

    if (!isAllowed) {
      return res.status(403).json({
        error: 'Access denied. You are not authorized to reset the leaderboard.'
      });
    }

    if (!global.resetLeaderboardAccess || !global.resetLeaderboardAccess.has(userId)) {
      return res.json({
        isAllowed: true,
        hasActiveCode,
        dualChannelAuth,
        hasAccess: false,
        message: 'No access granted'
      });
    }

    const accessData = global.resetLeaderboardAccess.get(userId);
    
    if (!accessData) {
      return res.json({
        isAllowed: true,
        hasActiveCode,
        dualChannelAuth,
        hasAccess: false,
        message: 'No access granted'
      });
    }
    
    // Check if access has expired
    if (new Date() > accessData.expiresAt) {
      global.resetLeaderboardAccess.delete(userId);
      return res.json({
        isAllowed: true,
        hasActiveCode,
        dualChannelAuth,
        hasAccess: false,
        message: 'Access has expired'
      });
    }

    return res.json({
      isAllowed: true,
      hasActiveCode,
      dualChannelAuth,
      hasAccess: true,
      grantedAt: accessData.grantedAt.toISOString(),
      expiresAt: accessData.expiresAt.toISOString()
    });
    
  } catch (error: any) {
    logger.error('Reset leaderboard access status error:', error);
    return res.status(500).json({
      error: 'Failed to check access status'
    });
  }
});

// Reset leaderboard (clears all claim records while preserving registrations)
router.post('/reset-leaderboard', async (req, res) => {
  try {
    const user = req.user as any;
    const userId = user.id;

    // Check if user has valid access
    if (!global.resetLeaderboardAccess || !global.resetLeaderboardAccess.has(userId)) {
      return res.status(403).json({
        error: 'Access denied. Please request access first.'
      });
    }

    const accessData = global.resetLeaderboardAccess.get(userId);
    
    if (!accessData) {
      return res.status(403).json({
        error: 'Access denied. Please request access first.'
      });
    }
    
    // Check if access has expired
    if (new Date() > accessData.expiresAt) {
      global.resetLeaderboardAccess.delete(userId);
      return res.status(403).json({
        error: 'Access has expired. Please request access again.'
      });
    }

    // Remove access after use
    global.resetLeaderboardAccess.delete(userId);
    
    logger.info(`Admin ${user.username} (${user.id}) initiated leaderboard reset`);
    
    // Get current statistics before reset
    const totalClaimRecords = await dbService.findClaimRecords();
    const totalUsers = await dbService.findRegistrations();
    
    // Create backup directory if it doesn't exist
    const backupDir = path.join(process.cwd(), 'database-backups');
    const fs = require('fs');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Create timestamp for backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Backup claim records before deletion
    const claimRecords = await dbService.findClaimRecords();
    const backupFile = path.join(backupDir, `claim-records-backup-${timestamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalRecords: claimRecords.length,
      totalUsers: totalUsers,
      records: claimRecords
    }, null, 2));
    
    // Delete all claim records
    const deleteResult = await dbService.deleteAllClaimRecords();
    
    // Create reset report
    const resetReport = {
      timestamp: new Date().toISOString(),
      adminUser: {
        username: user.username,
        id: user.id
      },
      resetStats: {
        claimRecordsDeleted: deleteResult,
        usersPreserved: totalUsers.length,
        backupFile: backupFile
      }
    };
    
    const reportFile = path.join(process.cwd(), 'leaderboard-reset-report.json');
    fs.writeFileSync(reportFile, JSON.stringify(resetReport, null, 2));
    
    logger.info(`Leaderboard reset completed: ${deleteResult} claim records deleted, ${totalUsers.length} users preserved`);
    
    // Send Discord notification
    const discordService = new DiscordNotificationService();
    const resetMessage = `🔄 **Leaderboard Reset**\n\n**Admin:** ${user.username}\n**Records Deleted:** ${deleteResult}\n**Users Preserved:** ${totalUsers.length}\n**Backup Created:** ${backupFile}\n\nTime: ${new Date().toLocaleString()}`;
    
    try {
      await discordService.sendToChannel(process.env.SCHEDULER_CHANNEL_ID!, resetMessage);
    } catch (discordError) {
      logger.warn('Failed to send Discord notification for leaderboard reset', {
        action: 'discord_reset_notification_error',
        error: discordError instanceof Error ? discordError.message : 'Unknown error'
      });
    }
    
    return res.json({
      success: true,
      message: 'Leaderboard reset successfully',
      stats: {
        claimRecordsDeleted: deleteResult,
        usersPreserved: totalUsers.length,
        backupFile: backupFile,
        reportFile: reportFile
      }
    });
    
  } catch (error: any) {
    logger.error('Leaderboard reset error:', error);
    return res.status(500).json({
      error: 'Failed to reset leaderboard',
      details: error.message
    });
  }
});

// Bot Status Management Endpoints

// Get current bot status (admin endpoint - requires auth)
router.get('/bot-status', async (req, res) => {
  try {
    // Make a request to the Discord bot service to get current status
    const botServiceUrl = 'http://localhost:2700'; // Use localhost for hybrid mode
    
    try {
      const response = await axios.get(`${botServiceUrl}/api/bot-status`, {
        timeout: 5000
      });
      
      return res.json({
        success: true,
        data: response.data
      });
    } catch (botError) {
      // If bot service is not available, return basic info
      return res.json({
        success: true,
        data: {
          botReady: false,
          error: 'Discord bot service not available',
          currentStatus: 'unknown',
          environmentStatus: process.env.DISCORD_BOT_STATUS || 'dnd'
        }
      });
    }
    
  } catch (error: any) {
    logger.error('Error getting bot status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get bot status',
      details: error.message
    });
  }
});

// Change bot status
router.post('/bot-status', async (req, res) => {
  try {
    const { status } = req.body;
    const user = req.user as any;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }
    
    // Validate status
    const validStatuses = ['online', 'idle', 'dnd', 'invisible'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be: online, idle, dnd, or invisible'
      });
    }
    
    // Make a request to the Discord bot service to change status
    const botServiceUrl = 'http://localhost:2700'; // Use localhost for hybrid mode
    
    try {
      const response = await axios.post(`${botServiceUrl}/api/bot-status`, {
        status: status
      }, {
        timeout: 10000
      });
      
      logger.info(`Bot status changed to ${status} by admin ${user.username}`, {
        action: 'bot_status_change',
        adminUser: user.username,
        newStatus: status,
        result: response.data
      });
      
      return res.json({
        success: true,
        message: `Bot status changed to ${status.toUpperCase()}`,
        data: response.data
      });
      
    } catch (botError: any) {
      logger.error('Error changing bot status:', botError);
      return res.status(500).json({
        success: false,
        error: 'Failed to change bot status',
        details: botError.response?.data?.error || botError.message
      });
    }
    
  } catch (error: any) {
    logger.error('Error in bot status change endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to change bot status',
      details: error.message
    });
  }
});

// Bot toggle endpoint (enable/disable bot)
router.post('/bot-toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled field must be a boolean'
      });
    }

    // Make a request to the Discord bot service to toggle bot
    const botServiceUrl = process.env.DISCORD_BOT_SERVICE_URL || 'http://discord-bot:2700';
    
    try {
      const response = await axios.post(`${botServiceUrl}/api/bot-toggle`, {
        enabled: enabled
      }, {
        timeout: 5000
      });
      
      return res.json({
        success: true,
        data: response.data,
        message: `Bot ${enabled ? 'enabled' : 'disabled'} successfully`
      });
      
    } catch (botError: any) {
      logger.error('Error toggling bot:', {
        message: botError.message,
        status: botError.response?.status,
        statusText: botError.response?.statusText,
        data: botError.response?.data
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to toggle bot',
        details: botError.response?.data?.error || botError.message
      });
    }
    
  } catch (error: any) {
    logger.error('Error in bot toggle endpoint:', {
      message: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to toggle bot',
      details: error.message
    });
  }
});


import activeServicesRouter from './admin-active-services';

// Use the active services router
router.use('/', activeServicesRouter);

export default router;




