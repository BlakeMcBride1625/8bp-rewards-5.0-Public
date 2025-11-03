# ⚙️ Configuration Guide

Complete configuration reference for the 8BP Rewards System.

## 📋 Table of Contents

1. [Environment Variables](#environment-variables)
2. [Database Configuration](#database-configuration)
3. [Port Configuration](#port-configuration)
4. [Discord Configuration](#discord-configuration)
5. [Email Configuration](#email-configuration)
6. [File Structure](#file-structure)

---

## Environment Variables

### Critical Production Variables

```env
# Node Environment (MUST be 'production' on VPS)
NODE_ENV=production

# Public URLs
PUBLIC_URL=https://yourdomain.com/8bp-rewards
HOME_URL=https://yourdomain.com/8bp-rewards/home
REGISTER_URL=https://yourdomain.com/8bp-rewards/register
CONTACT_URL=https://yourdomain.com/8bp-rewards/contact
LEADERBOARD_URL=https://yourdomain.com/8bp-rewards/leaderboard
ADMIN_DASHBOARD_URL=https://yourdomain.com/8bp-rewards/admin-dashboard
OAUTH_REDIRECT_URI=https://yourdomain.com/8bp-rewards/auth/discord/callback

# Database (Docker - use 'postgres' as host)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=8bp_rewards
POSTGRES_USER=admin
POSTGRES_PASSWORD=your_secure_password
POSTGRES_SSL=false

# Database (Host - use 'localhost')
# POSTGRES_HOST=localhost

# Discord Bot
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_GUILD_ID=your_server_id
REGISTRATION_CHANNEL_ID=your_channel_id
REWARDS_CHANNEL_ID=your_channel_id
SCHEDULER_CHANNEL_ID=your_channel_id
OAUTH_REDIRECT_URI=https://yourdomain.com/8bp-rewards/auth/discord/callback
ALLOWED_ADMINS=discord_id1,discord_id2

# Email (SMTP)
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
SMTP_SECURE=false
MAIL_FROM=noreply@yourdomain.com
ADMIN_EMAILS=admin1@example.com,admin2@example.com
DISCORD_TO_EMAIL_MAPPING=discord_id1:email1@example.com,discord_id2:email2@example.com

# Telegram (Optional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
ALLOWED_TELEGRAM_USERS=telegram_id1,telegram_id2
DISCORD_TO_TELEGRAM_MAPPING=discord_id1:telegram_id1,discord_id2:telegram_id2

# Security
JWT_SECRET=generate_strong_random_string_here
SESSION_SECRET=generate_strong_random_string_here

# VPS Access Control
VPS_OWNERS=discord_id1,discord_id2
ALLOWED_VPS_ADMINS=discord_id1,discord_id2
DISCORD_TO_EMAIL_MAPPING=discord_id1:email1@example.com,discord_id2:email2@example.com

# Claimer Settings
HEADLESS=true
TIMEOUT=20000
DELAY_BETWEEN_USERS=10000
USER_IDS=3057211056,1826254746
SHOP_URL=https://8ballpool.com/en/shop

# Social Media Links (Frontend)
REACT_APP_SOCIAL_FACEBOOK=https://www.facebook.com/...
REACT_APP_SOCIAL_TIKTOK=https://www.tiktok.com/@...
REACT_APP_SOCIAL_YOUTUBE=https://www.youtube.com/@...
REACT_APP_SOCIAL_DISCORD=https://discord.gg/...
REACT_APP_SOCIAL_INSTAGRAM=https://www.instagram.com/...
REACT_APP_SOCIAL_X=https://x.com/...

# Service Ports
BACKEND_PORT=2600
FRONTEND_PORT=2500
DISCORD_API_PORT=2700
STATUS_PORT=2750

# Timezone
TZ=Europe/London
```

### Getting Values

**Discord Bot Token:**
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application → Bot section
3. Copy token

**Discord IDs:**
- Enable Developer Mode in Discord
- Right-click user/server/channel → Copy ID

**Email Mapping:**
Format: `discord_id1:email1@example.com,discord_id2:email2@example.com`

**Generate Secrets:**
```bash
# JWT Secret
openssl rand -base64 32

# Session Secret
openssl rand -hex 32
```

---

## Database Configuration

### PostgreSQL Setup

**Docker (Recommended):**
- Database runs in `postgres` container
- Host: `postgres` (Docker network)
- Port: `5432` (internal)
- Data persisted via Docker volumes

**Host Setup:**
```bash
sudo -u postgres psql
CREATE DATABASE 8bp_rewards;
CREATE USER admin WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE 8bp_rewards TO admin;
\q
```

### Database Schema

**Tables:**
- `registrations` - User registrations
- `claim_records` - Claim history
- `log_entries` - System logs
- `user_mappings` - User ID mappings
- `invalid_users` - Deregistered users
- `vps_codes` - VPS access codes
- `reset_leaderboard_codes` - Leaderboard reset codes

### Initialize Database

```bash
# Docker
docker-compose exec postgres psql -U admin -d 8bp_rewards -f /app/scripts/init-postgres.sql

# Host
psql -U admin -d 8bp_rewards -f scripts/init-postgres.sql
```

### Database Connection

**Docker:**
```env
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
```

**Host:**
```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
```

### Backup Database

```bash
# Docker
docker-compose exec postgres pg_dump -U admin 8bp_rewards > backup.sql

# Host
pg_dump -U admin 8bp_rewards > backup.sql

# Restore
psql -U admin -d 8bp_rewards < backup.sql
```

---

## Port Configuration

### Standard Port Assignments

| Service | Port | Description |
|---------|------|-------------|
| **Backend API** | `2600` | Express API server |
| **Frontend** | `2500` | React app (dev) or served by backend |
| **Discord API** | `2700` | Internal Discord service |
| **PostgreSQL** | `5432` | Database (internal in Docker) |
| **Status** | `2750` | Health check service |

### Port Conflicts

Check for conflicts:
```bash
./scripts/system/check-port-conflicts.sh
```

Avoid these ports (used by other services):
- `3000` - Zipline
- `3001` - Uptime Kuma
- `3300` - Nginx
- `3356` - MySQL
- `8000`, `9443` - Portainer

### Docker Port Mapping

```yaml
services:
  backend:
    ports:
      - "${BACKEND_PORT:-2600}:${BACKEND_PORT:-2600}"
  
  postgres:
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
```

---

## Discord Configuration

### OAuth2 Setup

1. **Discord Developer Portal**
   - Create application
   - Add bot
   - Configure OAuth2 redirect URIs:
     - Production: `https://yourdomain.com/8bp-rewards/auth/discord/callback`
     - Development: `http://localhost:2600/api/auth/discord/callback`

2. **Bot Permissions**
   - Send Messages
   - Attach Files
   - Read Message History
   - Use Slash Commands
   - Manage Messages

3. **Environment Variables**
   ```env
   DISCORD_TOKEN=your_bot_token
   DISCORD_CLIENT_ID=your_client_id
   DISCORD_CLIENT_SECRET=your_client_secret
   OAUTH_REDIRECT_URI=https://yourdomain.com/8bp-rewards/auth/discord/callback
   ALLOWED_ADMINS=discord_id1,discord_id2
   ```

### Channel IDs

```env
REGISTRATION_CHANNEL_ID=channel_for_registrations
REWARDS_CHANNEL_ID=channel_for_claim_confirmations
SCHEDULER_CHANNEL_ID=channel_for_scheduler_notifications
```

---

## Email Configuration

### SMTP Setup

```env
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
SMTP_SECURE=false  # true for port 465
MAIL_FROM=noreply@yourdomain.com
```

### Admin Emails

```env
# Single email
ADMIN_EMAILS=admin@example.com

# Multiple emails
ADMIN_EMAILS=admin1@example.com,admin2@example.com
```

### User-Specific Email Mapping

For VPS access codes, map Discord IDs to specific emails:

```env
DISCORD_TO_EMAIL_MAPPING=discord_id1:email1@example.com,discord_id2:email2@example.com
```

**Format:** `discord_id:email,discord_id:email`

---

## File Structure

### Project Layout

```
8bp-rewards/
├── backend/
│   ├── src/
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   ├── middleware/    # Auth, errors
│   │   └── server.ts      # Express app
│   └── logs/              # Backend logs
│
├── frontend/
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable components
│   │   └── config/        # API configuration
│   └── build/              # Production build
│
├── scripts/
│   ├── system/            # System management
│   ├── cloudflare/        # Cloudflare scripts
│   ├── database/          # Database scripts
│   └── README.md          # Script documentation
│
├── services/               # Service files (discord, etc.)
├── models/                 # Data models
├── migrations/             # Database migrations
├── screenshots/            # Claim screenshots
├── logs/                  # Application logs
│
├── docker-compose.yml      # Docker orchestration
├── Dockerfile             # Docker build
├── .env                   # Environment variables
└── package.json           # Dependencies
```

### Important Files

**Configuration:**
- `.env` - Environment variables (NOT in git)
- `env-template.txt` - Environment template
- `docker-compose.yml` - Docker services
- `Dockerfile` - Docker build instructions

**Database:**
- `scripts/init-postgres.sql` - Database initialization
- `migrations/*.sql` - Database migrations

**Services:**
- `services/discord-service.js` - Discord integration
- `services/DatabaseService.ts` - PostgreSQL service
- `backend/src/routes/*.ts` - API endpoints

**Claimers:**
- `playwright-claimer-discord.js` - Main claimer
- `claimer-utils.js` - Claim utilities
- `browser-pool.js` - Browser management

---

## Configuration Validation

### Check Configuration

```bash
# Validate .env file
node -e "
require('dotenv').config();
const required = ['DISCORD_TOKEN', 'POSTGRES_HOST', 'POSTGRES_DB'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error('Missing variables:', missing);
  process.exit(1);
}
console.log('✅ All required variables present');
"
```

### Test Connections

```bash
# Test database
docker-compose exec postgres psql -U admin -d 8bp_rewards -c "SELECT NOW();"

# Test Discord (requires backend running)
curl http://localhost:2600/api/admin/bot-status-public
```

---

*Last Updated: November 3, 2025*

