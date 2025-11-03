import express from 'express';
import { logger } from '../services/LoggerService';
import { exec } from 'child_process';
import { promisify } from 'util';
import { DatabaseService } from '../services/DatabaseService';
import TelegramNotificationService from '../services/TelegramNotificationService';
import { EmailNotificationService } from '../services/EmailNotificationService';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import session from 'express-session';
import { TIMEOUTS } from '../constants';
import { isAllowedForEmail, isVPSOwner } from '../utils/permissions';
import { isValid6DigitPin, isValidHexCode } from '../utils/validation';
import { AdminRequest } from '../types/auth';

// Extend session type for MFA verification
declare module 'express-session' {
  interface SessionData {
    mfaVerified?: boolean;
    mfaVerifiedAt?: Date;
    mfaCodes?: {
      discord: string;
      telegram: string;
      email: string;
      generatedAt: number;
    };
  }
}

const router = express.Router();
const execAsync = promisify(exec);
const dbService = DatabaseService.getInstance();

// Initialize Discord client for sending DMs
let discordClient: Client | null = null;
const telegramService = new TelegramNotificationService();

// Initialize Discord client
const initDiscordClient = () => {
  if (discordClient) return discordClient;
  
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    logger.warn('Discord token not configured for MFA');
    return null;
  }
  
  discordClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages]
  });
  
  return discordClient;
};

// Check if user has VPS access
const checkVPSAccess = (userId: string): boolean => {
  return isVPSOwner(userId);
};

// Generate 6-digit PIN code
function generate6DigitPin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Permission functions moved to utils/permissions.ts

// Verify multi-factor authentication
const verifyMFA = async (discordCode: string, telegramCode: string, emailCode: string, userId: string, session: any): Promise<boolean> => {
  try {
    // User must provide either (Discord + Telegram) OR (Email)
    const hasDiscordTelegram = discordCode && telegramCode;
    const hasEmail = emailCode;
    
    if (!hasDiscordTelegram && !hasEmail) {
      logger.warn('No MFA codes provided', {
        action: 'mfa_no_codes',
        userId
      });
      return false;
    }
    
    // Check if codes are stored in session
    const storedCodes = session.mfaCodes;
    if (!storedCodes) {
      logger.warn('No MFA codes found in session', {
        action: 'mfa_no_stored_codes',
        userId
      });
      return false;
    }
    
    // Check if codes have expired (5 minutes)
    const now = new Date().getTime();
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
    if (now - storedCodes.generatedAt > fiveMinutes) {
      logger.warn('MFA codes expired', {
        action: 'mfa_codes_expired',
        userId,
        generatedAt: storedCodes.generatedAt,
        now: now,
        age: now - storedCodes.generatedAt
      });
      return false;
    }
    
    let verificationMethod = '';
    
    // Verify Email code if provided
    if (hasEmail && !hasDiscordTelegram) {
      if (!isValid6DigitPin(emailCode)) {
        logger.warn('Invalid email code format', {
          action: 'mfa_invalid_email_format',
          userId,
          emailCodeLength: emailCode.length
        });
        return false;
      }
      
      if (emailCode.trim() !== storedCodes.email) {
        logger.warn('Email code does not match', {
          action: 'mfa_email_no_match',
          userId,
          providedEmail: emailCode.substring(0, 2) + '****'
        });
        return false;
      }
      
      verificationMethod = 'email';
    }
    // Verify Discord + Telegram codes if provided
    else if (hasDiscordTelegram) {
      const isValidFormat = (code: string) => {
        return /^\d{16}$/.test(code.trim());
      };
      
      const isValidDiscord = isValidFormat(discordCode);
      const isValidTelegram = isValidFormat(telegramCode);
      
      if (!isValidDiscord || !isValidTelegram) {
        logger.warn('Invalid MFA code format', {
          action: 'mfa_invalid_format',
          userId,
          discordCodeLength: discordCode.length,
          telegramCodeLength: telegramCode.length,
          discordFormat: isValidDiscord,
          telegramFormat: isValidTelegram
        });
        return false;
      }
      
      const discordMatch = discordCode === storedCodes.discord;
      const telegramMatch = telegramCode === storedCodes.telegram;
      
      if (!discordMatch || !telegramMatch) {
        logger.warn('MFA codes do not match', {
          action: 'mfa_codes_no_match',
          userId,
          discordMatch,
          telegramMatch,
          providedDiscord: discordCode.substring(0, 4) + '****',
          providedTelegram: telegramCode.substring(0, 4) + '****'
        });
        return false;
      }
      
      verificationMethod = 'discord+telegram';
    }
    
    // Clear stored codes after successful verification
    delete session.mfaCodes;
    
    logger.info('MFA verification successful', {
      action: 'mfa_verification_success',
      userId,
      method: verificationMethod,
      discordCode: discordCode ? discordCode.substring(0, 4) + '****' : 'N/A',
      telegramCode: telegramCode ? telegramCode.substring(0, 4) + '****' : 'N/A',
      emailCode: emailCode ? emailCode.substring(0, 2) + '****' : 'N/A'
    });
    
    return true;
    
  } catch (error) {
    logger.error('MFA verification error', {
      action: 'mfa_verification_error',
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
};

// Clear failed claims command
const clearFailedClaimsCommand = async (): Promise<{ success: boolean; output: string; error?: string }> => {
  try {
    // Get all claim records
    const allClaims = await dbService.findClaimRecords();
    
    // Count failed claims
    const failedClaims = allClaims.filter(claim => claim.status === 'failed');
    const failedClaimsCount = failedClaims.length;
    
    if (failedClaimsCount === 0) {
      return {
        success: true,
        output: '✅ No failed claims found in the database\n📊 Database is already clean'
      };
    }
    
    // Delete all failed claims using DatabaseService
    const deleteResult = await dbService.deleteClaimRecords({ status: 'failed' });
    
    // Get updated statistics
    const updatedClaims = await dbService.findClaimRecords();
    const totalClaims = updatedClaims.length;
    const successfulClaims = updatedClaims.filter(claim => claim.status === 'success').length;
    const remainingFailed = updatedClaims.filter(claim => claim.status === 'failed').length;
    
    const output = [
      '🗑️  Failed Claims Cleanup Complete',
      '================================',
      `✅ Removed ${deleteResult} failed claim records`,
      '',
      '📊 Updated Database Statistics:',
      `   Total claims: ${totalClaims}`,
      `   Successful claims: ${successfulClaims}`,
      `   Failed claims: ${remainingFailed}`,
      '',
      '🎯 Database is now clean!'
    ].join('\n');
    
    logger.info('Failed claims cleared via terminal', {
      action: 'failed_claims_cleared_terminal',
      deletedCount: deleteResult,
      totalClaims,
      successfulClaims,
      remainingFailed
    });
    
    return {
      success: true,
      output
    };
    
  } catch (error) {
    logger.error('Failed to clear failed claims', {
      action: 'clear_failed_claims_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return {
      success: false,
      output: '',
      error: `Failed to clear failed claims: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

// Security: Dangerous command patterns that should never be allowed
const DANGEROUS_PATTERNS = [
  /[;&|`$(){}]/g,           // Command chaining/injection
  />|</g,                    // Redirection
  /rm\s+-rf|rm\s+-r|rm\s+-f/g, // Dangerous rm flags
  /\/etc\/|\/root\/|\/boot\/|\/sys\//g, // Protected directories
  /mkfs|fdisk|dd\s+if=/g,    // Disk operations
  /shutdown|reboot|halt|poweroff/g, // System shutdown
  /chmod\s+[0-7]{3,4}/g,     // chmod with dangerous permissions
  /chown\s+root|chgrp\s+root/g, // Ownership changes to root
  /passwd|useradd|userdel|groupadd|groupdel/g, // User management
  /su\s+|sudo\s+/g,          // Privilege escalation
];

// Allowed commands with optional argument validation
interface CommandConfig {
  args?: RegExp;
  maxArgs: number;
  paths?: boolean;
  allowProjectPaths?: boolean;
  subcommands?: readonly string[];
  readonly?: boolean;
  allowScripts?: boolean;
  special?: boolean;
}

const ALLOWED_COMMANDS: Record<string, CommandConfig> = {
  'ls': { args: /^[-lahR]+$/, maxArgs: 2 },
  'pwd': { args: /^$/, maxArgs: 0 },
  'whoami': { args: /^$/, maxArgs: 0 },
  'date': { args: /^[+\-%dmyYHM]+$/, maxArgs: 2 },
  'uptime': { args: /^$/, maxArgs: 0 },
  'df': { args: /^[-h]+$/, maxArgs: 2 },
  'free': { args: /^[-h]+$/, maxArgs: 2 },
  'ps': { args: /^[-auxef]+$/, maxArgs: 3 },
  'tail': { args: /^[-nf]+$/, maxArgs: 3, paths: true },
  'head': { args: /^[-nf]+$/, maxArgs: 3, paths: true },
  'grep': { args: /^[-ivr]+$/, maxArgs: 5, paths: true },
  'cat': { paths: true, maxArgs: 5, allowProjectPaths: true },
  'git': { subcommands: ['status', 'log', 'diff', 'branch', 'remote'], maxArgs: 5 },
  'npm': { subcommands: ['list', 'outdated', 'audit', 'run'], maxArgs: 5 },
  'node': { allowScripts: true, maxArgs: 2 },
  'pm2': { subcommands: ['list', 'status', 'logs', 'info', 'describe'], maxArgs: 4 },
  'systemctl': { subcommands: ['status', 'list-units', 'is-active'], readonly: true, maxArgs: 3 },
  'clear-failed-claims': { special: true, maxArgs: 0 },
};

// Validate command arguments
function validateCommand(command: string, baseCommand: string): { valid: boolean; error?: string } {
  const commandParts = command.trim().split(/\s+/).filter(p => p);
  
  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { valid: false, error: 'Command contains dangerous patterns' };
    }
  }
  
  // Check command exists in whitelist
  const commandConfig = ALLOWED_COMMANDS[baseCommand];
  if (!commandConfig) {
    return { valid: false, error: `Command '${baseCommand}' is not allowed` };
  }
  
  // Check argument count
  if (commandParts.length > commandConfig.maxArgs + 1) {
    return { valid: false, error: `Too many arguments for '${baseCommand}'` };
  }
  
  // Validate paths if required
  if (commandConfig.paths || commandConfig.allowProjectPaths) {
    const args = commandParts.slice(1);
    for (const arg of args) {
      // Skip flags
      if (arg.startsWith('-')) continue;
      
      // For allowProjectPaths, ensure paths are within project directory
      if (commandConfig.allowProjectPaths) {
        if (arg.includes('..') || arg.startsWith('/')) {
          return { valid: false, error: 'Paths must be relative to project directory' };
        }
      } else {
        // For readonly paths, ensure no writes
        if (arg.includes('>') || arg.includes('>>')) {
          return { valid: false, error: 'Write operations not allowed' };
        }
      }
    }
  }
  
  // Validate subcommands for commands that require them
  if (commandConfig.subcommands) {
    const subcommand = commandParts[1];
    if (!subcommand || !commandConfig.subcommands.includes(subcommand)) {
      return { valid: false, error: `Invalid subcommand. Allowed: ${commandConfig.subcommands.join(', ')}` };
    }
  }
  
  return { valid: true };
}

// Execute terminal command
const executeCommand = async (command: string, userId: string): Promise<{ success: boolean; output: string; error?: string }> => {
  try {
    const commandParts = command.trim().split(/\s+/).filter(p => p);
    if (commandParts.length === 0) {
      return {
        success: false,
        output: '',
        error: 'Empty command'
      };
    }
    
    const baseCommand = commandParts[0];
    
    // Handle special database commands
    if (baseCommand === 'clear-failed-claims') {
      return await clearFailedClaimsCommand();
    }
    
    // Validate command
    const validation = validateCommand(command, baseCommand);
    if (!validation.valid) {
      return {
        success: false,
        output: '',
        error: validation.error || 'Command validation failed'
      };
    }
    
    // Execute command with timeout from constants
    const { stdout, stderr } = await execAsync(command, { 
      timeout: TIMEOUTS.TERMINAL_COMMAND,
      cwd: '/home/blake/8bp-rewards', // Set working directory
      maxBuffer: 1024 * 1024 * 10 // 10MB max output
    });
    
    logger.info('Terminal command executed', {
      action: 'terminal_command',
      userId,
      command: command.substring(0, 100), // Log first 100 chars for security
      success: true
    });
    
    return {
      success: true,
      output: stdout,
      error: stderr
    };
    
  } catch (error: any) {
    logger.error('Terminal command error', {
      action: 'terminal_command_error',
      userId,
      command: command.substring(0, 100),
      error: error.message
    });
    
    return {
      success: false,
      output: '',
      error: error.message
    };
  }
};

// Request MFA codes
// Import AdminRequest at the top
// Already imported

router.post('/request-codes', async (req, res) => {
  try {
    const user = (req as AdminRequest).user;
    const userId = user?.id;
    const { channel } = req.body;
    const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(email => email.trim()) || [];
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    if (!checkVPSAccess(userId)) {
      return res.status(403).json({
        success: false,
        message: 'VPS access denied'
      });
    }
    
    // Generate codes
    const discordCode = Math.floor(1000000000000000 + Math.random() * 9000000000000000).toString();
    const telegramCode = Math.floor(1000000000000000 + Math.random() * 9000000000000000).toString();
    const emailCode = generate6DigitPin();
    
    logger.info('MFA codes generated', {
      action: 'mfa_codes_generated',
      userId,
      discordCode: discordCode.substring(0, 4) + '****',
      telegramCode: telegramCode.substring(0, 4) + '****',
      emailCode: emailCode.substring(0, 2) + '****'
    });
    
    let discordSent = false;
    let telegramSent = false;
    let emailSent = false;
    
    // Send Discord code - only to the logged-in user
    if (channel === 'discord') {
      try {
        const discordClient = initDiscordClient();
        if (discordClient && !discordClient.isReady()) {
          await discordClient.login(process.env.DISCORD_TOKEN);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for login
        }
        
        if (discordClient?.isReady()) {
          // Send only to the logged-in user's Discord ID
          const user = await discordClient.users.fetch(userId);
          if (user) {
            const embed = new EmbedBuilder()
              .setTitle('🔐 Admin Terminal MFA Code')
              .setDescription(`Your Admin Terminal verification code is:\n\n**${discordCode}**\n\nThis code expires in 5 minutes.`)
              .setColor(0x00FF00)
              .setTimestamp();
            
            await user.send({ embeds: [embed] });
            discordSent = true;
            
            logger.info('Discord MFA code sent', {
              action: 'discord_mfa_sent',
              userId,
              code: discordCode.substring(0, 4) + '****'
            });
          }
        }
      } catch (discordError) {
        logger.error('Failed to send Discord MFA code', {
          action: 'discord_mfa_error',
          userId,
          error: discordError instanceof Error ? discordError.message : 'Unknown error'
        });
      }
    }
    
    // Send Telegram code - only to the logged-in user
    if (channel === 'telegram') {
      try {
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
          const message = `🔐 *Admin Terminal MFA Code*\n\nYour verification code is:\n\n*${telegramCode}*\n\nThis code expires in 5 minutes.`;
          
          await telegramService.sendDirectMessage(telegramUserId, message);
          telegramSent = true;
          
          logger.info('Telegram MFA code sent', {
            action: 'telegram_mfa_sent',
            userId,
            telegramUserId,
            code: telegramCode.substring(0, 4) + '****'
          });
        } else {
          logger.warn('No Telegram mapping found for Discord user', {
            action: 'telegram_mapping_not_found',
            userId
          });
        }
      } catch (telegramError) {
        logger.error('Failed to send Telegram MFA code', {
          action: 'telegram_mfa_error',
          userId,
          error: telegramError instanceof Error ? telegramError.message : 'Unknown error'
        });
      }
    }
    
    // Send Email code if requested
    if (channel === 'email') {
      if (adminEmails.length === 0) {
        logger.warn('No admin emails configured', {
          action: 'no_admin_emails',
          userId
        });
        return res.status(400).json({
          error: 'Email authentication not configured. Please contact an administrator.'
        });
      }
      
      try {
        const emailService = new EmailNotificationService();
        if (emailService.isConfigured()) {
          // Send to all admin emails
          for (const adminEmail of adminEmails) {
            await emailService.sendPinCode(
              adminEmail,
              emailCode,
              'Terminal Access'
            );
          }
          emailSent = true;
          logger.info('Email MFA code sent to all admin emails', {
            action: 'email_mfa_sent',
            userId,
            adminEmails: adminEmails.length,
            code: emailCode.substring(0, 2) + '****'
          });
        } else {
          logger.warn('Email service not configured', {
            action: 'email_service_not_configured',
            userId
          });
        }
      } catch (emailError) {
        logger.error('Failed to send email MFA code', {
          action: 'email_mfa_error',
          userId,
          error: emailError instanceof Error ? emailError.message : 'Unknown error'
        });
      }
    }
    
    // Store codes temporarily for verification (in production, use Redis or database)
    req.session.mfaCodes = {
      discord: discordCode,
      telegram: telegramCode,
      email: emailCode,
      generatedAt: new Date().getTime()
    };
    
    // Determine response message based on what was sent
    let message = 'MFA codes generated. ';
    if (discordSent && telegramSent) {
      message += 'Codes sent to Discord and Telegram. Please check your DMs.';
    } else if (discordSent) {
      message += 'Code sent to Discord. Please check your DMs.';
    } else if (telegramSent) {
      message += 'Code sent to Telegram. Please check your DMs.';
    } else if (emailSent) {
      message += `Code sent to admin emails (${adminEmails.length} recipients). Please check your email.`;
    } else {
      message += 'Please use the codes provided.';
    }
    
    return res.json({
      success: true,
      message,
      discordSent,
      telegramSent,
      emailSent,
      adminEmailsCount: adminEmails.length
    });
    
  } catch (error) {
    logger.error('MFA code request error', {
      action: 'mfa_code_request_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to request MFA codes'
    });
  }
});

// Check VPS access
router.get('/check-access', async (req, res) => {
  try {
    const adminReq = req as AdminRequest;
    const userId = adminReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    const hasAccess = checkVPSAccess(userId);
    
    logger.info('VPS access check', {
      action: 'vps_access_check',
      userId,
      hasAccess
    });
    
    return res.json({
      success: true,
      hasAccess,
      message: hasAccess ? 'Access granted' : 'Access denied'
    });
    
  } catch (error) {
    logger.error('VPS access check error', {
      action: 'vps_access_check_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to check access'
    });
  }
});

// Verify MFA
router.post('/verify-mfa', async (req, res) => {
  try {
    const { discordCode, telegramCode, emailCode } = req.body;
    const adminReq = req as AdminRequest;
    const userId = adminReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    if (!checkVPSAccess(userId)) {
      return res.status(403).json({
        success: false,
        message: 'VPS access denied'
      });
    }
    
    // User must provide either (Discord + Telegram) OR (Email)
    const hasDiscordTelegram = discordCode && telegramCode;
    const hasEmail = emailCode;
    
    if (!hasDiscordTelegram && !hasEmail) {
      return res.status(400).json({
        success: false,
        message: 'Please provide either Discord code (and Telegram if applicable) OR email code'
      });
    }
    
    const isValid = await verifyMFA(discordCode || '', telegramCode || '', emailCode || '', userId, req.session);
    
    if (isValid) {
      // Store MFA verification in session
      req.session.mfaVerified = true;
      req.session.mfaVerifiedAt = new Date();
      
      const verificationMethod = hasEmail ? 'email' : 'discord+telegram';
      const successMessage = hasEmail 
        ? 'Email code verified successfully. MFA verification complete.'
        : 'Discord and Telegram codes verified successfully. MFA verification complete.';
      
      logger.info('MFA verification successful', {
        action: 'mfa_success',
        userId,
        method: verificationMethod
      });
      
      return res.json({
        success: true,
        message: successMessage
      });
    } else {
      logger.warn('MFA verification failed', {
        action: 'mfa_failed',
        userId
      });
      
      return res.status(400).json({
        success: false,
        message: 'Invalid MFA codes'
      });
    }
    
  } catch (error) {
    logger.error('MFA verification error', {
      action: 'mfa_verification_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to verify MFA'
    });
  }
});

// Execute terminal command
router.post('/execute', async (req, res) => {
  try {
    const { command } = req.body;
    const adminReq = req as AdminRequest;
    const userId = adminReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    if (!checkVPSAccess(userId)) {
      return res.status(403).json({
        success: false,
        message: 'VPS access denied'
      });
    }
    
    // Check MFA verification
    if (!req.session.mfaVerified) {
      return res.status(403).json({
        success: false,
        message: 'MFA verification required'
      });
    }
    
    // Check if MFA verification is still valid (1 hour)
    const mfaVerifiedAt = req.session.mfaVerifiedAt;
    if (mfaVerifiedAt && new Date().getTime() - new Date(mfaVerifiedAt).getTime() > 3600000) {
      req.session.mfaVerified = false;
      return res.status(403).json({
        success: false,
        message: 'MFA verification expired. Please verify again.'
      });
    }
    
    if (!command || typeof command !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Command is required'
      });
    }
    
    const result = await executeCommand(command, userId);
    
    return res.json({
      success: result.success,
      output: result.output,
      error: result.error
    });
    
  } catch (error) {
    logger.error('Terminal execution error', {
      action: 'terminal_execution_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to execute command'
    });
  }
});

// Clear MFA verification
router.post('/clear-mfa', async (req, res) => {
  try {
    req.session.mfaVerified = false;
    req.session.mfaVerifiedAt = undefined;
    
    logger.info('MFA verification cleared', {
      action: 'mfa_cleared',
      userId: (req as AdminRequest).user?.id
    });
    
    return res.json({
      success: true,
      message: 'MFA verification cleared'
    });
    
  } catch (error) {
    logger.error('Clear MFA error', {
      action: 'clear_mfa_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to clear MFA verification'
    });
  }
});

export default router;
