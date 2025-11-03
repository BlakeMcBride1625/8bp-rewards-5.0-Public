# Scripts Directory

This directory contains utility scripts organized by category for the 8 Ball Pool Rewards System.

## Directory Structure

```
scripts/
├── system/          # System management and deployment scripts
├── docker/          # Docker-related scripts
├── cloudflare/      # Cloudflare Tunnel and DNS management
├── database/        # Database operations and migrations
└── README.md        # This file
```

## System Scripts (`system/`)

| Script | Description | Usage |
|--------|-------------|-------|
| `start-system.sh` | Start all services on host (PostgreSQL, backend, frontend) | `./scripts/system/start-system.sh` |
| `stop-system.sh` | Stop all services running on host | `./scripts/system/stop-system.sh` |
| `start-pm2.sh` | Start services using PM2 process manager | `./scripts/system/start-pm2.sh` |
| `stop-pm2.sh` | Stop PM2-managed services | `./scripts/system/stop-pm2.sh` |
| `setup-new-server.sh` | Initial server setup (firewall, Cloudflare tunnel) | `./scripts/system/setup-new-server.sh` |
| `deploy.sh` | Deployment automation script | `./scripts/system/deploy.sh` |
| `fix-screenshot-permissions.sh` | Fix permissions on screenshots directory | `./scripts/system/fix-screenshot-permissions.sh` |
| `vps-setup.sh` | VPS initial configuration script | `./scripts/system/vps-setup.sh` |
| `check-port-conflicts.sh` | Check for port conflicts before starting services | `./scripts/system/check-port-conflicts.sh` |
| `rename-project.sh` | Utility to rename project references | `./scripts/system/rename-project.sh` |

## Docker Scripts (`docker/`)

Docker-related scripts will be placed here. Currently, Docker deployment is managed via `docker-compose.yml` at the project root.

## Cloudflare Scripts (`cloudflare/`)

| Script | Description | Usage |
|--------|-------------|-------|
| `quick-tunnel-setup.sh` | Quick setup for Cloudflare Tunnel | `./scripts/cloudflare/quick-tunnel-setup.sh` |
| `setup-cloudflare-tunnel.sh` | Full Cloudflare Tunnel setup | `./scripts/cloudflare/setup-cloudflare-tunnel.sh` |
| `create-cloudflare-tunnel.sh` | Create a new Cloudflare Tunnel | `./scripts/cloudflare/create-cloudflare-tunnel.sh` |
| `update-cloudflare-tunnel.sh` | Update existing tunnel configuration | `./scripts/cloudflare/update-cloudflare-tunnel.sh` |
| `fix-cloudflare-tunnel.sh` | Fix common Cloudflare Tunnel issues | `./scripts/cloudflare/fix-cloudflare-tunnel.sh` |
| `setup-new-cloudflare-tunnel.sh` | Setup tunnel for new server | `./scripts/cloudflare/setup-new-cloudflare-tunnel.sh` |
| `update-dns-route.sh` | Update DNS routing for tunnel | `./scripts/cloudflare/update-dns-route.sh` |

## Database Scripts (`database/`)

| Script | Description | Usage |
|--------|-------------|-------|
| `add-users.sh` | Add users to PostgreSQL database | `./scripts/database/add-users.sh` |
| `verify-user-count.sh` | Verify user count in database | `./scripts/database/verify-user-count.sh` |

## Other Scripts (Root of `scripts/`)

| Script | Description | Usage |
|--------|-------------|-------|
| `check-port-conflicts.sh` | Check for port conflicts | `./scripts/check-port-conflicts.sh` |
| `init-postgres.sql` | PostgreSQL initialization SQL | `psql -f scripts/init-postgres.sql` |
| Various `.js` files | Migration and utility scripts | See individual script comments |

## Usage Guidelines

1. **Always review scripts** before running them, especially those that modify system configuration
2. **Run as appropriate user** - Some scripts require `sudo`, others should run as your user
3. **Check prerequisites** - Most scripts require certain services or configurations to be in place
4. **Backup first** - Database and system scripts may modify data

## Quick Reference

### Starting the System (Docker - Recommended)
```bash
docker-compose up -d
```

### Starting the System (Host)
```bash
./scripts/system/start-system.sh
```

### Setting Up New Server
```bash
./scripts/system/setup-new-server.sh
```

### Adding Users to Database
```bash
./scripts/database/add-users.sh
```

### Cloudflare Tunnel Setup
```bash
./scripts/cloudflare/quick-tunnel-setup.sh
```

## Notes

- All scripts use bash (`#!/bin/bash`)
- Scripts include error handling (`set -e`) where appropriate
- Color-coded output for better readability
- Most scripts provide usage instructions when run with `--help` or without arguments

