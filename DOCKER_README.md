# 🐳 8BP Rewards System - Docker Setup

## 📋 What We Did

### ✅ Cleaned Up Docker Files
**Removed** (consolidated into ONE docker-compose.yml):
- `docker-compose.hybrid.yml` 
- `docker-compose.simple.yml`
- `Dockerfile.backend`
- `Dockerfile.discord`
- `start-hybrid.sh`
- `stop-hybrid.sh`

**Now you have** (clean and simple):
- `docker-compose.yml` - ONE file for ALL services
- `Dockerfile` - Multi-stage build for backend + frontend
- `discord-status-bot/Dockerfile` - Discord bot
- `docker-start.sh` - Simple start script
- `docker-stop.sh` - Simple stop script
- `docker-logs.sh` - View logs

---

## 🚀 Quick Start

### Start Everything:
```bash
./docker-start.sh
```

### Stop Everything:
```bash
./docker-stop.sh
```

### View Logs:
```bash
# All services
./docker-logs.sh

# Specific service
./docker-logs.sh backend
./docker-logs.sh frontend
./docker-logs.sh discord-bot
./docker-logs.sh database
```

---

## 📦 What's Running in Docker

1. **PostgreSQL Database** (`database`)
   - Port: `5432`
   - Container: `8bp-database`
   - Data stored in Docker volume: `postgres_data`

2. **Backend API** (`backend`)
   - Port: `2600`
   - Container: `8bp-backend`
   - Built from TypeScript source

3. **Frontend React App** (`frontend`)
   - Port: `2500`
   - Container: `8bp-frontend`
   - Served via Nginx

4. **Discord Status Bot** (`discord-bot`)
   - Container: `8bp-discord-bot`
   - Monitors backend health

---

## 🌐 Access Your Application

- **Frontend**: http://localhost:2500 or https://8bp.epildevconnect.uk/8bp-rewards/
- **Backend API**: http://localhost:2600
- **Database**: localhost:5432 (from host)

---

## ⚙️ Configuration

### Environment Variables
All configuration is in your `.env` file. Docker Compose reads this file and passes variables to containers.

**Important**: `.env` stays on the host machine (NOT copied into Docker images for security).

### Required Variables:
```env
# Database
POSTGRES_DB=8bp_rewards
POSTGRES_USER=8bp_user
POSTGRES_PASSWORD=your_password_here

# Server
BACKEND_PORT=2600
FRONTEND_PORT=2500

# Discord
DISCORD_TOKEN=your_token_here
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_secret

# Security
SESSION_SECRET=your_session_secret
JWT_SECRET=your_jwt_secret
```

---

## 🔧 Useful Commands

### View Container Status:
```bash
sudo docker-compose ps
```

### Restart a Service:
```bash
sudo docker-compose restart backend
sudo docker-compose restart frontend
sudo docker-compose restart discord-bot
```

### Rebuild a Service:
```bash
sudo docker-compose up -d --build backend
```

### View Resource Usage:
```bash
sudo docker stats
```

### Access Container Shell:
```bash
sudo docker-compose exec backend sh
sudo docker-compose exec database psql -U 8bp_user -d 8bp_rewards
```

### Clean Everything (including data):
```bash
sudo docker-compose down -v
sudo docker system prune -af
```

---

## 📝 Logs Location

- **Backend**: `/app/logs` (mounted from `./logs`)
- **Screenshots**: `/app/screenshots` (mounted from `./screenshots`)
- **Backups**: `/app/backups` (mounted from `./backups`)

These directories are mounted as volumes, so data persists even if containers are removed.

---

## 🐛 Troubleshooting

### Build Fails:
```bash
# Clean everything and rebuild
sudo docker-compose down
sudo docker system prune -af
./docker-start.sh
```

### Container Won't Start:
```bash
# Check logs
sudo docker-compose logs backend
sudo docker-compose logs database

# Check if ports are in use
ss -tlnp | grep -E "(2500|2600|5432)"
```

### Database Issues:
```bash
# Connect to database
sudo docker-compose exec database psql -U 8bp_user -d 8bp_rewards

# Reset database (WARNING: deletes all data!)
sudo docker-compose down -v
./docker-start.sh
```

### Frontend Not Loading:
```bash
# Rebuild frontend
sudo docker-compose up -d --build frontend

# Check Nginx logs
sudo docker-compose logs frontend
```

---

## 📊 Performance

### Build Time Optimizations:
- `.dockerignore` excludes unnecessary files
- Multi-stage builds reduce final image size
- Build cache reused when possible

### Before Optimization:
- Build context: **4.3GB** ❌
- Build time: **10+ minutes**

### After Optimization:
- Build context: **3.6MB** ✅
- Build time: **~2-3 minutes**

---

## 🔄 Updates & Maintenance

### Update Code:
```bash
git pull
./docker-stop.sh
./docker-start.sh  # Rebuilds automatically
```

### Backup Database:
```bash
sudo docker-compose exec database pg_dump -U 8bp_user 8bp_rewards > backup.sql
```

### Restore Database:
```bash
cat backup.sql | sudo docker-compose exec -T database psql -U 8bp_user -d 8bp_rewards
```

---

## ✅ Health Checks

All services have built-in health checks:
- **Database**: Checks PostgreSQL is ready
- **Backend**: Hits `/api/status` endpoint
- **Frontend**: Checks Nginx is serving

View health status:
```bash
sudo docker-compose ps
```

Healthy services show: `Up (healthy)`

---

## 🎯 Next Steps

1. ✅ Cloudflare Tunnel running
2. ✅ All services in Docker
3. ✅ Environment configured
4. 🔄 Wait for initial build to complete
5. 🌐 Test application access
6. 📱 Verify Discord bot connection

---

## 💡 Tips

- Use `./docker-logs.sh backend -f` to follow logs in real-time
- Backend auto-rebuilds when you run `docker-start.sh` if code changed
- Database data persists in Docker volume (survives container restarts)
- Check Cloudflare tunnel: `sudo systemctl status cloudflared-tunnel`

---

**Created**: October 28, 2025  
**Server IP**: 87.106.54.142  
**Domain**: 8bp.epildevconnect.uk



