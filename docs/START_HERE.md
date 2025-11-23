# 🚀 Getting Started: Verification System Integration

## ✅ What's Done

- ✅ Verification bot code merged into `services/verification-bot/`
- ✅ Environment variables added to `.env`
- ✅ Docker configuration updated (`docker-compose.yml`)
- ✅ Old verification system shut down
- ✅ Integration services created

## 📋 Next Steps to Get Running

### Step 1: Create Verification Database

The verification bot needs its own database (`accountchecker`) on the same PostgreSQL service:

```bash
cd /home/blake/8bp-rewards

# Create the verification database
docker-compose exec postgres psql -U admin -c "CREATE DATABASE accountchecker;" 2>/dev/null || echo "Database may already exist"

# Verify it was created
docker-compose exec postgres psql -U admin -lqt | grep accountchecker
```

### Step 2: Run Database Migrations

#### 2a. Add Verification Fields to Rewards Database

Add `account_level`, `account_rank`, `verified_at`, and `discord_id` columns to the `registrations` table:

```bash
cd /home/blake/8bp-rewards

# Apply migration to rewards database
docker-compose exec postgres psql -U admin -d 8bp_rewards -f /path/to/migrations/add_verification_fields.sql

# Or manually run:
docker-compose exec -T postgres psql -U admin -d 8bp_rewards << EOF
ALTER TABLE registrations
ADD COLUMN IF NOT EXISTS discord_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS account_level INTEGER,
ADD COLUMN IF NOT EXISTS account_rank VARCHAR(255),
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_registrations_discord_id ON registrations (discord_id);
EOF
```

#### 2b. Run Prisma Migrations for Verification Bot

Set up the verification bot's database schema:

```bash
cd /home/blake/8bp-rewards/services/verification-bot

# Install dependencies (if not done)
npm install

# Generate Prisma client
npx prisma generate

# Run migrations to create verification bot tables
npx prisma migrate deploy
```

**Note:** You may need to set the DATABASE_URL environment variable:
```bash
export VERIFICATION_DATABASE_URL="postgresql://admin:192837DB25@localhost:5432/accountchecker?schema=public"
npx prisma migrate deploy
```

### Step 3: Build and Start Verification Bot

```bash
cd /home/blake/8bp-rewards

# Build the verification bot service
docker-compose build verification-bot

# Start all services (or just verification bot)
docker-compose up -d verification-bot

# Check if it's running
docker-compose ps verification-bot

# View logs
docker-compose logs -f verification-bot
```

### Step 4: Verify Everything Works

#### Check Services
```bash
# All services should be running
docker-compose ps

# Verify verification bot is connected
docker-compose logs verification-bot | grep -i "ready\|connected\|error" | tail -20
```

#### Test Verification Sync
1. Upload a screenshot to the verification channel in Discord
2. Check if verification bot processes it:
   ```bash
   docker-compose logs -f verification-bot
   ```
3. Verify data syncs to rewards system:
   ```bash
   docker-compose exec postgres psql -U admin -d 8bp_rewards -c "SELECT username, account_level, account_rank, verified_at FROM registrations WHERE account_level IS NOT NULL LIMIT 5;"
   ```

## 🔧 Troubleshooting

### If Verification Bot Won't Start

1. **Check environment variables:**
   ```bash
   docker-compose config | grep VERIFICATION
   ```

2. **Check database connection:**
   ```bash
   docker-compose exec verification-bot node -e "console.log(process.env.VERIFICATION_DATABASE_URL)"
   ```

3. **Check Prisma client:**
   ```bash
   docker-compose exec verification-bot ls -la services/verification-bot/node_modules/.prisma/client/
   ```

4. **View full error logs:**
   ```bash
   docker-compose logs verification-bot
   ```

### If Database Connection Fails

1. **Verify postgres service is healthy:**
   ```bash
   docker-compose ps postgres
   ```

2. **Test connection from verification bot container:**
   ```bash
   docker-compose exec verification-bot sh -c "apk add postgresql-client && psql \$VERIFICATION_DATABASE_URL -c 'SELECT 1;'"
   ```

### If Prisma Migrations Fail

1. **Check if database exists:**
   ```bash
   docker-compose exec postgres psql -U admin -lqt | grep accountchecker
   ```

2. **Manually run migrations:**
   ```bash
   cd services/verification-bot
   export VERIFICATION_DATABASE_URL="postgresql://admin:192837DB25@localhost:5432/accountchecker?schema=public"
   npx prisma migrate deploy
   ```

## 📊 Verification

### Quick Health Check

```bash
cd /home/blake/8bp-rewards

# Check all services
docker-compose ps

# Check verification bot logs for errors
docker-compose logs verification-bot --tail=50 | grep -i error

# Test API endpoint
curl http://localhost:2600/api/internal/verification/sync
```

### Expected Services Running

- ✅ `8bp-postgres` - Database (healthy)
- ✅ `8bp-backend` - Rewards API (healthy)
- ✅ `8bp-discord-api` - Discord API (healthy)
- ✅ `8bp-claimer` - Claimer service
- ✅ `8bp-status-bot` - Status monitoring
- ✅ `8bp-verification-bot` - Verification bot (NEW)

## 🎯 Success Criteria

You'll know everything is working when:

1. ✅ All Docker services start without errors
2. ✅ Verification bot connects to Discord (check logs for "Ready!")
3. ✅ Verification bot connects to database (no connection errors)
4. ✅ Uploading a screenshot to verification channel processes successfully
5. ✅ Verification data appears in rewards database (`account_level`, `account_rank` columns populated)
6. ✅ Leaderboard shows account levels for verified users

## 🆘 Need Help?

- Check `./VERIFICATION_INTEGRATION.md` for integration details
- Check `./MIGRATION_COMPLETE.md` for migration status
- Review logs: `docker-compose logs [service-name]`

---

**Ready to proceed? Start with Step 1 above!** 🚀


