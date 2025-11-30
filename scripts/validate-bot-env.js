#!/usr/bin/env node

/**
 * Environment Variable Validation Script
 * 
 * Validates that all required environment variables are set for the Discord bots
 */

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Required environment variables for each bot
const botEnvVars = {
  'Main Bot': [
    { name: 'DISCORD_TOKEN', description: 'Main bot authentication token' },
    { name: 'DISCORD_CLIENT_ID', description: 'Main bot client/application ID' },
    { name: 'DISCORD_GUILD_ID', description: 'Guild ID for instant command registration', optional: true },
  ],
  'Verification Bot': [
    { name: 'VERIFICATION_BOT_TOKEN', description: 'Verification bot authentication token' },
    { name: 'VERIFICATION_DATABASE_URL', description: 'Database connection URL' },
    { name: 'VERIFICATION_RANK_CHANNEL_ID', description: 'Channel ID for rank verification', fallback: 'RANK_CHANNEL_ID' },
    { name: 'VERIFICATION_STAFF_EVIDENCE_CHANNEL_ID', description: 'Channel ID for staff evidence', fallback: 'STAFF_EVIDENCE_CHANNEL_ID' },
    { name: 'VERIFICATION_GUILD_ID', description: 'Guild ID for verification bot', optional: true, fallback: 'GUILD_ID' },
  ],
  'Status Bot': [
    { name: 'BOT2_TOKEN', description: 'Status bot authentication token' },
    { name: 'BOT2_CLIENT_ID', description: 'Status bot client/application ID' },
    { name: 'BOT2_GUILD_ID', description: 'Guild ID for status bot', optional: true },
    { name: 'BOT2_STATUS_CHANNEL_ID', description: 'Channel ID for status updates', optional: true },
  ],
};

function validateEnv() {
  log('\n╔═══════════════════════════════════════════════════════════════╗', 'bright');
  log('║           Environment Variable Validation                     ║', 'bright');
  log('╚═══════════════════════════════════════════════════════════════╝\n', 'bright');

  if (!fs.existsSync(envPath)) {
    log(`❌ .env file not found at: ${envPath}`, 'red');
    log(`\nℹ️ Please create a .env file based on env-template.txt`, 'cyan');
    return false;
  }

  log(`✓ .env file found: ${envPath}\n`, 'green');

  let hasErrors = false;
  let hasWarnings = false;

  for (const [botName, envVars] of Object.entries(botEnvVars)) {
    log(`${botName}:`, 'bright');

    for (const { name, description, optional, fallback } of envVars) {
      let value = process.env[name];
      
      // Check fallback if primary is not set
      if ((!value || value.trim() === '') && fallback) {
        value = process.env[fallback];
      }
      
      const prefix = optional ? '  [Optional]' : '  [Required]';

      if (!value || value.trim() === '') {
        if (optional) {
          log(`${prefix} ${name}: ⚠️ Not set - ${description}`, 'yellow');
          hasWarnings = true;
        } else {
          log(`${prefix} ${name}: ❌ Missing - ${description}`, 'red');
          hasErrors = true;
        }
      } else {
        // Mask sensitive tokens
        const displayValue = name.includes('TOKEN') || name.includes('URL')
          ? value.substring(0, 10) + '...' + value.substring(value.length - 4)
          : value;
        log(`${prefix} ${name}: ✅ ${displayValue}`, 'green');
      }
    }

    log(''); // Empty line between bots
  }

  // Summary
  log('═'.repeat(60), 'cyan');
  if (hasErrors) {
    log('\n❌ Validation failed: Required environment variables are missing', 'red');
    log('\nPlease add the missing variables to your .env file\n', 'yellow');
    return false;
  } else if (hasWarnings) {
    log('\n⚠️ Validation passed with warnings: Optional variables not set', 'yellow');
    log('The bots will function but some features may be limited\n', 'cyan');
    return true;
  } else {
    log('\n✅ All required environment variables are set!', 'green');
    log('Bots are ready to be deployed\n', 'cyan');
    return true;
  }
}

// Run validation
const isValid = validateEnv();
process.exit(isValid ? 0 : 1);

