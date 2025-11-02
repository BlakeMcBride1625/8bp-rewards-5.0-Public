# 8BP Rewards System - Complete File Structure

This document describes every file in the project, its purpose, and how file paths work.

## Table of Contents

- [Root Level Files](#root-level-files)
- [Backend Structure](#backend-structure)
- [Frontend Structure](#frontend-structure)
- [Services & Utilities](#services--utilities)
- [Models](#models)
- [Scripts](#scripts)
- [Configuration Files](#configuration-files)
- [Docker Files](#docker-files)
- [Documentation](#documentation)
- [Claimers](#claimers)
- [Discord Bot](#discord-bot)

---

## Root Level Files

### Core Application Files

**`package.json`**
- **Purpose**: Root package.json for the entire project. Defines workspace-level scripts and dependencies
- **Key Scripts**: 
  - `build`: Compiles backend TypeScript and builds frontend React
  - `start`: Starts backend server
  - `dev`: Runs both backend and frontend in development mode
  - `claim`: Runs the playwright claimer
  - `docker:*`: Docker-related commands
- **Path**: Root of project - `/home/blake/8bp-rewards/`

**`tsconfig.json`**
- **Purpose**: TypeScript configuration for root-level TypeScript files (like `src/` directory)
- **Output**: Compiles to `dist/` directory
- **Used by**: Root-level TypeScript files

**`tsconfig.backend.json`**
- **Purpose**: TypeScript configuration specifically for backend compilation
- **Output**: Compiles `backend/src/` to `dist/backend/backend/src/`
- **Note**: The nested path structure is intentional to maintain import paths

### Main Claimer Files

**`playwright-claimer.js`**
- **Purpose**: Main Playwright-based claimer script. Claims rewards for all registered users
- **Entry Point**: Can be run directly with `node playwright-claimer.js`
- **Features**: 
  - Reads users from database
  - Uses browser pool for concurrency
  - Saves claim records
  - Captures screenshots
- **Path Usage**: 
  - Imports from `./services/database-service.js`
  - Uses `./claimer-utils.js` for validation
  - Uses `./browser-pool.js` for browser management

**`playwright-claimer-discord.js`**
- **Purpose**: Enhanced claimer with Discord integration. Sends notifications to Discord channels
- **Differences from playwright-claimer.js**:
  - Sends Discord messages for each claim
  - Uses Discord service for notifications
  - Optional image generation for confirmations
- **Path Usage**: 
  - Imports `./services/discord-service.js`
  - Extends functionality of base claimer

**`first-time-claim.js`**
- **Purpose**: Single-user claimer. Used for first-time claims after registration validation
- **Entry Point**: Called from `registration-validation.ts` script
- **Parameters**: Takes `eightBallPoolId` and `username` as command-line arguments
- **Path Usage**: 
  - Standalone script, doesn't require full system startup
  - Uses database service for user lookup

**`claimer-utils.js`**
- **Purpose**: Utility functions for claim validation and button detection
- **Exports**: 
  - `validateClaimResult()`: Validates claim success
  - `shouldSkipButtonForCounting()`: Detects duplicate claims
  - `shouldClickButton()`: Determines if claim button should be clicked
- **Used by**: All claimer scripts

**`browser-pool.js`**
- **Purpose**: Manages concurrent Playwright browser instances
- **Features**: 
  - Limits concurrent browsers (default: 6)
  - Reuses browser instances
  - Handles browser lifecycle
- **Used by**: All claimer scripts that need browser automation

### Database & Services

**`services/database-service.js`**
- **Purpose**: JavaScript database service (legacy MongoDB implementation)
- **Path**: `/home/blake/8bp-rewards/services/database-service.js`
- **Note**: Being phased out in favor of TypeScript `DatabaseService.ts`

**`services/DatabaseService.ts`**
- **Purpose**: TypeScript database service (PostgreSQL implementation)
- **Path**: `/home/blake/8bp-rewards/services/DatabaseService.ts`
- **Used by**: Backend routes and services

**`services/discord-service.js`**
- **Purpose**: Discord bot service for sending messages and notifications
- **Path**: `/home/blake/8bp-rewards/services/discord-service.js`
- **Used by**: Claimers, backend routes, Discord bot

**`services/discord-api-server.js`**
- **Purpose**: HTTP API server embedded in Discord bot for status checks
- **Path**: `/home/blake/8bp-rewards/services/discord-api-server.js`
- **Endpoints**: Health checks, bot status management

**`services/validation-service.js`**
- **Purpose**: User validation service (JavaScript version)
- **Path**: `/home/blake/8bp-rewards/services/validation-service.js`
- **Note**: Has TypeScript definitions in `.d.ts` file

### Bot & Integration

**`discord-bot.js`**
- **Purpose**: Main Discord bot entry point
- **Features**: 
  - Slash commands for user registration
  - Account management
  - Status checks
- **Path Usage**: 
  - Imports `./services/discord-service.js`
  - Can be run standalone: `node discord-bot.js`

### Configuration Files

**`docker-compose.yml`**
- **Purpose**: Docker Compose configuration for all services
- **Services Defined**:
  - `database`: PostgreSQL database
  - `backend`: Backend API + Frontend (consolidated)
  - `discord-bot`: Discord status bot
- **Path Usage**: Run from root: `docker-compose up`

**`Dockerfile`**
- **Purpose**: Multi-stage Docker build file
- **Stages**:
  1. `base`: Base Node.js image
  2. `backend-builder`: Builds TypeScript backend
  3. `backend`: Production backend image (includes frontend build)
  4. `frontend-builder`: Builds React frontend
  5. `frontend`: Nginx frontend image (legacy, not used in consolidated setup)
- **Path Usage**: Docker reads from project root

**`.dockerignore`**
- **Purpose**: Tells Docker which files to exclude from builds
- **Excludes**: node_modules, dist, build, logs, etc.

**`cloudflare-tunnel.yml`**
- **Purpose**: Cloudflare Tunnel configuration template
- **Usage**: Copied to `~/.cloudflared/config.yml` during setup
- **Routes**: All traffic to `localhost:2600` (consolidated backend)

**`ecosystem.config.js`**
- **Purpose**: PM2 process manager configuration
- **Note**: For PM2-based deployment (alternative to Docker)
- **Defines**: Backend and frontend processes

**`env-template.txt`**
- **Purpose**: Template for environment variables
- **Usage**: Copy to `.env` and fill in values

**`env.docker`**
- **Purpose**: Docker-specific environment variable template

### Utility Scripts (Root Level)

**`remove-failed-claims.js`**
- **Purpose**: Utility to remove failed claim records from database
- **Path**: Root level utility script

**`debug-claim-status.js`**
- **Purpose**: Debugging script to check claim status
- **Path**: Root level utility script

**`user-mapping.json`**
- **Purpose**: User ID to username mapping file
- **Path**: Root level configuration file

---

## Backend Structure

### Main Server

**`backend/src/server.ts`**
- **Purpose**: Main Express server entry point
- **Responsibilities**:
  - Sets up middleware (CORS, security, session)
  - Configures routes
  - Serves frontend static files (consolidated setup)
  - Handles errors
  - Connects to database
  - Initializes scheduler
- **Compiled Path**: `dist/backend/backend/src/server.js`
- **Entry Point**: Runs on port 2600 (from `BACKEND_PORT` env var)

### Routes

**`backend/src/routes/registration.ts`**
- **Purpose**: User registration endpoints
- **Routes**:
  - `POST /`: Register new user (triggers validation)
  - `GET /`: Get all registrations
  - `GET /:eightBallPoolId`: Get specific registration
  - `GET /:eightBallPoolId/claims`: Get user's claim history
  - `GET /stats/overview`: Registration statistics
- **Path Usage**: 
  - Imports `../scripts/registration-validation.ts` for validation
  - Uses `../services/DatabaseService.ts`

**`backend/src/routes/auth.ts`**
- **Purpose**: Discord OAuth2 authentication for admin dashboard
- **Routes**:
  - `GET /discord`: Initiate Discord login
  - `GET /discord/callback`: OAuth callback
  - `GET /me`: Get current user
  - `POST /logout`: Logout
  - `GET /status`: Authentication status
- **Path Usage**: Uses Passport.js for OAuth

**`backend/src/routes/admin.ts`**
- **Purpose**: Admin dashboard API endpoints
- **Routes**: Multiple admin-only endpoints for user management, manual claims, system management
- **Path Usage**: Protected by `authenticateAdmin` middleware

**`backend/src/routes/admin-terminal.ts`**
- **Purpose**: Terminal/command execution for VPS owners
- **Routes**: Execute commands, request MFA codes (high-security operations)
- **Path Usage**: Extremely restricted access

**`backend/src/routes/admin-active-services.ts`**
- **Purpose**: API to check running services and processes
- **Routes**: `GET /active-services` - Returns list of running services
- **Path Usage**: Uses system commands to detect running processes

**`backend/src/routes/leaderboard.ts`**
- **Purpose**: Leaderboard API endpoints
- **Routes**: User rankings, statistics, totals
- **Path Usage**: Reads from PostgreSQL database

**`backend/src/routes/status.ts`**
- **Purpose**: System status and health check endpoints
- **Routes**:
  - `GET /`: Overall system status
  - `GET /scheduler`: Scheduler service status
  - `GET /database`: Database health
  - `GET /discord-bot`: Discord bot status
  - `GET /claimers`: Claimer scripts status
  - `GET /health`: Comprehensive health check
  - `GET /metrics`: Application metrics
- **Path Usage**: Monitors all system components

**`backend/src/routes/screenshots.ts`**
- **Purpose**: API to retrieve screenshot files
- **Routes**: Get screenshots by type, user, date
- **Path Usage**: Reads from `screenshots/` directory

**`backend/src/routes/validation.ts`**
- **Purpose**: User validation system API
- **Routes**: Validation logs, revalidation, health checks
- **Path Usage**: Uses `../services/ValidationService.ts`

**`backend/src/routes/postgresql-db.ts`**
- **Purpose**: Direct PostgreSQL database management API
- **Routes**: Database operations, backups, user management
- **Path Usage**: Direct database access for admin operations

**`backend/src/routes/contact.ts`**
- **Purpose**: Contact form submission endpoint
- **Routes**: `POST /` - Submit contact form

**`backend/src/routes/heartbeat.ts`**
- **Purpose**: Service heartbeat registration
- **Routes**: Services register their heartbeat here
- **Path Usage**: Used by claimers and other services to report they're running

**`backend/src/routes/vps-monitor.ts`**
- **Purpose**: VPS monitoring endpoints
- **Routes**: System metrics, resource usage

**`backend/src/routes/tiktok-profiles.ts`**
- **Purpose**: TikTok profile management (if applicable)
- **Routes**: Profile operations

### Middleware

**`backend/src/middleware/auth.ts`**
- **Purpose**: Authentication middleware
- **Exports**:
  - `authenticateAdmin`: Checks if user is admin
  - `validateRegistration`: Validates registration input
  - `validateContactForm`: Validates contact form
- **Path Usage**: Imported by routes that need authentication

**`backend/src/middleware/deviceBlocking.ts`**
- **Purpose**: Device-based blocking and detection
- **Exports**: `checkDeviceBlocking`, `logDeviceInfo`
- **Path Usage**: Used in registration and admin routes

**`backend/src/middleware/errorHandler.ts`**
- **Purpose**: Global error handler
- **Path Usage**: Applied to Express app in server.ts

**`backend/src/middleware/requestLogger.ts`**
- **Purpose**: HTTP request logging middleware
- **Path Usage**: Applied to Express app

### Models

**`backend/src/models/Registration.ts`**
- **Purpose**: TypeScript interface/type definitions for Registration
- **Path Usage**: Type definitions only, compiled to JavaScript

**`backend/src/models/ClaimRecord.ts`**
- **Purpose**: TypeScript definitions for claim records

**`backend/src/models/LogEntry.ts`**
- **Purpose**: TypeScript definitions for log entries

### Services

**`backend/src/services/DatabaseService.ts`**
- **Purpose**: PostgreSQL database service (main implementation)
- **Features**: 
  - Singleton pattern
  - Connection management
  - CRUD operations for registrations, claims, logs
  - Health checks
- **Path Usage**: Used by all routes and services

**`backend/src/services/ValidationService.ts`**
- **Purpose**: User validation service
- **Features**: Validates users against 8 Ball Pool website
- **Path Usage**: Used by registration route and validation endpoints

**`backend/src/services/SchedulerService.ts`**
- **Purpose**: Automated claim scheduling
- **Features**: 
  - Runs claims at scheduled times (00:00, 06:00, 12:00, 18:00 UTC)
  - Integrates with claimers
  - Logs results
- **Path Usage**: Initialized in server.ts

**`backend/src/services/LoggerService.ts`**
- **Purpose**: Centralized logging service
- **Features**: Winston-based logging with multiple transports
- **Path Usage**: Used throughout backend

**`backend/src/services/DiscordNotificationService.ts`**
- **Purpose**: Discord notifications from backend
- **Features**: Sends notifications to Discord channels
- **Path Usage**: Used by registration route, admin routes

**`backend/src/services/TelegramNotificationService.ts`**
- **Purpose**: Telegram bot notifications (optional)

**`backend/src/services/EmailNotificationService.ts`**
- **Purpose**: Email notifications (optional)

**`backend/src/services/DeviceDetectionService.ts`**
- **Purpose**: Device fingerprinting and detection
- **Features**: Extracts device info from requests
- **Path Usage**: Used in registration middleware

**`backend/src/services/BlockingService.ts`**
- **Purpose**: Device/IP blocking service

**`backend/src/services/MonitoringService.ts`**
- **Purpose**: System monitoring and metrics

**`backend/src/services/HeartbeatRegistry.ts`**
- **Purpose**: Registry for service heartbeats
- **Path Usage**: Used by heartbeat route

**`backend/src/services/status-server.js`**
- **Purpose**: Legacy status server (JavaScript)

### Scripts

**`backend/src/scripts/registration-validation.ts`**
- **Purpose**: Validates new user registrations
- **Process**:
  1. Opens Playwright browser
  2. Navigates to 8 Ball Pool shop
  3. Tests if user ID is valid
  4. If valid, triggers first-time claim
  5. If invalid, deregisters user
- **Path Usage**: 
  - Called from `routes/registration.ts` via spawn
  - Imports `../../../services/database-service.js`
  - Calls `first-time-claim.js` for valid users
- **Entry**: `npx tsx backend/src/scripts/registration-validation.ts <id> <username>`

### Utils

**`backend/src/utils/heartbeat-client.ts`**
- **Purpose**: Client library for services to register heartbeats
- **Path Usage**: Imported by services to report their status

### Types

**`backend/src/types/discord-service.d.ts`**
- **Purpose**: TypeScript definitions for Discord service
- **Path Usage**: Type definitions for Discord integration

---

## Frontend Structure

### Entry Points

**`frontend/src/index.tsx`**
- **Purpose**: React application entry point
- **Path Usage**: 
  - Renders `<App />` component
  - Sets up React root
  - Configures base path `/8bp-rewards`

**`frontend/src/App.tsx`**
- **Purpose**: Main React application component
- **Features**:
  - Sets up React Router with basename `/8bp-rewards`
  - Defines all routes
  - Wraps app in AuthProvider
  - Configures toast notifications
- **Routes Defined**:
  - `/` or `/home`: HomePage
  - `/register`: RegisterPage
  - `/admin-dashboard`: AdminDashboardPage
  - `/contact`: ContactPage
  - `/system-status`: SystemStatusPage
  - `/leaderboard`: LeaderboardPage
  - `/socials`: SocialsPage
  - `/terms`: TermsOfServicePage
  - `/privacy`: PrivacyPolicyPage

**`frontend/src/heartbeat.ts`**
- **Purpose**: Frontend heartbeat to report it's running
- **Path Usage**: Called from frontend to register with backend

### Configuration

**`frontend/src/config/api.ts`**
- **Purpose**: API endpoint configuration
- **Defines**: All API endpoint URLs
- **Path Usage**: Imported by all pages that make API calls

### Hooks

**`frontend/src/hooks/useAuth.tsx`**
- **Purpose**: Authentication hook for React components
- **Provides**:
  - `user`: Current authenticated user
  - `isAuthenticated`: Auth status
  - `isAdmin`: Admin status
  - `logout`: Logout function
- **Path Usage**: Used by all protected pages

### Components

**`frontend/src/components/Layout.tsx`**
- **Purpose**: Main layout wrapper for all pages
- **Features**: Header, navigation, footer

**`frontend/src/components/DarkModeToggle.tsx`**
- **Purpose**: Dark mode toggle component

**`frontend/src/components/Footer.tsx`**
- **Purpose**: Site footer component

**`frontend/src/components/AnimatedBackground.tsx`**
- **Purpose**: Animated background effects

**`frontend/src/components/ClaimProgressTracker.tsx`**
- **Purpose**: Shows progress of claim operations

**`frontend/src/components/PostgreSQLDBManager.tsx`**
- **Purpose**: Database management UI component

**`frontend/src/components/VPSAuthModal.tsx`**
- **Purpose**: Modal for VPS authentication

**`frontend/src/components/ResetLeaderboardAuthModal.tsx`**
- **Purpose**: Modal for leaderboard reset authentication

### Pages

**`frontend/src/pages/HomePage.tsx`**
- **Purpose**: Landing page/home page
- **Route**: `/8bp-rewards/` or `/8bp-rewards/home`

**`frontend/src/pages/RegisterPage.tsx`**
- **Purpose**: User registration form
- **Route**: `/8bp-rewards/register`
- **Path Usage**: 
  - Calls `POST /8bp-rewards/api/registration`
  - Uses `useAuth` hook

**`frontend/src/pages/AdminDashboardPage.tsx`**
- **Purpose**: Main admin dashboard
- **Route**: `/8bp-rewards/admin-dashboard`
- **Features**: 
  - User management
  - Manual claims
  - System monitoring
  - Screenshot gallery
  - Terminal access
- **Path Usage**: 
  - Multiple API endpoints
  - Protected route (requires admin auth)

**`frontend/src/pages/LeaderboardPage.tsx`**
- **Purpose**: Public leaderboard
- **Route**: `/8bp-rewards/leaderboard`
- **Path Usage**: Calls leaderboard API

**`frontend/src/pages/SystemStatusPage.tsx`**
- **Purpose**: System status display
- **Route**: `/8bp-rewards/system-status`

**`frontend/src/pages/ActiveServicesPage.tsx`**
- **Purpose**: Active services monitoring
- **Route**: `/8bp-rewards/active-services`

**`frontend/src/pages/ContactPage.tsx`**
- **Purpose**: Contact form
- **Route**: `/8bp-rewards/contact`

**`frontend/src/pages/SocialsPage.tsx`**
- **Purpose**: Social media links
- **Route**: `/8bp-rewards/socials`

**`frontend/src/pages/TermsOfServicePage.tsx`**
- **Purpose**: Terms of service
- **Route**: `/8bp-rewards/terms`

**`frontend/src/pages/PrivacyPolicyPage.tsx`**
- **Purpose**: Privacy policy
- **Route**: `/8bp-rewards/privacy`

### Frontend Configuration Files

**`frontend/package.json`**
- **Purpose**: Frontend dependencies and scripts
- **Key Scripts**:
  - `start`: Development server on port 2500
  - `build`: Production build
- **Homepage**: `/8bp-rewards/` (configured for subpath)

**`frontend/tsconfig.json`**
- **Purpose**: TypeScript configuration for frontend
- **Path Usage**: Compiles React TypeScript to JavaScript

**`frontend/tailwind.config.js`**
- **Purpose**: Tailwind CSS configuration
- **Features**: Custom colors, dark mode, theme configuration

**`frontend/postcss.config.js`**
- **Purpose**: PostCSS configuration for Tailwind

---

## Services & Utilities

### Root Services Directory

**`services/database-service.js`**
- **Purpose**: Legacy MongoDB database service (JavaScript)
- **Path**: `/home/blake/8bp-rewards/services/database-service.js`
- **Status**: Being replaced by TypeScript `DatabaseService.ts`
- **Used by**: Legacy claimers and scripts

**`services/DatabaseService.ts`**
- **Purpose**: PostgreSQL database service (TypeScript)
- **Path**: `/home/blake/8bp-rewards/services/DatabaseService.ts`
- **Note**: Different from `backend/src/services/DatabaseService.ts` but may be related

**`services/discord-service.js`**
- **Purpose**: Discord service for notifications and bot integration
- **Path**: `/home/blake/8bp-rewards/services/discord-service.js`
- **Used by**: Claimers, Discord bot, backend routes

**`services/discord-api-server.js`**
- **Purpose**: HTTP API server for Discord bot
- **Path**: `/home/blake/8bp-rewards/services/discord-api-server.js`

**`services/validation-service.js`**
- **Purpose**: User validation service
- **Path**: `/home/blake/8bp-rewards/services/validation-service.js`

**`services/validation-service.d.ts`**
- **Purpose**: TypeScript definitions for validation service

---

## Models

### Root Models Directory

**`models/Registration.js`**
- **Purpose**: Legacy MongoDB registration model (JavaScript)
- **Path**: `/home/blake/8bp-rewards/models/Registration.js`

**`models/Registration.d.ts`**
- **Purpose**: TypeScript definitions for Registration model

**`models/UserMapping.js`**
- **Purpose**: User ID mapping utility

### PostgreSQL Models

**`models/postgresql/Registration.ts`**
- **Purpose**: PostgreSQL Registration model (TypeScript source)
- **Path**: `/home/blake/8bp-rewards/models/postgresql/Registration.ts`

**`models/postgresql/Registration.js`**
- **Purpose**: Compiled JavaScript version
- **Path**: Generated from `.ts` file

**`models/postgresql/Registration.d.ts`**
- **Purpose**: TypeScript definitions
- **Path**: Generated from `.ts` file

---

## Scripts

**`scripts/verify-claimers.js`**
- **Purpose**: Verification script to test all claimers
- **Features**: 
  - Checks database connectivity
  - Verifies claimer files exist
  - Tests dependencies
  - Checks environment variables
- **Path**: `/home/blake/8bp-rewards/scripts/verify-claimers.js`
- **Usage**: `node scripts/verify-claimers.js`

**`scripts/get-running-services.js`**
- **Purpose**: Detects running services and processes
- **Path**: Used by admin-active-services route

**`scripts/migrate-mongodb-to-postgresql.js`**
- **Purpose**: Migration script from MongoDB to PostgreSQL

**`scripts/migrate-to-mongodb.js`**
- **Purpose**: Migration script (reverse direction)

**`scripts/restore-users-from-backup.js`**
- **Purpose**: Restore users from backup files

**`scripts/heartbeat-preload.js`**
- **Purpose**: Preload script for heartbeat registration

---

## Configuration Files

### TypeScript Configuration

**`tsconfig.json`**
- **Purpose**: Root TypeScript config for `src/` directory
- **Output**: `dist/` directory

**`tsconfig.backend.json`**
- **Purpose**: Backend-specific TypeScript config
- **Output**: `dist/backend/backend/src/`
- **Note**: Nested path structure maintains import compatibility

**`frontend/tsconfig.json`**
- **Purpose**: Frontend TypeScript configuration
- **Output**: `frontend/build/` (handled by React Scripts)

### Docker Configuration

**`docker-compose.yml`**
- **Purpose**: Multi-service Docker Compose configuration
- **Path**: Root level
- **Services**: database, backend, discord-bot

**`Dockerfile`**
- **Purpose**: Multi-stage Docker build
- **Stages**: backend-builder, backend, frontend-builder, frontend
- **Path**: Root level

**`.dockerignore`**
- **Purpose**: Files to exclude from Docker builds

### Environment Configuration

**`env-template.txt`**
- **Purpose**: Environment variable template
- **Usage**: Copy to `.env` and fill values

**`env.docker`**
- **Purpose**: Docker-specific environment template

---

## Discord Bot

### Discord Status Bot

**`discord-status-bot/src/index.ts`**
- **Purpose**: Entry point for Discord status bot
- **Path**: `/home/blake/8bp-rewards/discord-status-bot/src/index.ts`

**`discord-status-bot/src/main.ts`**
- **Purpose**: Main bot logic
- **Features**: Monitors backend health, sends status updates

**`discord-status-bot/src/monitor/checkService.ts`**
- **Purpose**: Service health checking logic

**`discord-status-bot/src/monitor/scheduler.ts`**
- **Purpose**: Scheduled status checks

**`discord-status-bot/src/utils/env.ts`**
- **Purpose**: Environment variable loading

**`discord-status-bot/src/utils/logger.ts`**
- **Purpose**: Logging utility

**`discord-status-bot/src/utils/webhook.ts`**
- **Purpose**: Discord webhook integration

**`discord-status-bot/src/types/service.ts`**
- **Purpose**: TypeScript types for services

**`discord-status-bot/package.json`**
- **Purpose**: Discord bot dependencies

**`discord-status-bot/Dockerfile`**
- **Purpose**: Docker build for Discord bot
- **Path**: Separate from main Dockerfile

**`discord-status-bot/tsconfig.json`**
- **Purpose**: TypeScript config for bot

---

## Archive

**`archive/`** directory contains old/backup files:
- Old claimers, services, tests
- Backup documentation
- Legacy implementations

**Note**: These files are not actively used but kept for reference.

---

## Documentation

### Main Docs

**`README.md`**
- **Purpose**: Main project README with overview
- **Path**: Root level

**`docs/README.md`**
- **Purpose**: Technical deep-dive documentation
- **Path**: `/home/blake/8bp-rewards/docs/README.md`

**`docs/index.md`**
- **Purpose**: Documentation index/navigation
- **Path**: `/home/blake/8bp-rewards/docs/index.md`

### Setup Guides

**`docs/DOCKER.md`**
- **Purpose**: Docker setup guide
- **Path**: `/home/blake/8bp-rewards/docs/DOCKER.md`

**`docs/CLOUDFLARE.md`**
- **Purpose**: Cloudflare Tunnel setup guide
- **Path**: `/home/blake/8bp-rewards/docs/CLOUDFLARE.md`

**`docs/ENV_SETUP_GUIDE.md`**
- **Purpose**: Environment variable configuration guide

**`docs/DEPLOYMENT_CHECKLIST.md`**
- **Purpose**: Production deployment checklist

**`docs/DISCORD_SETUP.md`**
- **Purpose**: Discord bot setup instructions

**`docs/MONGODB_SETUP.md`**
- **Purpose**: MongoDB database setup (legacy)

**`docs/VPS_AUTH_SETUP.md`**
- **Purpose**: VPS authentication setup

**`docs/TELEGRAM_SETUP.md`**
- **Purpose**: Telegram integration setup

### Technical Docs

**`docs/STANDARDIZED-CLAIMER-LOGIC.md`**
- **Purpose**: Claimer logic documentation

**`docs/UPDATED-CLAIMER-LOGIC.md`**
- **Purpose**: Updated claimer implementation details

**`docs/PORT_CONFIGURATION.md`**
- **Purpose**: Port and network configuration

**`docs/VERIFICATION_CODE_FIX.md`**
- **Purpose**: Verification system documentation

### Status Docs

**`docs/CURRENT_STATUS.md`**
- **Purpose**: Current system status

**`docs/PROGRESS_TRACKER.md`**
- **Purpose**: Development progress tracking

**`docs/shell.md`**
- **Purpose**: Shell script documentation

### Other Docs

**`DOCKER_README.md`**
- **Purpose**: Docker-specific README (may be consolidated into docs/DOCKER.md)

**`DOCKER_SETUP_GUIDE.md`**
- **Purpose**: Docker setup guide (may be consolidated)

**`MANUAL_CLAIM_SETUP.md`**
- **Purpose**: Manual claim setup instructions

**`PM2_SETUP.md`**
- **Purpose**: PM2 process manager setup

**`NEW_SERVER_SETUP.md`**
- **Purpose**: New server setup instructions

---

## Path Resolution Guide

### Backend Paths

**Development Mode**:
- Source: `backend/src/server.ts`
- Compiled: `dist/backend/backend/src/server.js`
- Import paths from routes: `../services/DatabaseService.ts`
- Import paths from services: `../../models/Registration.ts`

**Docker Mode**:
- Working directory: `/app`
- Source scripts: Available at `backend/src/scripts/`
- Compiled: `dist/backend/backend/src/`
- Frontend build: `/app/frontend-build`

**Path Resolution Logic**:
- `__dirname` in compiled code: `dist/backend/backend/src/routes/`
- To get scripts: `../scripts/` → `dist/backend/backend/src/scripts/`
- To get root: `../../../../` → project root

### Frontend Paths

**Development Mode**:
- Source: `frontend/src/`
- Build output: `frontend/build/`
- Base path: `/8bp-rewards/`

**Production Mode (Consolidated)**:
- Frontend build copied to: `backend container /app/frontend-build`
- Served by: Express static middleware
- Route: `/8bp-rewards/*`

**API Paths**:
- Development: `http://localhost:2600/8bp-rewards/api/*`
- Production: `https://8bp.epildevconnect.uk/8bp-rewards/api/*`
- Config: Defined in `frontend/src/config/api.ts`

### Claimer Paths

**Root Level Claimers**:
- `playwright-claimer.js`: `/home/blake/8bp-rewards/playwright-claimer.js`
- Imports: `./services/database-service.js`
- Uses: `./claimer-utils.js`, `./browser-pool.js`

**Validation Script**:
- Source: `backend/src/scripts/registration-validation.ts`
- Called from: `backend/src/routes/registration.ts`
- Path resolution: Multiple fallback paths to find script
- Uses: `../../../services/database-service.js` or `../../../../services/database-service.js`

**First-Time Claim**:
- Location: `/home/blake/8bp-rewards/first-time-claim.js`
- Called from: `registration-validation.ts`
- Parameters: Command-line args `eightBallPoolId username`

### Service Paths

**Database Service**:
- TypeScript: `backend/src/services/DatabaseService.ts`
- Legacy JS: `services/database-service.js`
- Models: `backend/src/models/` or `models/postgresql/`

**Discord Service**:
- Location: `services/discord-service.js`
- Used by: Claimers, Discord bot, backend routes
- Path: Relative from root or absolute

### Import Patterns

**Backend Routes**:
```typescript
import { DatabaseService } from '../services/DatabaseService';
import { logger } from '../services/LoggerService';
import authRoutes from './routes/auth';
```

**Backend Services**:
```typescript
import { DatabaseService } from './DatabaseService';
import { Registration } from '../models/Registration';
```

**Claimers**:
```javascript
const DatabaseService = require('./services/database-service');
const { validateClaimResult } = require('./claimer-utils');
```

**Validation Script**:
```typescript
const DatabaseService = require('../../../services/database-service');
// Or try multiple paths
```

---

## File Naming Conventions

- **`.ts`**: TypeScript source files
- **`.tsx`**: TypeScript React components
- **`.js`**: JavaScript files (legacy or runtime)
- **`.d.ts`**: TypeScript definition files
- **`.json`**: Configuration/data files
- **`.yml`/`.yaml`**: YAML configuration
- **`.md`**: Markdown documentation
- **`.config.js`**: Configuration files

---

## Build Output Structure

**Backend Compilation**:
```
backend/src/                    → dist/backend/backend/src/
  routes/                         routes/
  services/                       services/
  models/                         models/
  scripts/                        scripts/
```

**Frontend Build**:
```
frontend/src/                   → frontend/build/
  (React compiles to static JS/CSS)
```

**Docker Image Structure**:
```
/app/
  dist/                          (Compiled backend)
  frontend-build/                (React build)
  backend/src/scripts/           (Source scripts for tsx)
  services/                      (JavaScript services)
  models/                        (Models)
  first-time-claim.js            (Root script)
```

---

## Common Import Patterns

### From Backend Routes

```typescript
// Services
import { DatabaseService } from '../services/DatabaseService';

// Models  
import { Registration } from '../models/Registration';

// Middleware
import { authenticateAdmin } from '../middleware/auth';

// Utils
import { initModuleHeartbeat } from '../utils/heartbeat-client';
```

### From Backend Services

```typescript
// Other services
import { logger } from './LoggerService';

// Database
import { DatabaseService } from './DatabaseService';

// Models
import { Registration } from '../models/Registration';
```

### From Claimers

```javascript
// Services
const DatabaseService = require('./services/database-service');
const DiscordService = require('./services/discord-service');

// Utils
const { validateClaimResult } = require('./claimer-utils');
const BrowserPool = require('./browser-pool');
```

### From Frontend

```typescript
// Components
import Layout from './components/Layout';

// Pages
import HomePage from './pages/HomePage';

// Config
import { API_ENDPOINTS } from './config/api';

// Hooks
import { useAuth } from './hooks/useAuth';
```

---

## Key Directories

**`backend/src/`**: Main backend source code (TypeScript)
**`frontend/src/`**: Frontend React source code
**`services/`**: Root-level JavaScript services
**`models/`**: Database models (mixed JS/TS)
**`scripts/`**: Utility scripts
**`docs/`**: Documentation
**`screenshots/`**: Captured screenshots (runtime data)
**`logs/`**: Application logs (runtime data)
**`dist/`**: Compiled backend output (generated)
**`frontend/build/`**: Compiled frontend output (generated)

---

This file structure document provides a complete overview of every file in the project. Use it as a reference when navigating the codebase or understanding how different components interact.

