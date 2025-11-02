# 🎯 8BP Rewards - PM2 Setup (FINAL)

## ✅ What's Running

**Process Manager**: PM2  
**Database**: PostgreSQL (Docker)  
**Backend**: Node.js on port 2600  
**Frontend**: Nginx/Serve on port 2500  
**Tunnel**: Cloudflare (87.106.54.142)  

---

## 🚀 Quick Commands

### Start Everything:
```bash
./start-pm2.sh
```

### Stop Everything:
```bash
./stop-pm2.sh
```

### View Status:
```bash
pm2 status
```

### View Logs:
```bash
pm2 logs           # All logs
pm2 logs backend   # Backend only  
pm2 logs frontend  # Frontend only
pm2 logs --lines 100  # Last 100 lines
```

### Restart Services:
```bash
pm2 restart all
pm2 restart backend
pm2 restart frontend
```

### Monitor Resources:
```bash
pm2 monit
```

---

## 🌐 Access URLs

- **Frontend**: http://localhost:2500
- **Backend API**: http://localhost:2600/api/status
- **Public**: https://8bp.epildevconnect.uk/8bp-rewards/

---

## 📊 PM2 Auto-Start on Boot

PM2 is configured to start automatically on system boot.

**Status**:
```bash
sudo systemctl status pm2-blake
```

**If you add/remove apps**, save the list:
```bash
pm2 save
```

**To disable auto-start**:
```bash
pm2 unstartup
```

---

## 🐳 Database (Docker)

PostgreSQL runs in Docker for data persistence.

**Start database only**:
```bash
sudo docker-compose up -d database
```

**Stop database**:
```bash
sudo docker-compose down
```

**Database shell**:
```bash
sudo docker-compose exec database psql -U 8bp_user -d 8bp_rewards
```

---

## 🔧 Configuration Files

- `ecosystem.config.js` - PM2 process configuration
- `docker-compose.yml` - PostgreSQL database
- `.env` - Environment variables
- `start-pm2.sh` - Startup script
- `stop-pm2.sh` - Shutdown script

---

## 📝 Logs Location

All logs are in `./logs/`:
- `backend-out.log` - Backend stdout
- `backend-error.log` - Backend errors
- `frontend-out.log` - Frontend stdout
- `frontend-error.log` - Frontend errors

---

## 🆘 Troubleshooting

### Backend won't start:
```bash
pm2 logs backend --err
pm2 restart backend
```

### Frontend won't start:
```bash
pm2 logs frontend --err
pm2 restart frontend
```

### Database issues:
```bash
sudo docker-compose logs database
sudo docker-compose restart database
```

### Reset everything:
```bash
./stop-pm2.sh
sudo docker-compose down -v  # WARNING: Deletes database!
./start-pm2.sh
```

---

## ✨ What We Accomplished

1. ✅ Cloudflare Tunnel setup on new server (87.106.54.142)
2. ✅ Cleaned up Docker files (consolidated to one compose file)
3. ✅ Set up PM2 for process management
4. ✅ PostgreSQL in Docker
5. ✅ Backend + Frontend managed by PM2
6. ✅ Auto-start on boot configured
7. ✅ Deleted 14,387 old PNG screenshots
8. ✅ Fixed TypeScript build errors

---

## 🎯 Why PM2 Instead of Docker?

- **Simpler**: No Docker build issues
- **Faster**: No container overhead
- **Better logs**: PM2 has excellent log management
- **Auto-restart**: PM2 automatically restarts on crashes
- **Resource efficient**: Direct process management
- **Easy monitoring**: `pm2 monit` shows real-time stats

---

## 📌 System Status

**Server IP**: 87.106.54.142  
**Domain**: 8bp.epildevconnect.uk  
**Setup Date**: October 28, 2025  
**Status**: ✅ All systems operational

---

**Created by**: AI Assistant  
**Last Updated**: October 28, 2025  



