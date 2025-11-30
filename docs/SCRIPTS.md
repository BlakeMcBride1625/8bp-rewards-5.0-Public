# Scripts Directory

This directory contains utility scripts for managing and deploying the Discord bots.

## Discord Bot Management Scripts

### deploy-commands.js
Universal Discord slash command deployment utility for all three bots.

**Purpose:** Deploys slash commands for Main Bot, Verification Bot, and Status Bot.

**Features:**
- Registers commands both guild-specific (instant) and globally (1 hour propagation)
- Validates command definitions before deployment
- Auto-extracts client ID from token for Verification Bot
- Provides detailed summary reports
- Supports force refresh mode

**Usage:**
```bash
# Normal deployment
node scripts/deploy-commands.js

# Force refresh (deletes existing commands first)
node scripts/deploy-commands.js --force
```

**Requirements:**
- `.env` file with bot tokens and client IDs
- `@discordjs/rest` and `discord-api-types` npm packages (already installed)

**Output:**
- Detailed deployment progress for each bot
- Success/failure status for guild and global registrations
- Summary of total commands deployed

---

### validate-bot-env.js
Environment variable validation for all Discord bots.

**Purpose:** Validates that all required environment variables are set.

**Features:**
- Checks required variables for all three bots
- Supports fallback variable names
- Masks sensitive data (tokens, URLs)
- Clear error messages for missing variables
- Exit code 0 for success, 1 for failure

**Usage:**
```bash
node scripts/validate-bot-env.js
```

**Validates:**

**Main Bot:**
- DISCORD_TOKEN (required)
- DISCORD_CLIENT_ID (required)
- DISCORD_GUILD_ID (optional)

**Verification Bot:**
- VERIFICATION_BOT_TOKEN (required)
- VERIFICATION_DATABASE_URL (required)
- VERIFICATION_RANK_CHANNEL_ID (required, fallback: RANK_CHANNEL_ID)
- VERIFICATION_STAFF_EVIDENCE_CHANNEL_ID (required, fallback: STAFF_EVIDENCE_CHANNEL_ID)
- VERIFICATION_GUILD_ID (optional, fallback: GUILD_ID)

**Status Bot:**
- BOT2_TOKEN (required)
- BOT2_CLIENT_ID (required)
- BOT2_GUILD_ID (optional)
- BOT2_STATUS_CHANNEL_ID (optional)

---

## Other Scripts

### system/deploy.sh
System-wide deployment script for the entire application including backend, frontend, and bots.

### system/check-services.sh
Health check script for all running services.

---

## Best Practices

1. **Before Deploying Commands:**
   ```bash
   # Validate environment first
   node scripts/validate-bot-env.js
   
   # Then deploy commands
   node scripts/deploy-commands.js
   ```

2. **After Bot Code Changes:**
   - Rebuild bots if using TypeScript (Verification Bot, Status Bot)
   - Deploy commands with `--force` flag if command definitions changed
   - Restart bot services

3. **Troubleshooting:**
   - Check validation script output for missing variables
   - Use `--force` flag if commands seem out of sync
   - Guild commands appear instantly, global takes up to 1 hour
   - Check bot logs for detailed error messages

---

## Quick Reference

```bash
# Validate environment
node scripts/validate-bot-env.js

# Deploy all bot commands
node scripts/deploy-commands.js

# Force refresh all commands
node scripts/deploy-commands.js --force

# Deploy full application
bash scripts/system/deploy.sh
```

---

## Related Documentation

- [SLASH_COMMANDS_FIX_SUMMARY.md](../SLASH_COMMANDS_FIX_SUMMARY.md) - Recent slash command fixes
- [docs/DEPLOYMENT_CHECKLIST.md](../docs/DEPLOYMENT_CHECKLIST.md) - Full deployment guide
- [docs/TROUBLESHOOTING.md](../docs/TROUBLESHOOTING.md) - Common issues and solutions
