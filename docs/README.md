# 📖 8BP Rewards System - Technical Documentation

Complete technical documentation for the 8BP Rewards System architecture, implementation, and operations.

## 📋 Documentation Index

### Getting Started
1. **[START_HERE.md](./START_HERE.md)** - Complete setup guide for new installations
2. **[SETUP.md](./SETUP.md)** - Installation, deployment, and server setup
3. **[CONFIGURATION.md](./CONFIGURATION.md)** - Environment variables, database, and port configuration

### Bot Management & Scripts
4. **[SCRIPTS.md](./SCRIPTS.md)** - Script utilities for bot deployment and validation
5. **[STATUS_BOT.md](./STATUS_BOT.md)** - Status monitoring bot documentation
6. **[../SLASH_COMMANDS_FIX_SUMMARY.md](../SLASH_COMMANDS_FIX_SUMMARY.md)** - Recent slash command fixes

### Integration & Advanced Topics
7. **[INTEGRATION.md](./INTEGRATION.md)** - Discord, Telegram, Cloudflare, and authentication setup
8. **[VERIFICATION_INTEGRATION.md](./VERIFICATION_INTEGRATION.md)** - Verification bot integration guide
9. **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Common issues, solutions, and advanced topics

### Migration & Updates
10. **[MIGRATION_COMPLETE.md](./MIGRATION_COMPLETE.md)** - Database migration guide
11. **[DATABASE_CONSOLIDATION_COMPLETE.md](./DATABASE_CONSOLIDATION_COMPLETE.md)** - Database consolidation details
12. **[CHANGES_COMPLETE.md](./CHANGES_COMPLETE.md)** - Recent changes and updates

### Deployment
13. **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Pre-deployment checklist
14. **[OLD_SYSTEM_SHUTDOWN.md](./OLD_SYSTEM_SHUTDOWN.md)** - Legacy system migration

---

## 🏗️ System Architecture

### Overview

The 8BP Rewards System is a full-stack application that automates daily reward claims for registered users on the 8 Ball Pool website.

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend    │────▶│ PostgreSQL │
│   (React)   │     │   (Express)   │     │  Database  │
└─────────────┘     └──────────────┘     └─────────────┘
                            │
                            ├────▶ Discord Bot Service
                            ├────▶ Claimer Service
                            └────▶ WebSocket Service
```

### Core Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | React 18 + TypeScript | User dashboard and admin interface |
| **Backend API** | Node.js + Express + TypeScript | REST API and data management |
| **Database** | PostgreSQL 14+ | User data and claim records |
| **Automation** | Playwright | Browser automation for claiming |
| **Discord Bot** | Discord.js 14 | User notifications and management |
| **Verification Bot** | Discord.js 14 + OpenAI Vision | Rank verification from screenshots |
| **Status Bot** | Discord.js 14 | Service health monitoring |
| **Scheduler** | node-cron | Automated daily claiming |
| **Deployment** | Docker Compose | Containerised services |

---

## 🗂️ Directory Structure

```
8bp-rewards/
├── backend/
│   ├── src/
│   │   ├── routes/        # Express API routes
│   │   ├── services/      # Business logic (DatabaseService, SchedulerService)
│   │   ├── middleware/   # Authentication, error handling
│   │   └── server.ts      # Express app initialisation
│   ├── logs/              # Backend application logs
│   └── screenshots/       # Claim screenshots
│
├── frontend/
│   ├── src/
│   │   ├── pages/         # Page components (Admin, Leaderboard, etc.)
│   │   ├── components/    # Reusable UI components
│   │   ├── hooks/         # React hooks (useAuth, useWebSocket)
│   │   └── config/        # API configuration
│   └── build/             # Production build output
│
├── scripts/
│   ├── system/            # System management scripts
│   ├── cloudflare/        # Cloudflare tunnel scripts
│   ├── database/          # Database operation scripts
│   └── README.md          # Script documentation
│
├── services/              # Service files (discord-service.js, etc.)
├── models/                # Data models
├── migrations/            # Database migrations
├── screenshots/           # Claim screenshots (organised by stage)
├── logs/                  # Application logs
│
├── docker-compose.yml     # Docker orchestration
├── Dockerfile             # Multi-stage Docker build
├── .env                   # Environment variables (not in git)
└── package.json           # Dependencies and scripts
```

---

## 📊 Database Schema

### PostgreSQL Tables

**`registrations`**
- User registrations with 8 Ball Pool IDs
- Fields: `eight_ball_pool_id`, `username`, `is_active`, `is_blocked`, `created_at`

**`claim_records`**
- History of all claim attempts
- Fields: `id`, `eight_ball_pool_id`, `website_user_id`, `status`, `items_claimed`, `claimed_at`

**`log_entries`**
- System logs and audit trail
- Fields: `id`, `level`, `message`, `timestamp`, `metadata`

**`user_mappings`**
- Mappings between 8BP IDs and website user IDs
- Fields: `id`, `eight_ball_pool_id`, `website_user_id`

**`invalid_users`**
- Deregistered/invalid users
- Fields: `id`, `eight_ball_pool_id`, `deregistration_reason`, `source_module`

**`vps_codes`**
- Multi-factor authentication codes for VPS access
- Fields: `id`, `user_id`, `discord_code`, `telegram_code`, `email_code`, `expires_at`

---

## 🔄 Data Flow

### User Registration Flow

1. User registers via Discord bot (`/register <8bp_id>`)
2. Backend validates and stores in `registrations` table
3. Validation runs before first claim
4. Invalid users automatically removed

### Claim Flow

1. Scheduler triggers or admin manual claim
2. Claimer service reads users from database
3. Playwright opens browsers (concurrent pool)
4. For each user:
   - Navigate to shop
   - Login if needed
   - Enter 8BP ID
   - Click claim button
   - Capture screenshots
   - Verify claim success
5. Store results in `claim_records` table
6. Send Discord notifications (if configured)
7. Update leaderboard data

### WebSocket Real-Time Updates

- Backend broadcasts VPS stats every 1 second
- Frontend receives updates via WebSocket
- Falls back to HTTP polling if WebSocket unavailable
- Updates charts in real-time

---

## 🔐 Authentication & Authorisation

### Discord OAuth2

- Admin access via Discord login
- Session-based authentication
- Environment: `ALLOWED_ADMINS` (comma-separated Discord IDs)

### VPS Monitor Multi-Factor Auth

Three authentication channels:
1. **Discord**: 16-character hex code via DM
2. **Telegram**: 16-character hex code via Telegram bot
3. **Email**: 6-digit PIN via SMTP

Configuration:
- `VPS_OWNERS`: Discord IDs allowed VPS access
- `DISCORD_TO_TELEGRAM_MAPPING`: Map Discord → Telegram IDs
- `DISCORD_TO_EMAIL_MAPPING`: Map Discord → Email addresses

---

## 🚀 Deployment Architecture

### Docker (Recommended)

**Services:**
- `postgres` - PostgreSQL database
- `backend` - Express API + Frontend
- `discord-api` - Discord bot service
- `claimer` - Automated claiming service

**Network:**
- All services on Docker bridge network
- Internal communication via service names
- Database host: `postgres` (Docker network)

**Volumes:**
- `postgres_data`: Database persistence
- `./logs`: Application logs
- `./screenshots`: Claim screenshots

### Host Services (Legacy)

- PostgreSQL on host system
- Backend and frontend as systemd services
- Manual process management

---

## 📈 Performance & Scalability

### Browser Concurrency

- Default: 6 concurrent browsers
- Configurable in `browser-pool.js`
- Balance between speed and stability

### Database Optimisation

- Connection pooling enabled
- Indexed queries for common operations
- Regular cleanup of old data

### Caching

- Frontend build served statically
- API responses cached where appropriate
- WebSocket for real-time data (no polling overhead)

---

## 🔍 Monitoring & Logging

### Logging

- **Backend**: Winston logger with file and console transports
- **Discord**: Service-specific logs
- **Claimer**: Detailed claim progress logs

### Health Checks

- `/health` - Basic health check
- `/api/status` - Detailed system status
- `/api/status/database` - Database connection status

### Metrics

- Real-time VPS stats (CPU, memory, network)
- Claim success rates
- User statistics
- Service heartbeat tracking

---

## 🔄 Scheduler

### Automated Claims

- **Frequency**: 4 times daily
- **Times**: 00:00, 06:00, 12:00, 18:00 UTC
- **Implementation**: `SchedulerService.ts`
- **Notifications**: Discord channel (if configured)

### Manual Triggers

- Claim all users
- Claim single user
- Claim test users (quick buttons)

---

## 🛡️ Security

### Authentication

- Discord OAuth2 for admin access
- Session-based authentication
- Multi-factor auth for sensitive features

### Data Protection

- Environment variables for secrets
- `.env` file in `.gitignore`
- Secure password hashing (if implemented)
- Database credentials secured

### Network Security

- Cloudflare Tunnel (recommended)
- No exposed ports required
- Automatic SSL/TLS
- DDoS protection

---

## 📚 Additional Documentation

For specific topics, see:

- **[START_HERE.md](./START_HERE.md)** - Complete setup guide for new installations
- **[SETUP.md](./SETUP.md)** - Installation and deployment
- **[CONFIGURATION.md](./CONFIGURATION.md)** - Environment variables and configuration
- **[SCRIPTS.md](./SCRIPTS.md)** - Script utilities for bot management
- **[STATUS_BOT.md](./STATUS_BOT.md)** - Status monitoring bot setup
- **[INTEGRATION.md](./INTEGRATION.md)** - External service integration
- **[VERIFICATION_INTEGRATION.md](./VERIFICATION_INTEGRATION.md)** - Verification bot setup
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Common issues and solutions

---

*Last Updated: November 30, 2025*
