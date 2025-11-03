import * as express from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { logger } from '../services/LoggerService';
import DiscordNotificationService from '../services/DiscordNotificationService';
import ValidationService from '../services/ValidationService';
import { validateRegistration } from '../middleware/auth';
import { exec } from 'child_process';
import * as path from 'path';
import { DeviceDetectionService } from '../services/DeviceDetectionService';
import { checkDeviceBlocking, logDeviceInfo } from '../middleware/deviceBlocking';

const router = express.Router();
const dbService = DatabaseService.getInstance();
const deviceDetectionService = DeviceDetectionService.getInstance();
const validationService = new ValidationService();

// Register a new user
router.post('/', checkDeviceBlocking, logDeviceInfo, validateRegistration, async (req, res): Promise<void> => {
  try {
    const { eightBallPoolId, username } = req.body;

    // Check if user already exists
    const existingUser = await dbService.findRegistration({ eightBallPoolId });
    
    if (existingUser) {
      // If user exists but username is just the ID (from migration), update it
      const needsUsernameUpdate = existingUser.username === eightBallPoolId && username && username !== eightBallPoolId;
      
      if (needsUsernameUpdate) {
        logger.info('Updating username for existing user', {
          action: 'username_update',
          eightBallPoolId,
          oldUsername: existingUser.username,
          newUsername: username
        });
        
        // Update the username
        await dbService.updateRegistration(eightBallPoolId, { username });
        
        res.status(200).json({
          message: 'Username updated successfully',
          user: {
            eightBallPoolId: existingUser.eightBallPoolId,
            username: username,
            createdAt: existingUser.createdAt
          }
        });
        return;
      }
      
      logger.warn('Registration attempt with existing 8BP ID', {
        action: 'registration_duplicate',
        eightBallPoolId,
        username
      });
      
      res.status(409).json({
        error: 'User with this 8 Ball Pool ID is already registered',
        eightBallPoolId,
        existingUsername: existingUser.username
      });
      return;
    }

        // Extract client IP with better proxy handling
        logger.info('🔍 IP Detection Debug - Starting IP detection for user:', { username });
        
        // Get IP from various sources
        const reqIp = req.ip;
        const xForwardedFor = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim();
        const xRealIp = req.headers['x-real-ip']?.toString();
        const cfConnectingIp = req.headers['cf-connecting-ip']?.toString();
        const connectionRemoteAddress = req.connection?.remoteAddress;
        const socketRemoteAddress = req.socket?.remoteAddress;
        
        logger.info('🔍 IP Detection Debug - All IP sources:', {
          reqIp,
          xForwardedFor,
          xRealIp,
          cfConnectingIp,
          connectionRemoteAddress,
          socketRemoteAddress
        });
        
        const clientIP = reqIp || xForwardedFor || xRealIp || cfConnectingIp || connectionRemoteAddress || socketRemoteAddress || 'unknown';
        
        logger.info('🔍 IP Detection Debug - Final clientIP:', { clientIP });

    // Extract device information
    const deviceInfo = deviceDetectionService.extractDeviceInfo(req);
    
    logger.info('Device detection completed', {
      action: 'device_detection',
      eightBallPoolId,
      username,
      deviceId: deviceInfo.deviceId.substring(0, 8) + '...', // Log partial ID for privacy
      deviceType: deviceInfo.deviceType,
      platform: deviceInfo.platform,
      browser: deviceInfo.browser
    });

    // Create new registration with device information
    const registration = await dbService.createRegistration({
      eightBallPoolId,
      username,
      registrationIp: clientIP,
      deviceId: deviceInfo.deviceId,
      deviceType: deviceInfo.deviceType,
      userAgent: deviceInfo.userAgent,
      lastLoginAt: new Date(),
      isBlocked: false
    });

    logger.logRegistration(eightBallPoolId, username, clientIP);

    // Send Discord notification for new registration
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

    // Trigger validation for this new user (Stage 1: Validation)
    // If validation passes, it will automatically trigger first-time claim (Stage 2)
    logger.info('Triggering registration validation for new user', {
      action: 'registration_validation_trigger',
      eightBallPoolId,
      username
    });
    
    // Trigger registration validation in background
    // Run in background (don't await - let it run async)
    (async () => {
      try {
        logger.info('🚀 ASYNC VALIDATION STARTED', { eightBallPoolId, username });
        
        // Use spawn with better error handling
        const { spawn } = require('child_process');
        
        // Resolve script path - works in both dev and Docker
        // In dev: backend/src/scripts/registration-validation.ts
        // In Docker compiled: dist/backend/backend/src/scripts/registration-validation.ts
        // Try multiple possible locations
        const possiblePaths = [
          path.join(process.cwd(), 'backend/src/scripts/registration-validation.ts'),
          path.join(process.cwd(), 'dist/backend/backend/src/scripts/registration-validation.ts'),
          path.join(__dirname, '../scripts/registration-validation.ts'),
          path.join(__dirname, '../../backend/src/scripts/registration-validation.ts'),
          path.resolve(__dirname, '../../backend/src/scripts/registration-validation.ts')
        ];
        
        let validationScript: string | null = null;
        const fs = require('fs');
        for (const scriptPath of possiblePaths) {
          try {
            if (fs.existsSync(scriptPath)) {
              validationScript = scriptPath;
              break;
            }
          } catch (e) {
            // Continue to next path
          }
        }
        
        if (!validationScript) {
          logger.error('Registration validation script not found', {
            action: 'validation_script_not_found',
            eightBallPoolId,
            username,
            triedPaths: possiblePaths
          });
          return;
        }
        
        logger.info('Running registration validation script', { 
          eightBallPoolId, 
          username, 
          script: validationScript,
          cwd: process.cwd()
        });
        
        // Determine if tsx is available (dev) or use node with compiled JS
        // Check if script is .ts (needs tsx) or .js (can use node)
        // validationScript is guaranteed non-null after the check above
        const isTypeScript = validationScript.endsWith('.ts');
        const command = isTypeScript ? 'npx' : 'node';
        const args = isTypeScript 
          ? ['tsx', validationScript, eightBallPoolId, username]
          : [validationScript, eightBallPoolId, username];
        
        const validationProcess = spawn(command, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: process.cwd(),
          detached: false,
          env: {
            ...process.env,
            NODE_ENV: process.env.NODE_ENV || 'production'
          }
        });
        
        // Set a timeout to kill the process if it hangs
        const timeout = setTimeout(() => {
          logger.warn('Validation process timeout - killing process', { eightBallPoolId, username });
          validationProcess.kill('SIGKILL');
        }, 300000); // 5 minutes timeout
        
        let stdout = '';
        let stderr = '';
        
        validationProcess.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
          // Log progress in real-time
          const lines = data.toString().split('\n').filter(line => line.trim());
          lines.forEach(line => {
            if (line.includes('[VALIDATION]') || line.includes('[STAGE_2]') || line.includes('✅') || line.includes('❌')) {
              logger.info('Validation progress', { 
                eightBallPoolId, 
                username, 
                progress: line.trim() 
              });
            }
          });
        });
        
        validationProcess.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
          logger.warn('Validation stderr', { 
            eightBallPoolId, 
            username, 
            stderr: data.toString().trim() 
          });
        });
        
        validationProcess.on('close', (code: number | null) => {
          clearTimeout(timeout);
          if (code === 0) {
            logger.info('Registration validation completed successfully', {
              action: 'validation_completed',
              eightBallPoolId,
              username,
              stdout: stdout.substring(0, 1000),
              stderr: stderr.substring(0, 500)
            });
          } else {
            logger.error('Registration validation failed', {
              action: 'validation_error',
              eightBallPoolId,
              username,
              exitCode: code,
              stdout: stdout.substring(0, 1000),
              stderr: stderr.substring(0, 500)
            });
          }
        });
        
        validationProcess.on('error', (error: Error) => {
          clearTimeout(timeout);
          logger.error('Validation process error', {
            action: 'validation_process_error',
            eightBallPoolId,
            username,
            error: error.message
          });
        });
        
      } catch (error) {
        logger.error('Registration validation error', {
          action: 'validation_error',
          eightBallPoolId,
          username,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    })();

    res.status(201).json({
      message: 'Registration successful',
      user: {
        eightBallPoolId: registration.eightBallPoolId,
        username: registration.username,
        createdAt: registration.createdAt
      },
      firstClaim: 'Triggered - rewards will be claimed in the background'
    });

  } catch (error) {
    logger.error('Registration failed', {
      action: 'registration_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip
    });

    res.status(500).json({
      error: 'Registration failed. Please try again.'
    });
  }
});

// Get all registrations (for admin use)
router.get('/', async (req, res) => {
  try {
    const registrations = await dbService.findRegistrations();
    
    res.json({
      count: registrations.length,
      registrations: registrations.map((reg: any) => ({
        eightBallPoolId: reg.eightBallPoolId,
        username: reg.username,
        createdAt: reg.createdAt,
        updatedAt: reg.updatedAt
      }))
    });

  } catch (error) {
    logger.error('Failed to retrieve registrations', {
      action: 'get_registrations_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Failed to retrieve registrations'
    });
  }
});

// Get registration by 8BP ID
router.get('/:eightBallPoolId', async (req, res): Promise<void> => {
  try {
    const { eightBallPoolId } = req.params;

    const registration = await dbService.findRegistration({ eightBallPoolId });
    
    if (!registration) {
      res.status(404).json({
        error: 'Registration not found'
      });
      return;
    }

    res.json({
      eightBallPoolId: registration.eightBallPoolId,
      username: registration.username,
      createdAt: registration.createdAt,
      updatedAt: registration.updatedAt
    });

  } catch (error) {
    logger.error('Failed to retrieve registration', {
      action: 'get_registration_error',
      eightBallPoolId: req.params.eightBallPoolId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Failed to retrieve registration'
    });
  }
});

// Get user's claim history
router.get('/:eightBallPoolId/claims', async (req, res): Promise<void> => {
  try {
    const { eightBallPoolId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    // Verify user exists
    const registration = await dbService.findRegistration({ eightBallPoolId });
    if (!registration) {
      res.status(404).json({
        error: 'Registration not found'
      });
      return;
    }

    const claims = await dbService.findClaimRecords({ eightBallPoolId });

    res.json({
      eightBallPoolId,
      username: registration.username,
      claims: claims.map((claim: any) => ({
        status: claim.status,
        itemsClaimed: claim.itemsClaimed,
        error: claim.error,
        claimedAt: claim.claimedAt,
        schedulerRun: claim.schedulerRun
      }))
    });

  } catch (error) {
    logger.error('Failed to retrieve user claims', {
      action: 'get_user_claims_error',
      eightBallPoolId: req.params.eightBallPoolId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Failed to retrieve claim history'
    });
  }
});

// Get registration statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const totalRegistrations = await dbService.findRegistrations();
    
    // Get recent registrations (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentRegistrations = await dbService.findRegistrations({
      createdAt: { $gte: sevenDaysAgo }
    });

    res.json({
      totalRegistrations,
      recentRegistrations,
      period: '7 days'
    });

  } catch (error) {
    logger.error('Failed to retrieve registration stats', {
      action: 'get_registration_stats_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Failed to retrieve statistics'
    });
  }
});

export default router;



