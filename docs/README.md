[Docs Index](./index.md) · [Shell Utilities](./shell.md)

# 8 Ball Pool Rewards System (Full Stack) — Deep Documentation

This repository contains a production-grade system that automates claiming rewards from the 8 Ball Pool shop, exposes an admin web interface, integrates with Discord for status and notifications, and persists data in MongoDB. It includes a React frontend, a Node.js/Express backend, Discord bot, Playwright automation, screenshots management, and a complete deployment toolchain (systemd and Docker).

This README is an exhaustive, practical guide to every feature, configuration, script, and operational task in the project.

## Contents
- Overview and Goals
- System Architecture
- Directory Walkthrough
- Frontend (React + TS + Tailwind)
- Backend (Express + TS)
- Automation (Playwright Claimers)
- Screenshots and Confirmation Images
- Discord Bot and Service
- Database Models and Data Flow
- Logging, Metrics, and Health
- Configuration (.env)
- Local Development
- Production Deployment (systemd, Docker, Cloudflare)
- Operations: Backups, Maintenance, and Cleanup
- Troubleshooting and FAQ

---

## Overview and Goals

- Automate reward claims for registered users reliably and safely
- Provide an admin dashboard for monitoring, user management, and tooling
- Notify admins on Discord for runs, successes, and failures
- Persist state and logs in MongoDB for auditability
- Offer flexible deployment: bare metal (systemd) or Docker

Key traits:
- Robust error handling with retries and clear logging
- Tunable concurrency for Playwright to match server capacity
- Screenshot capture for each stage; optional confirmation image generation
- Secure access to admin features via Discord OAuth2

---

## System Architecture

```
Browser (User) → Frontend (React) → Backend API (Express) → MongoDB
                                     ↘ Discord Bot (discord.js)
Automation (Playwright claimers) → Backend + Discord + Screenshots
```

- Frontend serves the admin UI and public pages
- Backend exposes REST endpoints, authentication, and screenshot APIs
- Discord bot offers slash-commands and notifications
- Playwright claimers run scheduled or on-demand claim tasks
- MongoDB stores registrations, claim records, and logs

Ports and hosting:
- Backend default port: 2600
- Frontend hosted at `PUBLIC_URL` (build assumes `/8bp-rewards/` path)

---

## Directory Walkthrough

```
8bp-rewards/
├── backend/
│   └── src/
│       ├── middleware/        # auth, errors, request logging
│       ├── models/            # TS models/interfaces (compiled to dist)
│       ├── routes/            # Express routes (e.g., screenshots API)
│       ├── services/          # Business logic (database, schedulers)
│       └── server.ts          # Express app bootstrap
├── dist/backend/              # Compiled backend (tsc)
├── frontend/
│   ├── public/                # favicon, logos, static assets
│   │   └── assets/logos/8logo.png  # High-quality site logo
│   ├── src/
│   │   ├── components/        # Layout, modals, trackers, etc.
│   │   ├── pages/             # Admin dashboard, status, register, etc.
│   │   └── hooks/             # Authentication hook
│   └── build/                 # Production build output
├── screenshots/               # Captured site screenshots
│   ├── confirmation/          # Confirmation images (featured first)
│   ├── final-page/
│   ├── go-click/
│   ├── id-entry/
│   ├── login/
│   └── shop-page/
├── services/database-service.js # MongoDB connection + DB methods
├── playwright-claimer.js        # Claimer (web) runner
├── playwright-claimer-discord.js# Claimer with Discord confirmations
├── browser-pool.js              # Concurrency control
├── discord-bot.js               # Discord bot entrypoint
├── discord-service.js           # Discord helpers
├── scripts/                     # Utilities (migration, port checks)
├── docker-compose.yml + Dockerfiles
└── setup-, deploy-, env-*.md    # Guides and setup scripts
```

---

## Frontend (React + TypeScript + Tailwind)

Highlights:
- Pages: Home, Register, Contact, Leaderboard, System Status, Admin Dashboard
- Secure admin access via Discord OAuth2
- Header uses the project logo at `/assets/logos/8logo.png`
- Favicon and PWA icons: `favicon.ico`, `logo192.png`, `logo512.png`
- Screenshots admin UI uses the backend screenshots API

Key files:
- `frontend/src/components/Layout.tsx`: Navigation, branding, auth-aware header
- `frontend/src/pages/*`: Page-level features
- `frontend/src/config/api.ts`: API host configuration

Build and run:
```bash
npm run build:frontend
cd frontend && npm start
```

---

## Backend (Express + TypeScript)

Highlights:
- REST API with session auth and Discord OAuth2 for admin routes
- Screenshot management API including folder ordering and deletion
- Health endpoints for system status

Key files:
- `backend/src/server.ts`: App bootstrap and middleware
- `backend/src/routes/screenshots.ts`: Screenshot folders, listing, view, clear
- `backend/src/services/*`: Business logic (e.g., schedulers)

Build and run:
```bash
npm run build:backend
npm run start:backend
```

---

## Automation (Playwright Claimers)

- `playwright-claimer.js`: Core claiming logic and optional scheduling
- `playwright-claimer-discord.js`: Same as above with Discord confirmations
- `browser-pool.js`: Controls concurrency; default set to 6 for stability

Typical usage:
```bash
npm run claim              # One-off run
npm run schedule           # Run on a schedule (web)
npm run claim-discord      # One-off run with Discord confirmations
npm run schedule-discord   # Scheduled with Discord confirmations
```

Tuning:
- To reduce errors like “Target page/context closed,” adjust `browser-pool.js` max concurrency
- Ensure Playwright browsers are installed on the host: `npx playwright install`

---

## Screenshots and Confirmation Images

- Capture at multiple stages: `shop-page`, `id-entry`, `login`, `go-click`, `final-page`
- Confirmation images are generated to `screenshots/confirmation/`
- Backend exposes folders to the admin UI; order is:
  1) confirmation, 2) shop-page, 3) id-entry, 4) go-click, 5) login, 6) initial, 7) final-page

Permissions:
- Ensure the `screenshots/` directory is writable by the runtime user
  ```bash
  chmod -R 775 screenshots
  ```

Cleanup:
- Admin endpoints allow clearing per-user or all screenshots (auth required)

---

## Discord Bot and Service

Features:
- Slash-commands for status checks and administration
- Notifies scheduler results and important failures

Run locally:
```bash
npm run bot
```

Notes:
- Confirmation sending uses `playwright-claimer-discord.js` logic; the core `discord-service.js` stays minimal (no custom `sendConfirmation` method is required by design).

---

## Database Models and Data Flow

Collections (conceptual):
- Registration: `{ eightBallPoolId, username, createdAt, updatedAt }`
- ClaimRecord: `{ eightBallPoolId, websiteUserId, status, itemsClaimed[], error?, claimedAt, schedulerRun }`
- Logs: Stored via Winston transports (file and/or MongoDB)

DB access:
- `services/database-service.js` encapsulates MongoDB connection and CRUD helpers used across the app and scripts.

Backups:
- JSON backups stored under `database-backups/` (various scripts generate them before destructive operations)

---

## Logging, Metrics, and Health

Health endpoints (examples):
- `GET /api/status` — overall status
- `GET /api/status/database` — DB health
- `GET /api/status/scheduler` — scheduler status

Logs:
- Application logs in `logs/` and rotated combined logs at root for historical reference
- Discord and backend service logs in respective `*.log` files and systemd journal

---

## Configuration (.env)

Copy template and update values:
```bash
cp env-template.txt .env
```

Important variables (representative):
- `MONGO_URI` — MongoDB connection string
- `BACKEND_PORT` / `FRONTEND_PORT` — service ports
- `PUBLIC_URL` — public base URL, used by frontend build
- Discord OAuth2: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`, `ALLOWED_ADMINS`
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_TO`

---

## Local Development

Install all dependencies:
```bash
npm run install:all
```

Start everything for development:
```bash
npm run dev
```

Individually:
```bash
npm run dev:backend
cd frontend && npm start
```

---

## Production Deployment

### Systemd (example names)
- Backend service: `8bp-rewards-backend`
- Discord service: `8bp-rewards-discord`

Common commands:
```bash
sudo systemctl status 8bp-rewards-backend
sudo systemctl restart 8bp-rewards-backend
sudo journalctl -u 8bp-rewards-backend -f
```

### Docker
```bash
npm run docker:build
npm run docker:up
npm run docker:logs
```

### Cloudflare Tunnels
Use `setup-cloudflare-tunnel.sh` and `cloudflare-tunnel.yml` to expose services securely.

---

## Operations: Backups, Maintenance, and Cleanup

- `remove-failed-claims.js` — purge failed claims (creates backups before mutation)
- `scripts/migrate-to-mongodb.js` — data migrations when needed
- `fix-screenshot-permissions.sh` — reset screenshot directory permissions
- `check-port-conflicts.sh` — detect conflicting services (e.g., port 2600 in use)

Housekeeping tips:
- Rotate logs regularly (or ship to a centralized log store)
- Periodically clean old screenshots if storage is limited
- Keep Playwright browsers installed and caches cleaned

---

## Troubleshooting and FAQ

1) Too many Playwright timeouts / Target closed
- Reduce concurrency in `browser-pool.js` (e.g., `maxConcurrent = 6`)
- Ensure adequate CPU/RAM and that no zombie Playwright processes exist

2) Screenshots failing with EACCES
- Fix permissions: `chmod -R 775 screenshots`
- Ensure service user owns the directories

3) Discord bot not online / DND state unexpected
- Check token and intents; restart the service
- Verify network/firewall access

4) API returns HTML instead of JSON
- Confirm you are calling the correct backend port (default 2600)

5) Images missing on the website
- Place brand assets in `frontend/public/` (favicon, logo192, logo512)
- Header logo path should be `/assets/logos/8logo.png`

6) Deleting screenshots removed other assets?
- Screenshot tooling only affects the `screenshots/` directory; public assets live under `frontend/public/`

---

## Scripts Reference (root `package.json`)

```json
{
  "build": "npm run build:backend && npm run build:frontend",
  "build:backend": "tsc -p tsconfig.backend.json",
  "build:frontend": "cd frontend && npm run build",
  "start": "npm run start:backend",
  "start:backend": "node dist/backend/server.js",
  "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
  "dev:backend": "nodemon --exec ts-node backend/src/server.ts",
  "dev:frontend": "cd frontend && npm start",
  "claim": "node playwright-claimer.js",
  "claim-discord": "node playwright-claimer-discord.js",
  "schedule": "node playwright-claimer.js --schedule",
  "schedule-discord": "node playwright-claimer-discord.js --schedule",
  "test-discord": "node test-discord.js",
  "test-mongodb": "node test-mongodb.js",
  "docker:build": "docker-compose build",
  "docker:up": "docker-compose up -d"
}
```

---

## License

MIT — see `LICENSE` if present. Use responsibly and comply with the upstream website’s terms of service.

---

Version: 2.0.0
Last Updated: 2025-10-06
