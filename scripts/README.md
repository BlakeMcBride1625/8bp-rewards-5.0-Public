# Service Management Scripts

## Health Check Script

### `check-services.sh`
Quick health check for all critical services across your Docker projects.

**Usage:**
```bash
./scripts/check-services.sh
```

**What it checks:**
- 8bp-postgres (PostgreSQL Database)
- 8bp-backend (Backend API)
- 8bp-discord-api (Discord API)
- myhub-postgres (MyHub PostgreSQL)
- myhub-app (MyHub App)

**Exit codes:**
- `0` - All services healthy
- `1` - One or more services have issues

**Automatic Alerts:**
When services are down, the script automatically sends alerts via:
- Email (to `SERVICE_ALERT_EMAIL` from .env)
- Discord DM (to `SERVICE_ALERT_DISCORD_USER_ID` from .env)

## Alert Script

### `send-service-alert.ts`
TypeScript script that sends alerts when services go down.

**Usage:**
```bash
# Direct usage (requires ts-node)
ts-node scripts/send-service-alert.ts "container1:Description 1" "container2:Description 2"

# Called automatically by check-services.sh when services fail
```

**Configuration:**
Requires the following environment variables in `.env`:
- `SERVICE_ALERT_EMAIL` - Primary email address to receive alerts
- `SYSTEM_ALERT_EMAIL` - Secondary/system email address for alerts (optional)
- `SERVICE_ALERT_MAIL_FROM` - "From" address for alerts (defaults to system-services@epildevconnect.uk)
- `SERVICE_ALERT_DISCORD_USER_ID` - Discord user ID to receive DM alerts
- `DISCORD_TOKEN` - Discord bot token (for sending DMs)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` - SMTP configuration

## Automated Monitoring

### Setup
The monitoring cron job is automatically set up to run every 5 minutes.

**Log file:** `/home/blake/8bp-rewards/logs/service-monitor.log`

**View logs:**
```bash
tail -f /home/blake/8bp-rewards/logs/service-monitor.log
```

**Remove monitoring:**
```bash
crontab -e
# Then delete the line containing "check-services.sh"
```

## Quick Commands

### Check all services status
```bash
/home/blake/8bp-rewards/scripts/check-services.sh
```

### Check Docker Compose status
```bash
cd /home/blake/8bp-rewards && docker-compose ps
cd /home/blake/myhub && docker-compose ps
```

### View recent service monitor logs
```bash
tail -20 /home/blake/8bp-rewards/logs/service-monitor.log
```

### Restart a service if needed
```bash
cd /home/blake/8bp-rewards && docker-compose restart <service-name>
```

## Best Practices

1. **After deployments:** Always run `check-services.sh` to verify everything is up
2. **After manual stops:** Use `docker-compose up -d` to restart services cleanly
3. **Monitor logs:** Check service-monitor.log regularly for early detection of issues
4. **Container policies:** Keep `restart: unless-stopped` for production (current setup)
