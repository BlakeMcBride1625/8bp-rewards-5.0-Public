# 🔧 Troubleshooting & Advanced Topics

Complete troubleshooting guide and advanced configuration for the 8BP Rewards System.

## 📋 Table of Contents

1. [Common Issues](#common-issues)
2. [Database Issues](#database-issues)
3. [Docker Issues](#docker-issues)
4. [Discord/Telegram Issues](#discordtelegram-issues)
5. [Claimer Issues](#claimer-issues)
6. [Network & Port Issues](#network--port-issues)
7. [Advanced Configuration](#advanced-configuration)

---

## Common Issues

### Claims Not Working

**Symptoms:**
- Claims fail immediately
- No screenshots captured
- WebSocket shows "Disconnected"

**Solutions:**
1. **Check PostgreSQL Connection**
   ```bash
   # Docker
   docker-compose exec postgres psql -U admin -d 8bp_rewards -c "SELECT NOW();"
   
   # Host
   systemctl status postgresql
   ```

2. **Verify Browser Concurrency**
   - Check `browser-pool.js` max concurrency setting
   - Reduce if seeing "Target closed" errors

3. **Check Playwright Installation**
   ```bash
   # In Docker
   docker-compose exec backend npx playwright install chromium
   
   # On Host
   npx playwright install chromium
   ```

4. **Verify Claimer Service Running**
   ```bash
   # Docker
   docker-compose ps claimer
   docker-compose logs claimer
   ```

### WebSocket Disconnected

**Symptoms:**
- Frontend shows "Disconnected" status
- Real-time updates not working

**Solutions:**
1. **Check Backend WebSocket Service**
   ```bash
   docker-compose logs backend | grep -i websocket
   ```

2. **Verify WebSocket URL**
   - Frontend should use `window.location.host` for dynamic URL
   - Check `frontend/src/config/api.ts`

3. **Check Network Configuration**
   - Ensure WebSocket path matches backend: `/8bp-rewards/socket.io`

### Admin Dashboard 500 Errors

**Symptoms:**
- Dashboard returns 500 errors
- Tables missing errors

**Solutions:**
1. **Check Database Tables**
   ```bash
   docker-compose exec postgres psql -U admin -d 8bp_rewards -c "\dt"
   ```

2. **Run Missing Migrations**
   ```bash
   docker-compose exec postgres psql -U admin -d 8bp_rewards -f /app/migrations/add_validation_system_simple.sql
   docker-compose exec postgres psql -U admin -d 8bp_rewards -f /app/migrations/add_vps_storage.sql
   ```

3. **Check Service Communication**
   - Verify `DISCORD_BOT_SERVICE_URL=http://discord-api:2700` in docker-compose.yml

---

## Database Issues

### Connection Refused

**Symptoms:**
- Backend can't connect to database
- `ECONNREFUSED` errors in logs

**Solutions:**

**Docker:**
```env
POSTGRES_HOST=postgres  # Must be 'postgres' for Docker network
```

**Host:**
```env
POSTGRES_HOST=localhost
```

**Check Connection:**
```bash
# Docker
docker-compose exec backend node -e "
const {Pool} = require('pg');
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD
});
pool.query('SELECT NOW()').then(r => console.log('✅ Connected:', r.rows[0])).catch(e => console.error('❌ Error:', e.message));
"
```

### Tables Missing

**Symptoms:**
- `relation "table_name" does not exist`
- 500 errors on admin dashboard

**Solutions:**
```bash
# Initialize database
docker-compose exec postgres psql -U admin -d 8bp_rewards -f /app/scripts/init-postgres.sql

# Run migrations
docker-compose exec postgres psql -U admin -d 8bp_rewards -f /app/migrations/add_validation_system_simple.sql
docker-compose exec postgres psql -U admin -d 8bp_rewards -f /app/migrations/add_vps_storage.sql
```

### Database Locked or Slow

**Symptoms:**
- Queries timeout
- Database locked errors

**Solutions:**
```bash
# Check active connections
docker-compose exec postgres psql -U admin -d 8bp_rewards -c "SELECT count(*) FROM pg_stat_activity;"

# Check for locks
docker-compose exec postgres psql -U admin -d 8bp_rewards -c "SELECT * FROM pg_locks WHERE NOT granted;"

# Restart database
docker-compose restart postgres
```

---

## Docker Issues

### Containers Won't Start

**Symptoms:**
- `docker-compose up` fails
- Containers exit immediately

**Solutions:**
1. **Check Logs**
   ```bash
   docker-compose logs
   ```

2. **Verify .env File**
   ```bash
   # Ensure all required variables are set
   cat .env | grep -E "POSTGRES_|DISCORD_|NODE_ENV"
   ```

3. **Rebuild Containers**
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

### Port Conflicts

**Symptoms:**
- `address already in use`
- Can't bind to port

**Solutions:**
```bash
# Check what's using the port
sudo lsof -i :2600
sudo netstat -tulpn | grep 2600

# Stop conflicting service or change port in .env
BACKEND_PORT=2601  # Use different port
```

### Volume Issues

**Symptoms:**
- Data not persisting
- Permission errors

**Solutions:**
```bash
# Check volume mounts
docker-compose exec backend ls -la /app/logs
docker-compose exec backend ls -la /app/screenshots

# Fix permissions
docker-compose exec backend chmod -R 775 /app/logs /app/screenshots
```

---

## Discord/Telegram Issues

### Discord Bot Offline

**Symptoms:**
- Bot not responding
- Commands not working

**Solutions:**
1. **Verify Token**
   ```bash
   # Check token in .env
   grep DISCORD_TOKEN .env
   
   # Test token validity
   curl -H "Authorization: Bot YOUR_TOKEN" https://discord.com/api/v10/users/@me
   ```

2. **Check Bot Service**
   ```bash
   docker-compose logs discord-api
   ```

3. **Verify Intents**
   - Go to Discord Developer Portal
   - Bot → Privileged Gateway Intents
   - Enable required intents

### OAuth Not Working

**Symptoms:**
- Can't login via Discord
- Redirect errors

**Solutions:**
1. **Check Redirect URI**
   ```env
   OAUTH_REDIRECT_URI=https://yourdomain.com/8bp-rewards/auth/discord/callback
   ```

2. **Verify Discord Configuration**
   - Check Developer Portal → OAuth2 → Redirects
   - Ensure production URI is added

3. **Check Backend Logs**
   ```bash
   docker-compose logs backend | grep -i oauth
   ```

### Email Not Sending

**Symptoms:**
- "Failed to send email code"
- 400 errors

**Solutions:**
1. **Check SMTP Configuration**
   ```env
   SMTP_HOST=your_smtp_host
   SMTP_PORT=587
   SMTP_USER=your_user
   SMTP_PASS=your_password
   SMTP_SECURE=false
   MAIL_FROM=noreply@yourdomain.com
   ```

2. **Verify Email Mapping**
   ```env
   # For user-specific emails
   DISCORD_TO_EMAIL_MAPPING=discord_id1:email1@example.com,discord_id2:email2@example.com
   
   # Or single email
   ADMIN_EMAILS=admin@example.com
   ```

3. **Check Email Service Logs**
   ```bash
   docker-compose logs backend | grep -i email
   ```

---

## Claimer Issues

### Playwright Timeouts

**Symptoms:**
- `Timeout 20000ms exceeded`
- `Target page closed`

**Solutions:**
1. **Reduce Concurrency**
   - Edit `browser-pool.js`
   - Lower `maxConcurrent` (try 3-5)

2. **Increase Timeout**
   ```env
   TIMEOUT=30000  # Increase to 30 seconds
   ```

3. **Check System Resources**
   ```bash
   # Check CPU and memory
   docker stats
   
   # If resources low, reduce concurrency further
   ```

### Browser Executable Not Found

**Symptoms:**
- `Executable doesn't exist`
- `ENOENT` errors

**Solutions:**
```bash
# Ensure Playwright browsers installed
docker-compose exec backend npx playwright install chromium

# Verify browser path
docker-compose exec backend ls -la /ms-playwright/chromium-*/
```

### Claims Not Saving

**Symptoms:**
- Claims complete but not in database
- Leaderboard not updating

**Solutions:**
1. **Check Database Connection**
   ```bash
   docker-compose exec postgres psql -U admin -d 8bp_rewards -c "SELECT COUNT(*) FROM claim_records;"
   ```

2. **Verify Claimer Logs**
   ```bash
   docker-compose logs claimer | grep -i "claim\|error"
   ```

3. **Check WebSocket Connection**
   - Verify frontend connected
   - Check backend WebSocket service

---

## Network & Port Issues

### Port Already in Use

**Solutions:**
```bash
# Find what's using the port
./scripts/system/check-port-conflicts.sh

# Or manually
sudo lsof -i :2600
sudo fuser -k 2600/tcp  # Kill process (careful!)
```

### Cloudflare Tunnel Not Working

**Symptoms:**
- Site not accessible
- Tunnel service down

**Solutions:**
```bash
# Check tunnel status
sudo systemctl status cloudflared-tunnel

# View logs
sudo journalctl -u cloudflared-tunnel -f

# Restart tunnel
sudo systemctl restart cloudflared-tunnel

# Verify configuration
cloudflared tunnel list
cat ~/.cloudflared/config.yml
```

---

## Advanced Configuration

### Manual Claim Setup

The system supports three manual claim methods:

1. **Claim All Users**
   - Processes all registered users
   - Accessible from Admin Dashboard

2. **Single User Claim**
   - Enter any user ID
   - Use input field in Admin Dashboard

3. **Test User Quick Claims**
   - Pre-configured buttons
   - Configure via `TEST_USERS` environment variable:
   ```env
   TEST_USERS=[{"id":"1826254746","username":"TestUser1","description":"Primary test user"}]
   ```

### Progress Tracker

Real-time claim progress tracking:
- Auto-refreshes every 2 seconds
- Shows step-by-step progress
- Live console logs
- Visual progress indicators

### Scheduler Configuration

Scheduled claims run 4 times daily:
- Times: 00:00, 06:00, 12:00, 18:00 UTC
- Configured in `SchedulerService.ts`
- Logs to Discord channel if configured

### VPS Monitor Configuration

VPS Monitor provides real-time system metrics:
- CPU usage
- Memory usage
- Network stats
- Process information

**Access Requirements:**
- User must be in `ALLOWED_VPS_ADMINS`
- Multi-factor authentication required
- Codes expire after 5 minutes

### Screenshot Management

Screenshots organised by stage:
- `confirmation/` - Final confirmation images
- `shop-page/` - Shop page screenshots
- `id-entry/` - ID entry screenshots
- `go-click/` - Go button clicks
- `login/` - Login screenshots

**Permissions:**
```bash
chmod -R 775 screenshots/
```

**Cleanup:**
- Clear per-user: Admin Dashboard → Screenshots
- Clear all: Use admin endpoint (requires auth)

---

## Performance Tuning

### Database Optimisation

```sql
-- Add indexes if missing
CREATE INDEX IF NOT EXISTS idx_claim_records_user ON claim_records(eight_ball_pool_id);
CREATE INDEX IF NOT EXISTS idx_claim_records_date ON claim_records(claimed_at);
CREATE INDEX IF NOT EXISTS idx_registrations_active ON registrations(is_active) WHERE is_active = true;
```

### Browser Concurrency

Adjust in `browser-pool.js`:
```javascript
const maxConcurrent = 6;  // Reduce for stability, increase for speed
```

### Timeouts

```env
TIMEOUT=20000              # Page load timeout
DELAY_BETWEEN_USERS=10000  # Delay between users
```

---

## Log Analysis

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f claimer

# Filter by keyword
docker-compose logs backend | grep -i error
docker-compose logs claimer | grep -i "claim\|failed"
```

### Log Locations

- **Backend**: `/app/logs/` or `logs/backend.log`
- **Frontend**: `logs/frontend.log`
- **Systemd**: `journalctl -u 8bp-rewards-backend -f`

---

## Recovery Procedures

### Database Backup

```bash
# Create backup
docker-compose exec postgres pg_dump -U admin 8bp_rewards > backup_$(date +%Y%m%d).sql

# Restore from backup
docker-compose exec -T postgres psql -U admin -d 8bp_rewards < backup_20251103.sql
```

### Full System Restart

```bash
# Stop all
docker-compose down

# Clean volumes (if needed - WARNING: deletes data!)
docker-compose down -v

# Rebuild and start
docker-compose up -d --build
```

### Reset Specific Service

```bash
# Restart single service
docker-compose restart backend

# Rebuild and restart
docker-compose up -d --build backend
```

---

*Last Updated: November 3, 2025*

