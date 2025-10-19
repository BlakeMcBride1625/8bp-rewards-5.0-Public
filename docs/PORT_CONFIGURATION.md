# 8BP Rewards System - Port Configuration

## 🎯 **STANDARDIZED PORT ASSIGNMENTS**

### **Core 8BP Services:**
- **Backend API**: `2600` ✅ (Currently working)
- **Frontend React**: `2500` ✅ (Currently configured)
- **Discord Bot API**: `2700` ✅ (Updated from 3001)

### **Database Services:**
- **MongoDB**: `27017` ✅ (Standard MongoDB port)

### **External Services (Avoid these ports):**
- **Zipline**: `3000` ⚠️ (Conflict - avoid)
- **MySQL**: `3356` ✅ (No conflict)
- **Nginx**: `3300` ✅ (No conflict)
- **Portainer**: `8000`, `9443` ✅ (No conflict)
- **Uptime Kuma**: `3001` ✅ (No conflict)

## 🔧 **CONFIGURATION FILES TO UPDATE:**

### 1. Environment Variables (.env)
```env
# 8BP Rewards Ports
BACKEND_PORT=2600
FRONTEND_PORT=2500

# Avoid these ports (used by other services):
# 3000 - Zipline
# 3001 - Uptime Kuma
# 3300 - Nginx
# 3356 - MySQL
# 8000, 9443 - Portainer
```

### 2. Docker Compose (docker-compose.yml)
```yaml
services:
  backend:
    ports:
      - "2600:2600"  # Backend API
  
  frontend:
    ports:
      - "2500:2500"  # Frontend React App
```

### 3. Package.json Scripts
```json
{
  "start:frontend": "PORT=2500 react-scripts start"
}
```

## ✅ **RECOMMENDED PORT RANGES:**

### **8BP System Ports (Reserved):**
- `2500-2599` - Frontend and related services
- `2600-2699` - Backend API and related services  
- `2700-2799` - Discord Bot API and related services

### **Avoid These Ports:**
- `3000` - Zipline service
- `3001` - Uptime Kuma
- `3300` - Nginx proxy
- `3356` - MySQL database
- `8000`, `9443` - Portainer
- `27017` - MongoDB (standard)

## 🚀 **IMPLEMENTATION:**

1. ✅ Backend already using port `2600` correctly
2. ✅ Frontend already configured for port `2500`
3. ✅ No conflicts with current setup
4. ⚠️ Ensure no other services try to use these ports

## 🔍 **VERIFICATION COMMANDS:**

```bash
# Check current port usage
ss -tlnp | grep -E "(2500|2600|27017)"

# Check for conflicts
netstat -tulpn | grep -E "(2500|2600|27017)"

# Test backend
curl http://localhost:2600/

# Test frontend
curl http://localhost:2500/
```

## 📝 **NOTES:**

- Port `2600` and `2500` are currently working without conflicts
- The main issue was multiple processes trying to start on the same port
- Docker containers are properly isolated and not conflicting
- Standardized configuration will prevent future conflicts





