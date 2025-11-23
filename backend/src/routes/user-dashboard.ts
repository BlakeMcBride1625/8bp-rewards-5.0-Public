import express from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { logger } from '../services/LoggerService';
import { authenticateUser } from '../middleware/auth';
import DiscordNotificationService from '../services/DiscordNotificationService';
import WebSocketService from '../services/WebSocketService';
import axios from 'axios';
import path from 'path';
import fs from 'fs';

const router = express.Router();
const dbService = DatabaseService.getInstance();

// Apply user authentication to all routes
router.use(authenticateUser);

// Get user's linked accounts
router.get('/linked-accounts', async (req, res): Promise<void> => {
  console.log('🚀 LINKED ACCOUNTS ROUTE CALLED');
  console.log('🚀 User:', (req as any).user);
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      console.error('❌ No user in request');
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }
    const discordId = user.id;
    console.log('🚀 Discord ID:', discordId, 'Type:', typeof discordId);

    logger.info('Fetching linked accounts', {
      action: 'get_linked_accounts',
      discordId,
      discordIdType: typeof discordId,
      username: user.username
    });
    console.log('📝 Logged: Fetching linked accounts');

    // Find all registrations linked to this Discord ID - use direct SQL with explicit type casting
    // Include account_level and account_rank in the initial query
    // user_id = username (8BP account username from registration or verification image)
    const result = await dbService.executeQuery(
      `SELECT username as user_id,
              username,
              eight_ball_pool_id, 
              created_at, 
              discord_id, 
              account_level, 
              account_rank, 
              verified_at 
       FROM registrations 
       WHERE discord_id IS NOT NULL 
       AND discord_id::text = $1::text
       AND LENGTH(TRIM(discord_id)) > 0
       AND username IS NOT NULL
       ORDER BY created_at DESC`,
      [String(discordId).trim()]
    );
    
    console.log('📊 SQL Query Result:', {
      rowCount: result.rows.length,
      rows: result.rows.map((r: any) => ({
        id: r.eight_ball_pool_id,
        username: r.username,
        discord_id: r.discord_id,
        account_level: r.account_level,
        account_rank: r.account_rank
      }))
    });
    
    logger.info('SQL query executed', {
      action: 'sql_query_executed',
      discordId: String(discordId).trim(),
      rowCount: result.rows.length,
      queryResult: result.rows.map((r: any) => ({
        eight_ball_pool_id: r.eight_ball_pool_id,
        username: r.username,
        discord_id: r.discord_id,
        account_level: r.account_level,
        account_rank: r.account_rank
      }))
    });
    
    const registrations = result.rows.map((row: any) => ({
      user_id: row.user_id, // username from registration or verification
      username: row.username,
      eightBallPoolId: row.eight_ball_pool_id,
      createdAt: row.created_at,
      created_at: row.created_at,
      eight_ball_pool_id: row.eight_ball_pool_id,
      discordId: row.discord_id,
      discord_id: row.discord_id,
      account_level: row.account_level,
      account_rank: row.account_rank,
      verified_at: row.verified_at
    }));
    
    logger.info('Found registrations', {
      action: 'linked_accounts_found',
      discordId,
      count: registrations.length,
      accountIds: registrations.map((r: any) => r.eightBallPoolId || r.eight_ball_pool_id),
      usernames: registrations.map((r: any) => r.username)
    });
    
    // Get claim statistics for each account
    const accountsWithStats = await Promise.all(
      registrations.map(async (reg: any) => {
        // Extract fields from the mapped registration object
        const eightBallPoolId = reg.eightBallPoolId || reg.eight_ball_pool_id;
        // Username should always be present (filtered in query)
        const username = reg.username || reg.user_id;
        const user_id = reg.user_id || reg.username; // user_id = username
        const dateLinked = reg.createdAt || reg.created_at;
        
        if (!eightBallPoolId) {
          logger.warn('Registration missing eightBallPoolId', {
            action: 'missing_eightballpool_id',
            registration: reg
          });
          return null;
        }
        
        // Get successful claims count
        const successResult = await dbService.executeQuery(
          `SELECT COUNT(*) as count FROM claim_records 
           WHERE eight_ball_pool_id = $1 AND status = 'success'`,
          [eightBallPoolId]
        );
        const successfulClaims = parseInt(successResult.rows[0]?.count || '0');

        // Get failed claims count - exclude duplicate attempts (failed claims where user has successful claim on same day)
        const failedResult = await dbService.executeQuery(
          `SELECT COUNT(*) as count FROM claim_records cr
           WHERE cr.eight_ball_pool_id = $1 
           AND cr.status = 'failed'
           AND NOT EXISTS (
             SELECT 1 FROM claim_records cr2 
             WHERE cr2.eight_ball_pool_id = cr.eight_ball_pool_id 
             AND cr2.status = 'success' 
             AND DATE(cr2.claimed_at) = DATE(cr.claimed_at)
           )`,
          [eightBallPoolId]
        );
        const failedClaims = parseInt(failedResult.rows[0]?.count || '0');

        // Ensure dateLinked is properly formatted
        let formattedDateLinked: string | null = null;
        if (dateLinked) {
          try {
            // Convert to ISO string if it's a Date object or string
            const dateValue = dateLinked instanceof Date 
              ? dateLinked 
              : new Date(dateLinked);
            
            if (!isNaN(dateValue.getTime())) {
              formattedDateLinked = dateValue.toISOString();
            }
          } catch (e) {
            logger.warn('Invalid dateLinked value', {
              action: 'invalid_date_linked',
              dateLinked,
              error: e instanceof Error ? e.message : 'Unknown'
            });
            formattedDateLinked = null;
          }
        }
        
        logger.info('Mapping account data', {
          action: 'map_account_data',
          eightBallPoolId,
          username,
          dateLinked: formattedDateLinked,
          rawDateLinked: dateLinked
        });
        
        // Get account level and rank from registration (already in reg object from initial query)
        let account_level = reg.account_level !== undefined ? reg.account_level : null;
        let account_rank = reg.account_rank !== undefined ? reg.account_rank : null;
        let verified_at = reg.verified_at !== undefined ? reg.verified_at : null;
        
        // Username should always be present (filtered in query)
        const displayUsername = username ? String(username).trim() : null;
        
        logger.info('Account data prepared', {
          action: 'account_data_prepared',
          eightBallPoolId,
          displayUsername,
          user_id,
          account_level,
          account_rank,
          successfulClaims,
          failedClaims
        });
        
        return {
          user_id: user_id || displayUsername, // user_id = username
          username: displayUsername,
          eightBallPoolId: String(eightBallPoolId || ''),
          dateLinked: formattedDateLinked,
          successfulClaims,
          failedClaims,
          account_level: account_level,
          account_rank: account_rank,
          verified_at: verified_at
        };
      })
    );
    
    // Filter out any null entries
    const validAccounts = accountsWithStats.filter((account: any) => account !== null);
    
    logger.info('Sending linked accounts response', {
      action: 'send_linked_accounts',
      discordId,
      accountCount: validAccounts.length,
      accounts: validAccounts.map((a: any) => ({
        eightBallPoolId: a.eightBallPoolId,
        username: a.username,
        dateLinked: a.dateLinked
      }))
    });

    // Log the exact response being sent
    console.log('✅ FINAL RESPONSE:', {
      accountCount: validAccounts.length,
      accounts: validAccounts
    });
    
    logger.info('Sending final response', {
      action: 'send_final_response',
      discordId,
      accountCount: validAccounts.length,
      accounts: JSON.stringify(validAccounts, null, 2)
    });

    const response = {
      success: true,
      accounts: validAccounts,
      timestamp: new Date().toISOString(),
      queryDiscordId: discordId
    };
    
    console.log('📤 Sending JSON response:', JSON.stringify(response, null, 2));
    res.json(response);
    return;
  } catch (error) {
    logger.error('Error fetching linked accounts', {
      action: 'get_linked_accounts_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch linked accounts'
    });
    return;
  }
});

// Get confirmation screenshots for user's accounts
router.get('/screenshots', async (req, res) => {
  try {
    const user = (req as any).user;
    const discordId = user.id;

    // Find all registrations linked to this Discord ID - use direct SQL with explicit type casting
    // Use the same robust query as linked-accounts endpoint to ensure proper matching
    const result = await dbService.executeQuery(
      `SELECT * FROM registrations 
       WHERE discord_id IS NOT NULL 
       AND discord_id::text = $1::text
       AND LENGTH(TRIM(discord_id)) > 0
       ORDER BY created_at DESC`,
      [String(discordId).trim()]
    );
    
    const registrations = result.rows.map((row: any) => ({
      eightBallPoolId: row.eight_ball_pool_id,
      username: row.username,
      createdAt: row.created_at,
      created_at: row.created_at,
      eight_ball_pool_id: row.eight_ball_pool_id,
      discordId: row.discord_id,
      discord_id: row.discord_id
    }));
    
    const screenshots: Array<{
      eightBallPoolId: string;
      username: string;
      screenshotUrl: string;
      claimedAt: string | null;
      capturedAt: string | null;
      filename: string;
    }> = [];

    // Use absolute path - screenshots are in /app/screenshots/confirmation in container
    // __dirname in compiled code is /app/dist/backend/backend/src/routes
    // So we need to use absolute path /app/screenshots/confirmation
    const screenshotsDir = process.env.SCREENSHOTS_DIR || 
      (process.env.NODE_ENV === 'production' 
        ? '/app/screenshots/confirmation'
        : path.join(__dirname, '../../../../screenshots/confirmation'));
    
    logger.info('Fetching screenshots', {
      action: 'get_screenshots',
      discordId: String(discordId).trim(),
      registrationsCount: registrations.length,
      accountIds: registrations.map((r: any) => r.eightBallPoolId || r.eight_ball_pool_id)
    });
    
    for (const reg of registrations) {
      const eightBallPoolId = reg.eightBallPoolId || reg.eight_ball_pool_id;
      
      if (!eightBallPoolId) {
        logger.warn('Registration missing eightBallPoolId', {
          action: 'missing_eightballpool_id',
          registration: reg
        });
        continue;
      }

      const eightBallPoolIdStr = String(eightBallPoolId).trim();
      
      // Query claim history once for this account to map claim timestamps to filenames
      const claimHistoryResult = await dbService.executeQuery(
        `SELECT claimed_at, metadata 
         FROM claim_records 
         WHERE eight_ball_pool_id = $1 AND status = 'success'
         ORDER BY claimed_at DESC`,
        [eightBallPoolIdStr]
      );

      const claimTimestampsByFilename = new Map<string, string | null>();
      for (const row of claimHistoryResult.rows || []) {
        let metadata = row.metadata;
        if (metadata && typeof metadata === 'string') {
          try {
            metadata = JSON.parse(metadata);
          } catch (parseError) {
            logger.warn('Failed to parse claim metadata JSON', {
              action: 'parse_claim_metadata_error',
              eightBallPoolId: eightBallPoolIdStr,
              error: parseError instanceof Error ? parseError.message : 'Unknown error'
            });
            metadata = {};
          }
        }

        if (metadata && typeof metadata === 'object') {
          const confirmationPath = metadata.confirmationImagePath || metadata.screenshotPath;
          if (confirmationPath && typeof confirmationPath === 'string') {
            const normalizedPath = confirmationPath.replace(/\\/g, '/');
            const filename = path.basename(normalizedPath);
            if (filename) {
              claimTimestampsByFilename.set(filename, row.claimed_at || null);
            }
          }
        }
      }

      // Find confirmation screenshot for this account
      if (fs.existsSync(screenshotsDir)) {
        const files = fs.readdirSync(screenshotsDir);
        
        // Find all screenshots for this account (there may be multiple)
        // Handle both string and numeric ID formats
        const accountScreenshots = files.filter(file => {
          // Match files that contain the eightBallPoolId in the filename
          // Screenshots are saved as: confirmation-{eightBallPoolId}-{timestamp}.png
          // Handle both exact match and numeric string match (e.g., "1028645630" matches "1028645630")
          const matchesId = file.includes(eightBallPoolIdStr) || 
                           file.includes(String(parseInt(eightBallPoolIdStr) || eightBallPoolIdStr));
          const isImage = file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg');
          return matchesId && isImage;
        });
        
        if (accountScreenshots.length > 0) {
          // Filenames are like: confirmation-{id}-{timestamp}.png
          // Sort descending to get most recent first
          accountScreenshots.sort((a, b) => b.localeCompare(a));

          const sortedScreenshots = accountScreenshots
            .map((accountScreenshot) => {
              const screenshotPath = path.join(screenshotsDir, accountScreenshot);
              let capturedAtDate: Date | null = null;

              try {
                const stats = fs.statSync(screenshotPath);
                capturedAtDate = stats.mtime || null;
              } catch (statError) {
                logger.warn('Failed to read screenshot metadata', {
                  action: 'screenshot_stat_error',
                  eightBallPoolId: eightBallPoolIdStr,
                  username: reg.username,
                  screenshotFile: accountScreenshot,
                  error: statError instanceof Error ? statError.message : 'Unknown error'
                });
              }

              return {
                filename: accountScreenshot,
                capturedAt: capturedAtDate
              };
            })
            .sort((a, b) => {
              if (a.capturedAt && b.capturedAt) {
                return b.capturedAt.getTime() - a.capturedAt.getTime();
              }
              if (a.capturedAt) return -1;
              if (b.capturedAt) return 1;
              return b.filename.localeCompare(a.filename);
            });

          // Limit to most recent 50 screenshots per account to prevent performance issues
          const recentScreenshots = sortedScreenshots.slice(0, 50);
          
          for (const screenshotInfo of recentScreenshots) {
            const capturedAt = screenshotInfo.capturedAt ? screenshotInfo.capturedAt.toISOString() : null;
            const claimedAt = claimTimestampsByFilename.get(screenshotInfo.filename) || null;

            logger.info('Found screenshot for account', {
              action: 'screenshot_found',
              eightBallPoolId: eightBallPoolIdStr,
              username: reg.username,
              screenshotFile: screenshotInfo.filename,
              totalScreenshots: accountScreenshots.length,
              displayedScreenshots: recentScreenshots.length,
              capturedAt,
              claimedAt
            });

            screenshots.push({
              eightBallPoolId: eightBallPoolIdStr,
              username: reg.username,
              screenshotUrl: `/8bp-rewards/api/user-dashboard/screenshots/view/${screenshotInfo.filename}`,
              claimedAt,
              capturedAt,
              filename: screenshotInfo.filename
            });
          }
        } else {
          logger.info('No screenshot found for account', {
            action: 'no_screenshot_found',
            eightBallPoolId: eightBallPoolIdStr,
            username: reg.username,
            totalFilesInDir: files.length,
            sampleFiles: files.slice(0, 5), // Log first 5 files for debugging
            searchPattern: `confirmation-${eightBallPoolIdStr}-`
          });
        }
      } else {
        logger.warn('Screenshots directory does not exist', {
          action: 'screenshots_dir_missing',
          path: screenshotsDir
        });
      }
    }

    res.json({
      success: true,
      screenshots
    });
  } catch (error) {
    logger.error('Error fetching screenshots', {
      action: 'get_screenshots_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch screenshots'
    });
  }
});

// Notify about new screenshot (can be called by claimer service or other services)
// This endpoint requires authentication OR a valid internal service token
router.post('/screenshots/notify', async (req, res) => {
  try {
    const { userId, eightBallPoolId, username, screenshotUrl, claimedAt, capturedAt, filename } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Emit WebSocket event to notify the user about the new screenshot
    if (eightBallPoolId && username && screenshotUrl) {
      WebSocketService.emitScreenshotUpdate(
        userId,
        {
          eightBallPoolId,
          username,
          screenshotUrl,
          claimedAt: claimedAt || null,
          capturedAt: capturedAt || null,
          filename: filename || null
        }
      );
    } else {
      // Just emit a refresh event if full data not provided
      WebSocketService.emitScreenshotsRefresh(userId);
    }

    logger.info('Screenshot notification sent', {
      action: 'screenshot_notify',
      userId,
      eightBallPoolId
    });

    return res.json({
      success: true,
      message: 'Screenshot notification sent'
    });
  } catch (error) {
    logger.error('Error notifying about screenshot', {
      action: 'screenshot_notify_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to notify about screenshot'
    });
  }
});

// Serve screenshot image
router.get('/screenshots/view/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const user = (req as any).user;
    const discordId = user.id;

    // Validate filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filename'
      });
    }

    // Verify user has access to this screenshot by checking if it's for one of their accounts
    const registrations = await dbService.findRegistrations({ discordId: discordId });
    const userAccountIds = registrations.map((r: any) => {
      const id = String(r.eightBallPoolId || r.eight_ball_pool_id || '').trim();
      // Normalize ID - remove dashes for matching
      return id.replace(/-/g, '');
    });
    
    // Check if filename contains any of the user's account IDs (normalized, no dashes)
    // Filenames are like: confirmation-1826254746-2025-11-22T00-02-00-415Z.png
    // Extract the ID from filename (between "confirmation-" and the next "-")
    const filenameIdMatch = filename.match(/confirmation-([0-9-]+)-/);
    const filenameId = filenameIdMatch ? filenameIdMatch[1].replace(/-/g, '') : filename.replace(/-/g, '');
    
    const hasAccess = userAccountIds.some((id: string) => {
      const normalizedId = id.replace(/-/g, '');
      return filenameId === normalizedId || filename.includes(normalizedId);
    });
    
    if (!hasAccess) {
      logger.warn('Screenshot access denied', {
        action: 'screenshot_access_denied',
        discordId,
        filename,
        userAccountIds,
        filenameId
      });
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Use absolute path for screenshots directory
    const screenshotsDir = process.env.SCREENSHOTS_DIR || 
      (process.env.NODE_ENV === 'production' 
        ? '/app/screenshots/confirmation'
        : path.join(__dirname, '../../../../screenshots/confirmation'));
    const imagePath = path.join(screenshotsDir, filename);

    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        success: false,
        message: 'Screenshot not found'
      });
    }

    // Set appropriate headers for image serving with shorter cache time for auto-updates
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Stream the image file
    const fileStream = fs.createReadStream(imagePath);
    fileStream.pipe(res);
    return; // Explicit return after streaming
  } catch (error) {
    logger.error('Error serving screenshot', {
      action: 'serve_screenshot_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to serve screenshot'
    });
  }
});

// Submit deregistration request
router.post('/deregistration-request', async (req, res) => {
  try {
    const user = (req as any).user;
    const discordId = user.id;
    const { eightBallPoolId } = req.body;
    // Get IP address from various sources (respecting proxy headers)
    const ipAddress = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() 
      || req.headers['x-real-ip']?.toString()
      || req.ip 
      || req.connection.remoteAddress 
      || req.socket.remoteAddress
      || 'unknown';

    if (!eightBallPoolId) {
      return res.status(400).json({
        success: false,
        error: 'eightBallPoolId is required'
      });
    }

    // Verify the account belongs to this user
    const registration = await dbService.findRegistration({ 
      eightBallPoolId: eightBallPoolId,
      discordId: discordId 
    });

    if (!registration) {
      return res.status(403).json({
        success: false,
        error: 'Account not found or does not belong to you'
      });
    }

    // Check if there's already a pending request for this account
    const existingRequest = await dbService.executeQuery(
      `SELECT id FROM deregistration_requests 
       WHERE discord_id = $1 AND eight_ball_pool_id = $2 AND status = 'pending'`,
      [discordId, eightBallPoolId]
    );

    if (existingRequest.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'You already have a pending deregistration request for this account'
      });
    }

    // Create deregistration request
    const result = await dbService.executeQuery(
      `INSERT INTO deregistration_requests 
       (discord_id, eight_ball_pool_id, ip_address, status, requested_at) 
       VALUES ($1, $2, $3, 'pending', CURRENT_TIMESTAMP) 
       RETURNING id, requested_at`,
      [discordId, eightBallPoolId, ipAddress]
    );

    logger.info('Deregistration request created', {
      action: 'deregistration_request_created',
      discordId,
      eightBallPoolId,
      requestId: result.rows[0].id,
      ipAddress
    });

    // Send Discord embed notification
    try {
      const discordService = new DiscordNotificationService();
      const discordTag = `${user.username}#${user.discriminator || '0000'}`;
      
      // Find confirmation screenshot if available
      // Use absolute path for screenshots directory
      const screenshotsDir = process.env.SCREENSHOTS_DIR || 
        (process.env.NODE_ENV === 'production' 
          ? '/app/screenshots/confirmation'
          : path.join(__dirname, '../../../../screenshots/confirmation'));
      let screenshotUrl: string | undefined;
      if (fs.existsSync(screenshotsDir)) {
        const files = fs.readdirSync(screenshotsDir);
        const screenshot = files.find(file => 
          file.includes(eightBallPoolId) && 
          (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg'))
        );
        if (screenshot) {
          screenshotUrl = `${process.env.PUBLIC_URL || 'https://8bp.epildevconnect.uk'}/8bp-rewards/api/user-dashboard/screenshots/view/${screenshot}`;
        }
      }

      await discordService.sendDeregistrationRequestEmbed(
        discordId,
        discordTag,
        eightBallPoolId,
        registration.username || null,
        ipAddress,
        screenshotUrl
      );
    } catch (discordError) {
      logger.warn('Failed to send Discord notification for deregistration request', {
        action: 'discord_notification_failed',
        error: discordError instanceof Error ? discordError.message : 'Unknown error'
      });
    }

    return res.json({
      success: true,
      message: 'Deregistration request submitted successfully',
      requestId: result.rows[0].id,
      requestedAt: result.rows[0].requested_at
    });
  } catch (error) {
    logger.error('Error creating deregistration request', {
      action: 'create_deregistration_request_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to submit deregistration request'
    });
  }
});

// Get user's deregistration requests
router.get('/deregistration-requests', async (req, res) => {
  try {
    const user = (req as any).user;
    const discordId = user.id;

    const result = await dbService.executeQuery(
      `SELECT id, eight_ball_pool_id, status, requested_at, reviewed_at, review_notes
       FROM deregistration_requests 
       WHERE discord_id = $1 
       ORDER BY requested_at DESC`,
      [discordId]
    );

    res.json({
      success: true,
      requests: result.rows
    });
  } catch (error) {
    logger.error('Error fetching deregistration requests', {
      action: 'get_deregistration_requests_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch deregistration requests'
    });
  }
});

// Get user info (IP, last login, etc.)
router.get('/info', async (req, res) => {
  try {
    const user = (req as any).user;
    const discordId = user.id;
    
    // Get IP address from various sources (respecting proxy headers)
    const ipAddress = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() 
      || req.headers['x-real-ip']?.toString()
      || req.ip 
      || req.connection.remoteAddress 
      || req.socket.remoteAddress
      || 'unknown';

    // Get user's last login info from registrations - use direct SQL
    const registrationsResult = await dbService.executeQuery(
      `SELECT * FROM registrations 
       WHERE discord_id = $1 AND discord_id IS NOT NULL 
       ORDER BY created_at DESC`,
      [discordId]
    );
    
    const registrations = registrationsResult.rows;
    
    // Get the most recent last_login_at from any linked account
    let lastLoginAt: string | null = null;
    
    if (registrations.length > 0) {
      const loginResult = await dbService.executeQuery(
        `SELECT last_login_at FROM registrations 
         WHERE discord_id = $1 AND last_login_at IS NOT NULL 
         ORDER BY last_login_at DESC LIMIT 1`,
        [discordId]
      );
      
      if (loginResult.rows.length > 0) {
        lastLoginAt = loginResult.rows[0].last_login_at;
      }
    }

    // Update last login for this session (without IP)
    if (registrations.length > 0) {
      await dbService.executeQuery(
        `UPDATE registrations 
         SET last_login_at = CURRENT_TIMESTAMP 
         WHERE discord_id = $1`,
        [discordId]
      );
    }

    logger.info('Sending user info response', {
      action: 'send_user_info',
      discordId,
      currentIp: ipAddress,
      lastLoginAt,
      registrationsFound: registrations.length
    });

    res.json({
      success: true,
      user: {
        discordId: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar
      },
      currentIp: ipAddress !== 'unknown' ? ipAddress : (req.ip || req.connection.remoteAddress || 'Unknown'),
      lastLoginAt
    });
  } catch (error) {
    logger.error('Error fetching user info', {
      action: 'get_user_info_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user info'
    });
  }
});

// Update username for a linked account
router.put('/update-username', async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const discordId = user.id;
    const { eightBallPoolId, newUsername } = req.body;

    if (!eightBallPoolId || !newUsername) {
      res.status(400).json({
        success: false,
        error: 'eightBallPoolId and newUsername are required'
      });
      return;
    }

    // Validate username length
    if (newUsername.trim().length < 2 || newUsername.trim().length > 50) {
      res.status(400).json({
        success: false,
        error: 'Username must be between 2 and 50 characters'
      });
      return;
    }

    // Verify the account belongs to this user
    const registration = await dbService.findRegistration({ 
      eightBallPoolId: eightBallPoolId,
      discordId: discordId 
    });

    if (!registration) {
      res.status(403).json({
        success: false,
        error: 'Account not found or does not belong to you'
      });
      return;
    }

    // Update the username
    await dbService.updateRegistration(eightBallPoolId, {
      username: newUsername.trim()
    });

    logger.info('Username updated by user', {
      action: 'update_username',
      discordId,
      eightBallPoolId,
      oldUsername: registration.username,
      newUsername: newUsername.trim()
    });

    res.json({
      success: true,
      message: 'Username updated successfully',
      username: newUsername.trim()
    });
  } catch (error) {
    logger.error('Error updating username', {
      action: 'update_username_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update username'
    });
  }
});

export default router;

