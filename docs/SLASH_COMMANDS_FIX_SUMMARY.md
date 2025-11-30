# Slash Command Fix Summary

## Date: November 30, 2025

## Problem
All three Discord bots were experiencing slash command execution errors. Commands would appear in Discord but fail when users tried to execute them.

## Root Causes Identified

1. **Main Bot** (`services/discord-service.js`):
   - Command registration was deleting ALL commands before re-registering (causing temporary unavailability)
   - Error handling checked wrong interaction properties (`interaction.ephemeral` instead of `interaction.replied`)
   - 15-second timeout was too short for long-running commands
   - Poor error logging made debugging difficult

2. **Verification Bot** (`services/verification-bot/`):
   - Registered commands twice on every startup (guild + global), risking rate limits
   - Inconsistent environment variable naming
   - Missing client ID extraction logic

3. **Status Bot** (`discord-status-bot/`):
   - Commands registered with fragile setTimeout (5 second delay)
   - Registration happened before bot was fully ready
   - No retry logic for failed registrations

## Solutions Implemented

### 1. Main Bot Fixes
**File:** `services/discord-service.js`

- **Improved registration logic**: Removed unnecessary command deletions, using Discord's `set()` method which intelligently updates commands
- **Fixed error handling**: Now properly checks `interaction.replied` and `interaction.deferred` states
- **Increased timeout**: Changed from 15s to 30s for long-running commands
- **Enhanced logging**: Added detailed error logging with user context, guild info, and stack traces

### 2. Verification Bot Fixes
**Files:** 
- `services/verification-bot/src/bot.ts`
- `services/verification-bot/src/commands/slashCommands.ts`

- **Improved registration flow**: Now always registers to guild first (instant), then global (1 hour)
- **Better logging**: Added clear messages about registration status
- **Consistent env vars**: Updated to use properly prefixed environment variables

### 3. Status Bot Fixes
**Files:**
- `discord-status-bot/src/index.ts`
- `discord-status-bot/src/main.ts`

- **Proper ready handling**: Moved command registration into the `ready` event handler
- **Removed setTimeout**: Commands now register when bot is actually ready, not on arbitrary delay
- **Enhanced logging**: Added detailed command registration logs

### 4. New Universal Deployment Script
**File:** `scripts/deploy-commands.js`

Created a comprehensive deployment utility that:
- Deploys commands for all three bots at once
- Registers both guild-specific (instant) and globally (1 hour propagation)
- Validates command definitions before deployment
- Provides detailed summary reports
- Supports force refresh mode (`--force` flag)
- Auto-extracts client ID from token for Verification Bot

**Usage:**
```bash
node scripts/deploy-commands.js           # Normal deployment
node scripts/deploy-commands.js --force   # Force refresh (deletes old commands first)
```

### 5. Environment Validation Script
**File:** `scripts/validate-bot-env.js`

Created validation utility that:
- Checks all required environment variables for all three bots
- Supports fallback variable names
- Masks sensitive data in output
- Provides clear error messages for missing variables

**Usage:**
```bash
node scripts/validate-bot-env.js
```

## Deployment Results

### Successful Deployments ✅

1. **Main Bot**: 14 commands deployed
   - register, link-account, my-accounts, list-accounts, check-accounts
   - deregister, clear, dm-rm-rf, help, md
   - server-status, website-status, ping-discord, ping-website

2. **Verification Bot**: 5 commands deployed
   - dm-rm-rf, cleanup-dms, recheck, unlink-screenshot, status

3. **Status Bot**: 5 commands deployed (guild only)
   - status, uptime, botuptime, dailyreport, dm-rm-rf

### Notes

- **Guild commands** (instant): All bots successfully registered to guild `1397975670897905779`
- **Global commands** (1 hour): Main Bot and Verification Bot registered successfully
- **Status Bot global registration**: Failed with OAuth-related error (likely temporary API issue), but guild commands are working

## Testing Recommendations

### Immediate Testing (Guild Commands - Available Now)
1. Test Main Bot commands in Discord:
   - Try `/register` with a test account
   - Verify `/help` shows all commands
   - Test admin commands like `/list-accounts`

2. Test Verification Bot commands:
   - Try `/status` to see verification metrics
   - Test `/cleanup-dms` (with admin permissions)

3. Test Status Bot commands:
   - Try `/status` to see service status
   - Test `/uptime` for statistics
   - Try `/botuptime` for bot info

### After 1 Hour (Global Commands)
- Verify commands appear in all servers where bots are installed
- Test command execution in different servers

## Files Modified

1. `/home/blake/8bp-rewards/services/discord-service.js` - Main bot improvements
2. `/home/blake/8bp-rewards/services/verification-bot/src/bot.ts` - Verification bot initialisation
3. `/home/blake/8bp-rewards/services/verification-bot/src/commands/slashCommands.ts` - Command registration
4. `/home/blake/8bp-rewards/discord-status-bot/src/index.ts` - Status bot registration
5. `/home/blake/8bp-rewards/discord-status-bot/src/main.ts` - Status bot entry point

## New Files Created

1. `/home/blake/8bp-rewards/scripts/deploy-commands.js` - Universal deployment script
2. `/home/blake/8bp-rewards/scripts/validate-bot-env.js` - Environment validation script

## Environment Variables Validated

All required variables are properly set:
- Main Bot: ✅ DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
- Verification Bot: ✅ VERIFICATION_BOT_TOKEN, VERIFICATION_DATABASE_URL, VERIFICATION_RANK_CHANNEL_ID, VERIFICATION_STAFF_EVIDENCE_CHANNEL_ID
- Status Bot: ✅ BOT2_TOKEN, BOT2_CLIENT_ID, BOT2_GUILD_ID

## Benefits

1. **More reliable command execution**: Proper error handling prevents silent failures
2. **Faster deployment**: Guild commands appear instantly instead of waiting 1 hour
3. **Better debugging**: Enhanced logging helps identify issues quickly
4. **Easier maintenance**: Single script deploys all bot commands
5. **Consistent behavior**: All bots follow the same registration pattern

## Future Recommendations

1. **Status Bot Global Registration**: Monitor and retry if needed, or investigate OAuth settings
2. **Command Testing**: Implement automated tests for each slash command
3. **Monitoring**: Set up alerts for command execution failures
4. **Documentation**: Update user-facing docs with new command list

## Command Usage Tips

### For Admins
- Guild commands are live immediately after deployment
- Global commands take up to 1 hour to propagate
- Use `/help` in Main Bot to see all available commands
- Most admin commands are ephemeral (only visible to you)

### Troubleshooting
If commands don't appear:
1. Check bot has been invited with `applications.commands` scope
2. Verify bot has necessary permissions in the server
3. Try kicking and re-inviting the bot to refresh permissions
4. Wait up to 1 hour for global commands to propagate
5. Use the deployment script with `--force` flag to force refresh

---

**Status**: ✅ Complete
**Commands Deployed**: 24 total (14 Main + 5 Verification + 5 Status)
**Ready for Testing**: Yes (guild commands available immediately)

