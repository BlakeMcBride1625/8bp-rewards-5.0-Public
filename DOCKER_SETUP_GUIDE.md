# 🐳 Complete Docker Setup Guide for 8BP Rewards

## 📋 **What You Have Now**

Your Docker setup is **100% complete** with all necessary files! Here's what's included:

### ✅ **All Claimer Scripts**
- `playwright-claimer-discord.js` - Main Discord-integrated claimer
- `playwright-claimer.js` - Standalone claimer
- `first-time-claim.js` - Single user claimer
- `src/8bp-claimer.ts` - TypeScript claimer
- `src/run-once.ts` - One-time execution script

### ✅ **All Required Dependencies**
- `claimer-utils.js` - Claim validation logic
- `browser-pool.js` - Browser management
- `services/` - All service files
- `models/` - Database models
- `scripts/` - Utility scripts
- `archive/` - Optional image generator

### ✅ **All Configuration Files**
- `tsconfig.backend.json` & `tsconfig.json` - TypeScript configs
- `env-template.txt` & `env.docker` - Environment templates
- `user-mapping.json` - User configuration
- `package.json` - Dependencies

### ✅ **Test Files**
- `test-discord.js` - Discord bot testing
- `test-mongodb.js` - Database testing

---

## 🚀 **How to Use Docker (Beginner Guide)**

### **1. Prerequisites**
```bash
# Install Docker (if not already installed)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### **2. Environment Setup**
```bash
# Copy the environment template
cp env-template.txt .env

# Edit with your actual values
nano .env
```

**Required Environment Variables:**
```env
# MongoDB
MONGO_URI=mongodb://mongodb:27017/8bp_rewards
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=your_secure_password

# Discord Bot
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret

# User IDs (comma-separated)
USER_IDS=3057211056,1826254746

# Other settings
NODE_ENV=production
HEADLESS=true
```

### **3. Build and Run**
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

### **4. Testing Your Setup**
```bash
# Test MongoDB connection
docker-compose exec backend node test-mongodb.js

# Test Discord bot
docker-compose exec discord-bot node test-discord.js

# Test manual claim
docker-compose exec backend node playwright-claimer-discord.js
```

---

## 🎯 **What Each Container Does**

### **🐳 mongodb Container**
- **Purpose**: Database storage
- **Port**: 27017
- **Data**: Persistent MongoDB data
- **Health Check**: Automatic MongoDB ping

### **🐳 backend Container**
- **Purpose**: Main API server + Web dashboard
- **Port**: 2600
- **Features**: 
  - REST API endpoints
  - Admin dashboard
  - Manual claim triggers
  - Screenshot management
- **Health Check**: HTTP health endpoint

### **🐳 discord-bot Container**
- **Purpose**: Discord bot + Automated claiming
- **Port**: 2700
- **Features**:
  - Discord bot commands
  - Scheduled daily claims
  - User registration
  - Notifications
- **Health Check**: Bot status check

---

## 🔧 **Docker Commands You'll Need**

### **Basic Operations**
```bash
# Start everything
docker-compose up -d

# Stop everything
docker-compose down

# Restart everything
docker-compose restart

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend
docker-compose logs -f discord-bot
docker-compose logs -f mongodb
```

### **Individual Container Management**
```bash
# Execute commands in containers
docker-compose exec backend bash
docker-compose exec discord-bot node playwright-claimer-discord.js
docker-compose exec mongodb mongosh

# Rebuild specific container
docker-compose build backend
docker-compose up -d backend
```

### **Debugging**
```bash
# Check container status
docker-compose ps

# Check resource usage
docker stats

# View container details
docker-compose exec backend cat /app/logs/backend.log
```

---

## 📊 **Monitoring Your System**

### **Health Checks**
All containers have automatic health checks:
- **MongoDB**: Database connectivity
- **Backend**: HTTP health endpoint
- **Discord Bot**: Bot status verification

### **Logs Location**
- **Container Logs**: `docker-compose logs`
- **Application Logs**: `./logs/` directory (mounted as volume)
- **Screenshots**: `./screenshots/` directory (mounted as volume)

### **Web Dashboard**
- **URL**: `http://localhost:2600/8bp-rewards`
- **Admin Panel**: `http://localhost:2600/8bp-rewards/admin-dashboard`
- **System Status**: `http://localhost:2600/8bp-rewards/system-status`

---

## 🛠️ **Troubleshooting**

### **Common Issues**

**1. Container Won't Start**
```bash
# Check logs
docker-compose logs [service-name]

# Check environment variables
docker-compose exec backend env | grep MONGO
```

**2. Database Connection Issues**
```bash
# Test MongoDB
docker-compose exec backend node test-mongodb.js

# Check MongoDB logs
docker-compose logs mongodb
```

**3. Discord Bot Issues**
```bash
# Test Discord connection
docker-compose exec discord-bot node test-discord.js

# Check bot logs
docker-compose logs discord-bot
```

**4. Claims Not Working**
```bash
# Test manual claim
docker-compose exec backend node playwright-claimer-discord.js

# Check screenshot permissions
docker-compose exec backend ls -la /app/screenshots/
```

### **Reset Everything**
```bash
# Stop and remove everything
docker-compose down -v

# Remove all images
docker system prune -a

# Rebuild from scratch
docker-compose build --no-cache
docker-compose up -d
```

---

## 🎉 **You're All Set!**

Your Docker setup includes **everything** needed for the 8BP Rewards system:

✅ **All claimer scripts** - Every claiming method works  
✅ **Complete dependencies** - No missing files  
✅ **Proper configuration** - All configs included  
✅ **Test utilities** - Easy debugging  
✅ **Persistent data** - Logs and screenshots saved  
✅ **Health monitoring** - Automatic status checks  
✅ **Easy management** - Simple Docker commands  

**Next Steps:**
1. Set up your `.env` file with real values
2. Run `docker-compose up -d`
3. Test with the provided test scripts
4. Access the web dashboard at `http://localhost:2600/8bp-rewards`

Your system is **production-ready**! 🚀
