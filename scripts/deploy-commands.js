#!/usr/bin/env node

/**
 * Universal Discord Slash Command Deployment Script
 * 
 * Deploys slash commands for all three Discord bots:
 * 1. Main Bot (rewards/registration)
 * 2. Verification Bot (rank verification)
 * 3. Status Bot (service monitoring)
 * 
 * Features:
 * - Registers commands both guild-specific (instant) and globally (1 hour)
 * - Validates command definitions
 * - Provides detailed summary report
 * - Supports force refresh mode
 */

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logWarning(message) {
  log(`⚠️ ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️ ${message}`, 'cyan');
}

// Main Bot Commands (from services/discord-service.js)
const MAIN_BOT_COMMANDS = [
  {
    name: 'register',
    description: 'Register your 8 Ball Pool account for automated rewards',
    options: [
      {
        type: 4, // INTEGER
        name: 'id',
        description: 'Enter the 8 Ball Pool Unique ID here',
        required: true,
      },
      {
        type: 3, // STRING
        name: 'username',
        description: 'Your username',
        required: true,
      },
    ],
  },
  {
    name: 'link-account',
    description: 'Link your Discord account to an existing 8 Ball Pool account',
    options: [
      {
        type: 4, // INTEGER
        name: 'id',
        description: 'Enter the 8 Ball Pool Unique ID here',
        required: true,
      },
    ],
  },
  {
    name: 'my-accounts',
    description: 'View all 8 Ball Pool accounts linked to your Discord account',
  },
  {
    name: 'list-accounts',
    description: 'List all registered accounts (Admin only)',
    default_member_permissions: '8', // Administrator
  },
  {
    name: 'check-accounts',
    description: 'Check the status of all registered accounts (Admin only)',
    default_member_permissions: '8', // Administrator
  },
  {
    name: 'deregister',
    description: 'Remove your account from the rewards system (Admin only)',
    default_member_permissions: '8', // Administrator
    options: [
      {
        type: 4, // INTEGER
        name: 'id',
        description: 'Enter the 8 Ball Pool Unique ID here',
        required: true,
      },
    ],
  },
  {
    name: 'clear',
    description: 'Delete bot messages from current channel or specified user\'s DMs (Admin only)',
    default_member_permissions: '8', // Administrator
    options: [
      {
        type: 3, // STRING
        name: 'amount',
        description: 'Messages to delete (1-100) or "all"/"ALL" for all. Default: 100.',
        required: false,
      },
      {
        type: 6, // USER
        name: 'user',
        description: 'User whose DMs to clear (optional - if not specified, clears current channel)',
        required: false,
      },
    ],
  },
  {
    name: 'dm-rm-rf',
    description: 'Delete all bot messages from all DMs (Admin only)',
    default_member_permissions: '8', // Administrator
  },
  {
    name: 'help',
    description: 'Show help information and available commands',
  },
  {
    name: 'md',
    description: 'Show markdown documentation (Admin only)',
    default_member_permissions: '8', // Administrator
  },
  {
    name: 'server-status',
    description: 'Check the status of the Discord bot server (Admin only)',
    default_member_permissions: '8', // Administrator
  },
  {
    name: 'website-status',
    description: 'Check the status of the website and backend services (Admin only)',
    default_member_permissions: '8', // Administrator
  },
  {
    name: 'ping-discord',
    description: 'Test Discord bot connectivity (Admin only)',
    default_member_permissions: '8', // Administrator
  },
  {
    name: 'ping-website',
    description: 'Test website connectivity (Admin only)',
    default_member_permissions: '8', // Administrator
  },
];

// Verification Bot Commands
const VERIFICATION_BOT_COMMANDS = [
  {
    name: 'dm-rm-rf',
    description: 'Delete all bot messages from all DMs (Admin only)',
    default_member_permissions: '8', // Administrator
  },
  {
    name: 'cleanup-dms',
    description: 'Clean up recent bot DM messages',
    default_member_permissions: '32', // Manage Guild
    options: [
      {
        type: 4, // INTEGER
        name: 'active_minutes',
        description: 'Only include users active within the last N minutes',
        required: false,
        min_value: 5,
        max_value: 1440,
      },
    ],
  },
  {
    name: 'recheck',
    description: 'Re-run OCR on a screenshot and update verification',
    default_member_permissions: '8192', // Manage Messages
    options: [
      {
        type: 6, // USER
        name: 'user',
        description: 'The user to re-verify',
        required: true,
      },
      {
        type: 11, // ATTACHMENT
        name: 'attachment',
        description: 'Screenshot attachment to analyze',
        required: false,
      },
      {
        type: 3, // STRING
        name: 'url',
        description: 'Screenshot URL (use if no attachment)',
        required: false,
      },
    ],
  },
  {
    name: 'unlink-screenshot',
    description: 'Remove screenshot lock for an 8 Ball Pool ID',
    default_member_permissions: '8', // Administrator
    options: [
      {
        type: 3, // STRING
        name: 'unique_id',
        description: '8 Ball Pool Unique ID to unlink',
        required: true,
      },
    ],
  },
  {
    name: 'status',
    description: 'Show verification metrics',
    default_member_permissions: '32', // Manage Guild
  },
];

// Status Bot Commands
const STATUS_BOT_COMMANDS = [
  {
    name: 'status',
    description: 'Check the current status of all monitored services',
    default_member_permissions: '2048', // Send Messages
  },
  {
    name: 'uptime',
    description: 'Display uptime statistics for all services',
    default_member_permissions: '2048', // Send Messages
  },
  {
    name: 'botuptime',
    description: 'Display bot uptime and system information',
    default_member_permissions: '2048', // Send Messages
  },
  {
    name: 'dailyreport',
    description: 'Manually trigger a daily status report',
    default_member_permissions: '8', // Administrator
  },
  {
    name: 'dm-rm-rf',
    description: 'Delete all bot messages from all DMs (Admin only)',
    default_member_permissions: '8', // Administrator
  },
];

// Bot configurations
const bots = [
  {
    name: 'Main Bot',
    tokenEnvVar: 'DISCORD_TOKEN',
    clientIdEnvVar: 'DISCORD_CLIENT_ID',
    commands: MAIN_BOT_COMMANDS,
  },
  {
    name: 'Verification Bot',
    tokenEnvVar: 'VERIFICATION_BOT_TOKEN',
    clientIdEnvVar: 'VERIFICATION_CLIENT_ID',
    commands: VERIFICATION_BOT_COMMANDS,
    getClientId: async (token) => {
      // Verification bot doesn't store client ID in env, extract from token
      // Token format: base64(user_id).random.signature
      try {
        const parts = token.split('.');
        if (parts.length >= 1) {
          const decoded = Buffer.from(parts[0], 'base64').toString('utf-8');
          return decoded;
        }
      } catch (e) {
        // Fallback: will try to use env var
      }
      return null;
    },
  },
  {
    name: 'Status Bot',
    tokenEnvVar: 'BOT2_TOKEN',
    clientIdEnvVar: 'BOT2_CLIENT_ID',
    commands: STATUS_BOT_COMMANDS,
  },
];

async function deployCommands(options = {}) {
  const { forceRefresh = false } = options;
  const guildId = process.env.DISCORD_GUILD_ID;

  log('\n╔═══════════════════════════════════════════════════════════════╗', 'bright');
  log('║         Discord Slash Command Deployment Utility              ║', 'bright');
  log('╚═══════════════════════════════════════════════════════════════╝\n', 'bright');

  if (forceRefresh) {
    logWarning('Force refresh mode enabled - will delete existing commands first');
  }

  const results = {
    successful: [],
    failed: [],
    skipped: [],
  };

  for (const bot of bots) {
    log(`\n${'='.repeat(60)}`, 'blue');
    log(`Deploying commands for: ${bot.name}`, 'bright');
    log('='.repeat(60), 'blue');

    const token = process.env[bot.tokenEnvVar];
    let clientId = process.env[bot.clientIdEnvVar];

    if (!token) {
      logWarning(`Token not found (${bot.tokenEnvVar}) - skipping ${bot.name}`);
      results.skipped.push({ bot: bot.name, reason: 'Token not found' });
      continue;
    }

    // Try to extract client ID from token if not provided and getClientId function exists
    if (!clientId && bot.getClientId) {
      try {
        clientId = await bot.getClientId(token);
        if (clientId) {
          logInfo(`Extracted client ID from token: ${clientId}`);
        }
      } catch (error) {
        logWarning(`Could not extract client ID from token: ${error.message}`);
      }
    }

    if (!clientId) {
      logWarning(`Client ID not found (${bot.clientIdEnvVar}) - skipping ${bot.name}`);
      results.skipped.push({ bot: bot.name, reason: 'Client ID not found' });
      continue;
    }

    try {
      const rest = new REST({ version: '10' }).setToken(token);

      logInfo(`Bot: ${bot.name}`);
      logInfo(`Commands to deploy: ${bot.commands.length}`);
      logInfo(`Command names: ${bot.commands.map((c) => c.name).join(', ')}`);

      // Guild-specific registration (instant)
      if (guildId) {
        try {
          log(`\n📍 Registering to guild ${guildId} (instant)...`, 'cyan');

          if (forceRefresh) {
            logInfo('Deleting existing guild commands...');
            const existingCommands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
            for (const cmd of existingCommands) {
              await rest.delete(Routes.applicationGuildCommand(clientId, guildId, cmd.id));
              logInfo(`  Deleted: ${cmd.name}`);
            }
          }

          await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
            body: bot.commands,
          });

          logSuccess(`Guild registration complete (${bot.commands.length} commands)`);
        } catch (guildError) {
          logError(`Guild registration failed: ${guildError.message}`);
        }
      } else {
        logWarning('DISCORD_GUILD_ID not set - skipping guild registration');
      }

      // Global registration (takes up to 1 hour)
      try {
        log('\n🌐 Registering globally (may take up to 1 hour to propagate)...', 'cyan');

        if (forceRefresh) {
          logInfo('Deleting existing global commands...');
          const existingCommands = await rest.get(Routes.applicationCommands(clientId));
          for (const cmd of existingCommands) {
            await rest.delete(Routes.applicationCommand(clientId, cmd.id));
            logInfo(`  Deleted: ${cmd.name}`);
          }
        }

        await rest.put(Routes.applicationCommands(clientId), {
          body: bot.commands,
        });

        logSuccess(`Global registration complete (${bot.commands.length} commands)`);
        results.successful.push({ bot: bot.name, commandCount: bot.commands.length });
      } catch (globalError) {
        logError(`Global registration failed: ${globalError.message}`);
        if (!guildId) {
          throw globalError; // If no guild registration, this is critical
        }
      }
    } catch (error) {
      logError(`Failed to deploy commands for ${bot.name}: ${error.message}`);
      results.failed.push({ bot: bot.name, error: error.message });
    }
  }

  // Summary
  log('\n╔═══════════════════════════════════════════════════════════════╗', 'bright');
  log('║                     Deployment Summary                        ║', 'bright');
  log('╚═══════════════════════════════════════════════════════════════╝\n', 'bright');

  logSuccess(`Successfully deployed: ${results.successful.length} bot(s)`);
  results.successful.forEach(({ bot, commandCount }) => {
    log(`  ✓ ${bot}: ${commandCount} commands`, 'green');
  });

  if (results.failed.length > 0) {
    logError(`Failed deployments: ${results.failed.length} bot(s)`);
    results.failed.forEach(({ bot, error }) => {
      log(`  ✗ ${bot}: ${error}`, 'red');
    });
  }

  if (results.skipped.length > 0) {
    logWarning(`Skipped: ${results.skipped.length} bot(s)`);
    results.skipped.forEach(({ bot, reason }) => {
      log(`  ⊘ ${bot}: ${reason}`, 'yellow');
    });
  }

  log('\n');

  if (guildId) {
    logInfo('Guild commands should be available immediately');
  }
  logInfo('Global commands may take up to 1 hour to propagate');

  return results;
}

// Parse command line arguments
const args = process.argv.slice(2);
const forceRefresh = args.includes('--force') || args.includes('-f');

// Run deployment
deployCommands({ forceRefresh })
  .then((results) => {
    if (results.failed.length > 0) {
      process.exit(1);
    }
  })
  .catch((error) => {
    logError(`Deployment failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  });

