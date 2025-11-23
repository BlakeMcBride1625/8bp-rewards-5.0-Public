# Additional Environment Variables Required

Based on the recent fixes, the following environment variables should be added to your `.env` file:

## Heartbeat Configuration (NEW - Required for Service Tracking)

```env
# Heartbeat URL for service tracking (auto-constructed if not set)
# Format: ${PUBLIC_URL}/8bp-rewards/api/heartbeat/beat
HEARTBEAT_URL=

# Heartbeat interval in milliseconds (default: 5000 = 5 seconds)
HEARTBEAT_INTERVAL_MS=5000

# Heartbeat TTL in milliseconds (default: 30000 = 30 seconds)
# Services that don't send heartbeat within this time are considered offline
HEARTBEAT_TTL_MS=30000

# Disable heartbeat (set to 'true' to disable)
DISABLE_HEARTBEAT=false
```

## Session & Security (NEW - Required for Backend)

```env
# Session secret for Express sessions (generate a strong random string)
SESSION_SECRET=your_super_secret_session_key_here_change_this_in_production
```

## Database Connection Pool Settings (NEW - Optional but Recommended)

```env
# PostgreSQL connection pool settings
POSTGRES_POOL_MAX=20
POSTGRES_POOL_MIN=5
POSTGRES_IDLE_TIMEOUT=30000
POSTGRES_CONNECTION_TIMEOUT=20000
POSTGRES_QUERY_TIMEOUT=30000
```

## Monitoring & Alerts (NEW - Optional)

```env
# Discord channel for system alerts (falls back to REWARDS_CHANNEL_ID if not set)
ALERTS_CHANNEL_ID=your_alerts_channel_id_here

# Service Monitor Alert Configuration
# Primary email address to receive service down alerts
SERVICE_ALERT_EMAIL=your-email@example.com

# Secondary/system email address for service alerts (optional)
# Both SERVICE_ALERT_EMAIL and SYSTEM_ALERT_EMAIL will receive alerts
SYSTEM_ALERT_EMAIL=your-system-email@example.com

# Custom display name for service alerts (optional, defaults to "System Services")
# Note: The actual sender email will be your SMTP_USER (required by SMTP servers)
# Email will appear as: "System Services <your-smtp-user@domain.com>"
SERVICE_ALERT_MAIL_FROM=system-services@epildevconnect.uk

# Discord User ID to receive DM alerts (optional)
# Get your User ID: Enable Developer Mode > Right-click username > Copy User ID
SERVICE_ALERT_DISCORD_USER_ID=your_discord_user_id

# Note: DISCORD_TOKEN must also be set (used for sending DMs)
```

## Public FAQ URL (NEW)

```env
# External link used for marketing pages and status notices referencing the FAQ
FAQ_URL=https://8bp.epildevconnect.uk/8bp-rewards/faq
```

## Playwright/Chromium Configuration (NEW - Optional)

```env
# Path to Chromium executable (for claimers)
# Default: /ms-playwright/chromium-1193/chrome-linux/chrome
CHROMIUM_PATH=/ms-playwright/chromium-1193/chrome-linux/chrome

# Alternative: Chrome binary path
CHROME_BIN=/usr/bin/chromium-browser
```

## Service Name Configuration (NEW - Optional)

```env
# Service name hint for heartbeat tracking (helpful for identifying services)
SERVICE_NAME=claimer
```

---

## Complete Updated .env Template

Add these sections to your existing `.env` file:

### Add to Database Section:
```env
# Database Connection Pool Settings (Optional)
POSTGRES_POOL_MAX=20
POSTGRES_POOL_MIN=5
POSTGRES_IDLE_TIMEOUT=30000
POSTGRES_CONNECTION_TIMEOUT=20000
POSTGRES_QUERY_TIMEOUT=30000
```

### Add to Discord Section:
```env
# System Alerts Channel (Optional - falls back to REWARDS_CHANNEL_ID)
ALERTS_CHANNEL_ID=your_alerts_channel_id_here
```

### Add New Security Section:
```env
# Session Management
SESSION_SECRET=your_super_secret_session_key_here_change_this_in_production
```

### Add New Heartbeat Section:
```env
# Heartbeat Configuration for Service Tracking
HEARTBEAT_URL=
HEARTBEAT_INTERVAL_MS=5000
HEARTBEAT_TTL_MS=30000
DISABLE_HEARTBEAT=false
```

### Add New Claimer Configuration Section:
```env
# Playwright/Chromium Configuration
CHROMIUM_PATH=/ms-playwright/chromium-1193/chrome-linux/chrome
CHROME_BIN=/usr/bin/chromium-browser
SERVICE_NAME=claimer
```

---

## Critical Variables That Must Be Set

**These are required for the system to function:**

1. `POSTGRES_PASSWORD` - Database password (no longer hardcoded)
2. `DISCORD_TOKEN` - Discord bot token
3. `REWARDS_CHANNEL_ID` - Discord channel for reward confirmations
4. `SESSION_SECRET` - Session encryption key
5. `PUBLIC_URL` - Base URL for your deployment

**These are recommended:**

6. `HEARTBEAT_INTERVAL_MS` - Controls how often services report status
7. `ALERTS_CHANNEL_ID` - For system alerts (optional)

---

## Notes

- All hardcoded passwords have been removed - `POSTGRES_PASSWORD` MUST be set in `.env`
- Heartbeat system helps track service status - services will auto-construct `HEARTBEAT_URL` if not set
- `SESSION_SECRET` should be a strong random string (use: `openssl rand -base64 32`)
- Channel IDs can be found in Discord Developer Mode (right-click channel → Copy ID)



