# Next Steps - System Setup Checklist

## ✅ Completed
1. ✅ Cloudflare Tunnel created and running
2. ✅ Tunnel configuration updated for consolidated setup
3. ✅ Registration validation script fixed
4. ✅ Docker configuration consolidated
5. ✅ File structure documentation created

## 🔄 In Progress / Todo

### 1. Update DNS Record (MANUAL - Do This First!)
**Status:** ⚠️ REQUIRED

Go to Cloudflare Dashboard and update DNS:
1. Visit: https://dash.cloudflare.com/
2. Select domain: **epildevconnect.uk**
3. Go to: **DNS > Records**
4. Find **CNAME** record for **8bp**
5. Edit and change target to:
   ```
   3ebdc4f9-8bcb-4913-8336-19c295bdaff0.cfargotunnel.com
   ```
6. Ensure Proxy is ON (orange cloud)
7. Save

**After this, wait 1-2 minutes for DNS propagation.**

---

### 2. Start Docker Services
**Status:** ⚠️ READY TO START

```bash
cd /home/blake/8bp-rewards
docker-compose up -d
```

**This will start:**
- PostgreSQL database (port 5432)
- Backend API + Frontend (port 2600)
- Discord Status Bot

**Verify services:**
```bash
docker-compose ps
docker-compose logs -f backend
```

---

### 3. Verify Backend is Running
**Status:** ⚠️ NEEDS VERIFICATION

After Docker starts, check:
```bash
curl http://localhost:2600/api/status
curl http://localhost:2600/health
```

Should return JSON with system status.

---

### 4. Test End-to-End
**Status:** ⚠️ PENDING

1. **Local Test:**
   ```bash
   curl http://localhost:2600/8bp-rewards/
   ```

2. **Through Tunnel (after DNS update):**
   ```bash
   curl https://8bp.epildevconnect.uk/8bp-rewards/
   ```

3. **Frontend Test:**
   - Visit: https://8bp.epildevconnect.uk/8bp-rewards/
   - Should see the React frontend

4. **API Test:**
   - Visit: https://8bp.epildevconnect.uk/8bp-rewards/api/status
   - Should return JSON

---

### 5. Verify Registration Validation
**Status:** ⚠️ NEEDS TESTING

After backend is running, test registration:
1. Try registering a new user
2. Check logs for validation script execution
3. Verify it triggers first-time claim

**Check logs:**
```bash
docker-compose logs -f backend | grep -i validation
```

---

### 6. Verify Claimers
**Status:** ⚠️ NEEDS VERIFICATION

Check that claimer scripts are accessible:
```bash
# Should exist:
ls -la playwright-claimer.js
ls -la playwright-claimer-discord.js
ls -la first-time-claim.js

# Run verification script:
node scripts/verify-claimers.js
```

---

## 🚀 Quick Start Commands

**Start everything:**
```bash
cd /home/blake/8bp-rewards
docker-compose up -d
```

**Check status:**
```bash
# Docker services
docker-compose ps

# Backend health
curl http://localhost:2600/api/status

# Cloudflare tunnel
sudo systemctl status cloudflared-tunnel.service

# View logs
docker-compose logs -f backend
```

**Stop everything:**
```bash
docker-compose down
```

---

## 📊 System Status Endpoints

Once running, you can check:
- **System Status:** http://localhost:2600/api/status
- **Health Check:** http://localhost:2600/health
- **Scheduler:** http://localhost:2600/api/status/scheduler
- **Database:** http://localhost:2600/api/status/database
- **Discord Bot:** http://localhost:2600/api/status/discord-bot
- **Claimers:** http://localhost:2600/api/status/claimers

---

## ⚠️ Common Issues

**Backend not starting:**
- Check: `docker-compose logs backend`
- Verify: Database is healthy
- Check: Environment variables in .env

**Tunnel not connecting:**
- Check: `sudo journalctl -u cloudflared-tunnel.service -f`
- Verify: DNS is updated correctly
- Check: Backend is running on port 2600

**DNS not working:**
- Wait 2-5 minutes after updating
- Check: `dig 8bp.epildevconnect.uk CNAME`
- Verify: CNAME points to correct tunnel ID

---

## ✅ Completion Checklist

- [ ] DNS record updated in Cloudflare
- [ ] Docker services started
- [ ] Backend responding on port 2600
- [ ] Frontend accessible at /8bp-rewards/
- [ ] API endpoints working
- [ ] Registration flow tested
- [ ] Tunnel routing correctly
- [ ] All health checks passing

