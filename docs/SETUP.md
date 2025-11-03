# 🚀 Setup & Deployment Guide

Complete guide for setting up and deploying the 8BP Rewards System.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (Docker - Recommended)](#quick-start-docker---recommended)
3. [Manual Host Setup](#manual-host-setup)
4. [New Server Setup](#new-server-setup)
5. [Environment Configuration](#environment-configuration)
6. [Deployment Checklist](#deployment-checklist)
7. [Post-Deployment Verification](#post-deployment-verification)

---

## Prerequisites

### Required Software
- **Docker & Docker Compose** (recommended)
  ```bash
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  sudo apt-get install docker-compose-plugin
  sudo usermod -aG docker $USER
  ```

- **Node.js 18+** (for host deployment)
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```

- **PostgreSQL** (included in Docker, or install separately for host)
- **Git** (for cloning repository)

### Required Accounts
- Discord Developer Account (for bot)
- Cloudflare Account (for tunnel/domain)
- SMTP Email Provider (for email functionality)

---

## Quick Start (Docker - Recommended)

### 1. Clone Repository
```bash
git clone https://github.com/BlakeMcBride1625/8bp-rewards-v2.git
cd 8bp-rewards-v2
```

### 2. Environment Setup
```bash
# Copy environment template
cp env-template.txt .env

# Edit with your values
nano .env
```

**Critical Variables:**
```env
NODE_ENV=production
POSTGRES_HOST=postgres
POSTGRES_DB=8bp_rewards
POSTGRES_USER=admin
POSTGRES_PASSWORD=your_secure_password
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
OAUTH_REDIRECT_URI=https://yourdomain.com/8bp-rewards/auth/discord/callback
```

### 3. Build and Start
```bash
# Build all containers
docker-compose build

# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### 4. Initialize Database
```bash
# Run initialization script
docker-compose exec postgres psql -U admin -d 8bp_rewards -f /app/scripts/init-postgres.sql
```

### 5. Verify Services
```bash
# Check all containers are running
docker-compose ps

# Test backend health
curl http://localhost:2600/health

# View logs for any service
docker-compose logs -f backend
```

---

## Manual Host Setup

### 1. Install PostgreSQL
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2. Setup Database
```bash
sudo -u postgres psql
CREATE DATABASE 8bp_rewards;
CREATE USER admin WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE 8bp_rewards TO admin;
\q
```

### 3. Install Dependencies
```bash
npm install
cd frontend && npm install && cd ..
```

### 4. Build Project
```bash
npm run build:backend
cd frontend && npm run build && cd ..
```

### 5. Start Services
```bash
# Using provided scripts
./scripts/system/start-system.sh

# Or manually
npm run start:backend &
```

---

## New Server Setup

### Initial Server Configuration

1. **Update DNS** (if using domain)
   - Point A record to server IP
   - Or use Cloudflare Tunnel (recommended)

2. **Configure Firewall**
   ```bash
   sudo ufw allow 22/tcp    # SSH
   sudo ufw allow 2600/tcp  # Backend (if not using tunnel)
   sudo ufw enable
   ```

3. **Choose Access Method**
   - **Option A**: Direct IP/Port access (simpler, requires firewall config)
   - **Option B**: Cloudflare Tunnel (recommended - automatic SSL, better security)

### Cloudflare Tunnel Setup

```bash
# Install cloudflared
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Authenticate
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create 8bp-rewards-tunnel
cloudflared tunnel route dns 8bp-rewards-tunnel yourdomain.com

# Configure tunnel
mkdir -p ~/.cloudflared
# Copy cloudflare-tunnel.yml to ~/.cloudflared/config.yml

# Create systemd service
sudo tee /etc/systemd/system/cloudflared-tunnel.service > /dev/null <<EOF
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=/usr/bin/cloudflared tunnel --config $HOME/.cloudflared/config.yml run
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable cloudflared-tunnel
sudo systemctl start cloudflared-tunnel
```

See `INTEGRATION.md` for detailed Cloudflare setup.

---

## Environment Configuration

### Critical Production Variables

```env
# Node Environment (MUST be 'production' on VPS)
NODE_ENV=production

# Public URLs
PUBLIC_URL=https://yourdomain.com/8bp-rewards
OAUTH_REDIRECT_URI=https://yourdomain.com/8bp-rewards/auth/discord/callback

# Database (Docker)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=8bp_rewards
POSTGRES_USER=admin
POSTGRES_PASSWORD=secure_password

# Database (Host)
# POSTGRES_HOST=localhost
# POSTGRES_PORT=5432

# Discord
DISCORD_TOKEN=your_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_secret
REGISTRATION_CHANNEL_ID=your_channel_id

# Email
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_user
SMTP_PASS=your_password
MAIL_FROM=noreply@yourdomain.com
ADMIN_EMAILS=admin1@example.com,admin2@example.com
DISCORD_TO_EMAIL_MAPPING=discord_id1:email1@example.com,discord_id2:email2@example.com

# Security
JWT_SECRET=generate_strong_random_string
SESSION_SECRET=generate_strong_random_string
```

See `CONFIGURATION.md` for complete environment variable reference.

---

## Deployment Checklist

### Before Deployment
- [ ] All code committed and pushed to GitHub
- [ ] `.env` file created with production values
- [ ] `NODE_ENV=production` set
- [ ] Discord OAuth redirect URI configured for production domain
- [ ] PostgreSQL credentials configured
- [ ] All secrets secure (not in git)
- [ ] Docker installed and user in docker group (if using Docker)

### During Deployment
- [ ] Clone repository on server
- [ ] Copy and configure `.env` file
- [ ] Build containers (Docker) or install dependencies (Host)
- [ ] Initialize database
- [ ] Start services
- [ ] Verify all containers/services running

### Post-Deployment
- [ ] Website accessible at public URL
- [ ] Discord OAuth login works
- [ ] Admin dashboard accessible (authorized users only)
- [ ] Database connection successful
- [ ] Discord bot online and responding
- [ ] Email system functional
- [ ] VPS Monitor accessible (if configured)
- [ ] Automated claimer scheduled correctly

### Security Verification
- [ ] `.env` file NOT in git
- [ ] Development bypass disabled (automatic with `NODE_ENV=production`)
- [ ] Strong JWT secret generated
- [ ] All credentials secure
- [ ] Docker volumes configured for persistence
- [ ] Firewall configured (if not using tunnel)

---

## Post-Deployment Verification

### Health Checks
```bash
# Docker
docker-compose ps
docker-compose logs -f

# API Health
curl http://localhost:2600/health
curl http://localhost:2600/api/status

# Database Connection
docker-compose exec postgres psql -U admin -d 8bp_rewards -c "SELECT COUNT(*) FROM registrations;"
```

### Test Features
1. **Website Access**: Visit public URL
2. **Discord OAuth**: Attempt admin login
3. **Registration**: Test Discord registration command
4. **Manual Claim**: Trigger claim from admin dashboard
5. **Email**: Request VPS access code via email
6. **Discord Bot**: Use `/help` command in Discord

### Monitor Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f discord-api
docker-compose logs -f claimer

# Host services
sudo journalctl -u 8bp-rewards-backend -f
```

---

## Common Deployment Issues

### Docker Issues
- **Containers won't start**: Check `.env` file, verify all required variables set
- **Database connection failed**: Verify `POSTGRES_HOST=postgres` for Docker
- **Port conflicts**: Check `docker-compose ps` for port usage

### Host Issues
- **Services won't start**: Check PostgreSQL is running (`systemctl status postgresql`)
- **Permission errors**: Verify user permissions for logs and screenshots directories
- **Port already in use**: Use `scripts/system/check-port-conflicts.sh`

See `TROUBLESHOOTING.md` for more detailed solutions.

---

## Maintenance Commands

```bash
# Docker
docker-compose restart backend        # Restart specific service
docker-compose down && docker-compose up -d  # Full restart
docker-compose logs -f --tail=100    # View recent logs

# Database Backup (Docker)
docker-compose exec postgres pg_dump -U admin 8bp_rewards > backup.sql

# Database Backup (Host)
pg_dump -U admin 8bp_rewards > backup.sql

# Update and Redeploy
git pull
docker-compose up -d --build
```

---

*Last Updated: November 3, 2025*

