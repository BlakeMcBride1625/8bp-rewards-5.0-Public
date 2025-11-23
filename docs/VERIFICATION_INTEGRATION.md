# Verification Bot Integration

This document describes the integration of the 8 Ball Pool Account Verification system into the Rewards system.

## Overview

The verification bot is now integrated as a separate service within the rewards system. It runs independently with its own Discord bot token and database, while syncing verification data to the rewards registration system.

## Environment Variables

### Required for Verification Bot

```env
# Verification Bot Token (separate from main rewards bot)
VERIFICATION_BOT_TOKEN=your_verification_bot_token_here

# Verification Database (separate PostgreSQL database)
VERIFICATION_DATABASE_URL=postgresql://user:password@localhost:5432/accountchecker?schema=public

# Discord Channel IDs
VERIFICATION_RANK_CHANNEL_ID=your_rank_channel_id_here
VERIFICATION_STAFF_EVIDENCE_CHANNEL_ID=your_staff_evidence_channel_id_here

# Discord Server ID (optional, for faster command registration)
VERIFICATION_GUILD_ID=your_guild_id_here

# Admin and Moderator IDs (comma-separated)
VERIFICATION_ADMIN_IDS=comma,separated,admin,ids
VERIFICATION_MODERATOR_IDS=comma,separated,mod,ids

# OpenAI API Key (for OCR/Vision API)
OPENAI_API_KEY=your_openai_api_key_here

# Rewards API URL (for syncing verification data)
REWARDS_API_URL=http://backend:2600
```

### Notes

- `VERIFICATION_BOT_TOKEN` is separate from the main `DISCORD_TOKEN` used by the rewards bot
- The verification bot uses its own database (separate from the rewards database)
- Successful verifications automatically sync to the rewards registration system
- All verification bot environment variables are prefixed with `VERIFICATION_` to avoid conflicts

## Database Schema

### Rewards Database Additions

The following columns have been added to the `registrations` table:

- `account_level` (INTEGER) - Account level from verification
- `account_rank` (VARCHAR) - Rank name from verification
- `verified_at` (TIMESTAMP) - When the account was verified
- `discord_id` (VARCHAR) - Discord user ID (already existed, now used for verification)

### Verification Database

The verification bot uses its own Prisma-managed PostgreSQL database with the following main tables:

- `verifications` - Verification records
- `users` - Discord user information
- `pool_accounts` - 8BP account information
- `screenshot_locks` - Screenshot deduplication
- `verification_events` - Audit log of verification attempts

## Service Flow

1. User uploads screenshot to Discord verification channel
2. Verification bot processes image using OpenAI Vision API
3. Bot extracts: level, rank name, unique ID
4. Bot assigns Discord role based on rank
5. Bot stores verification data in verification database
6. Bot calls `/api/internal/verification/sync` to sync data to rewards system
7. Rewards system creates/updates registration with verification data

## Leaderboard Integration

The leaderboard now includes account level and rank information from verifications:

- `account_level` - Displayed in leaderboard response
- `account_rank` - Displayed in leaderboard response
- Leaderboard can be sorted by level (in addition to existing sorting by items claimed)

## Docker Setup

The verification bot runs as a separate Docker service:

```yaml
verification-bot:
  build:
    context: .
    dockerfile: Dockerfile.verification-bot
  container_name: 8bp-verification-bot
  environment:
    - VERIFICATION_BOT_TOKEN=${VERIFICATION_BOT_TOKEN}
    # ... other env vars
  depends_on:
    - backend
    - postgres
```

## Files Structure

```
8bp-rewards/
├── services/
│   └── verification-bot/          # Verification bot service
│       ├── src/
│       │   ├── bot.ts             # Bot entry point
│       │   ├── commands/          # Slash commands
│       │   ├── events/            # Discord events
│       │   └── services/          # Bot services
│       ├── prisma/
│       │   └── schema.prisma      # Verification DB schema
│       ├── package.json
│       └── tsconfig.json
├── backend/
│   └── src/
│       ├── routes/
│       │   └── verification.ts    # Internal API for sync
│       └── services/
│           └── VerificationSyncService.ts  # Sync service
├── docker-compose.yml             # Updated with verification-bot service
└── Dockerfile.verification-bot    # Verification bot Dockerfile
```

## Testing

To test the integration:

1. Ensure all environment variables are set
2. Start Docker containers: `docker-compose up -d`
3. Upload a screenshot to the verification channel
4. Verify that:
   - Bot processes the screenshot
   - Discord role is assigned
   - Verification data appears in verification database
   - Registration is created/updated in rewards database
   - Account level appears in leaderboard

## Rollback

If issues occur:

1. Stop verification-bot service: `docker-compose stop verification-bot`
2. Remove verification-bot service from docker-compose.yml
3. The rewards system will continue to function normally
4. Old verification system can be run separately if needed


