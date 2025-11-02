# 🚀 New Server Setup Guide - 8BP Rewards System

## Server Information
- **New Server IP**: `87.106.54.142`
- **Domain**: `8bp.epildevconnect.uk`
- **Date**: October 28, 2025

---

## 📋 Quick Setup Checklist

### Step 1: Update DNS (✅ Already Done)
You've already updated the A record to point to `87.106.54.142`.

### Step 2: Choose Your Setup Method

#### Option A: Direct IP Access (Simple) ✅
**Status**: Already working via A record update
- Your services will be accessible at `http://87.106.54.142:2500` (frontend) and `http://87.106.54.142:2600` (backend)
- You'll need to configure SSL manually (Let's Encrypt)
- Ports 2500 and 2600 must be open on your firewall

#### Option B: Cloudflare Tunnel (Recommended) 🔒
**Benefits**:
- Automatic SSL/TLS
- No open ports needed
- DDoS protection
- Better security

---

## 🔧 Setup Instructions for New Server

### Prerequisites to Install on New Server:

1. **Node.js & NPM**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

2. **Docker & Docker Compose**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo apt-get install docker-compose-plugin
sudo usermod -aG docker $USER
```

3. **MongoDB**
```bash
# See MONGODB_SETUP.md in docs folder
```

4. **Cloudflared (for Tunnel option)**
```bash
# Download and install cloudflared
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

---

## 🌐 Cloudflare Tunnel Setup (Option B)

### Step 1: Install Cloudflared on New Server
```bash
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

### Step 2: Authenticate with Cloudflare
```bash
cloudflared tunnel login
```
This will open a browser window. Login and select your domain `epildevconnect.uk`.

### Step 3: Delete Old Tunnel (if you can't access old server)
```bash
# List all tunnels
cloudflared tunnel list

# Delete the old tunnel if needed
cloudflared tunnel delete 8bp-rewards-tunnel
```

### Step 4: Create New Tunnel
```bash
# Create new tunnel
cloudflared tunnel create 8bp-rewards-tunnel

# Create DNS route
cloudflared tunnel route dns 8bp-rewards-tunnel 8bp.epildevconnect.uk
```

### Step 5: Copy Configuration
```bash
# From your project directory on NEW server
cd /home/blake/8bp-rewards
mkdir -p ~/.cloudflared
cp cloudflare-tunnel.yml ~/.cloudflared/config.yml
```

### Step 6: Update Credentials Path
After creating the tunnel, you'll get a credentials file. Note the UUID and update `cloudflare-tunnel.yml`:

```yaml
credentials-file: /home/blake/.cloudflared/YOUR-NEW-TUNNEL-UUID.json
```

### Step 7: Install and Start Systemd Service
```bash
# Create systemd service
sudo tee /etc/systemd/system/cloudflared-tunnel.service > /dev/null <<EOF
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
User=blake
ExecStart=/usr/bin/cloudflared tunnel --config /home/blake/.cloudflared/config.yml run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable cloudflared-tunnel.service
sudo systemctl start cloudflared-tunnel.service

# Check status
sudo systemctl status cloudflared-tunnel.service
```

---

## 🔍 Verification Steps

### Check if Services are Running:
```bash
# Check backend
curl http://localhost:2600/api/health || curl http://localhost:2600/

# Check frontend
curl http://localhost:2500/

# Check tunnel status (if using tunnel)
sudo systemctl status cloudflared-tunnel.service

# View tunnel logs
sudo journalctl -u cloudflared-tunnel.service -f
```

### Check DNS:
```bash
# Verify DNS propagation
dig 8bp.epildevconnect.uk
nslookup 8bp.epildevconnect.uk
```

### Test from External:
```bash
# If using A record directly
curl http://87.106.54.142:2500/
curl http://87.106.54.142:2600/api/health

# If using tunnel
curl https://8bp.epildevconnect.uk/8bp-rewards/
```

---

## 🔥 Firewall Configuration

### If Using Direct IP (A Record):
```bash
# Allow required ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 2500/tcp  # Frontend
sudo ufw allow 2600/tcp  # Backend
sudo ufw allow 2700/tcp  # Discord Bot
sudo ufw enable
```

### If Using Cloudflare Tunnel:
```bash
# Only need SSH
sudo ufw allow 22/tcp
sudo ufw enable
# Tunnel doesn't require open ports!
```

---

## 📦 Deploy Your Application

```bash
# Clone/copy your repository to new server
cd /home/blake/8bp-rewards

# Install dependencies
npm install
cd frontend && npm install && cd ..
cd discord-status-bot && npm install && cd ..

# Build frontend
cd frontend
npm run build
cd ..

# Start services with Docker
docker-compose up -d

# Or run manually
npm run start:backend &
npm run start:frontend &
```

---

## ✅ Post-Setup Checklist

- [ ] Services running on new server (2500, 2600, 2700)
- [ ] MongoDB connected and accessible
- [ ] Cloudflare Tunnel configured (or A record verified)
- [ ] DNS propagated (can take up to 48 hours)
- [ ] SSL working (automatic with tunnel, or setup Let's Encrypt)
- [ ] Firewall configured
- [ ] Application accessible via domain
- [ ] Discord bot reconnected
- [ ] All environment variables configured

---

## 🆘 Troubleshooting

### Tunnel Not Working:
```bash
# Check tunnel status
cloudflared tunnel list

# Test tunnel connectivity
cloudflared tunnel info 8bp-rewards-tunnel

# View logs
sudo journalctl -u cloudflared-tunnel.service -f
```

### DNS Not Resolving:
```bash
# Check Cloudflare DNS settings
# Login to Cloudflare dashboard
# Go to DNS settings for epildevconnect.uk
# Verify record type (A or CNAME)
```

### Services Not Starting:
```bash
# Check if ports are in use
ss -tlnp | grep -E "(2500|2600|2700)"

# Check Docker logs
docker-compose logs -f

# Check system logs
journalctl -xe
```

---

## 📝 Important Notes

1. **A Record vs CNAME**: If using Cloudflare Tunnel, the DNS record should be a CNAME pointing to your tunnel, not an A record with your IP.

2. **Credentials Backup**: Save your tunnel credentials file (`~/.cloudflared/*.json`) somewhere safe!

3. **Old Server**: Once everything is working on the new server, you can safely shut down the old one.

4. **Environment Variables**: Make sure all your `.env` files are copied to the new server with correct values.

---

## 🎯 Next Steps

1. Choose Option A (Direct IP) or Option B (Cloudflare Tunnel)
2. Follow the setup instructions above
3. Verify everything is working
4. Update any external services pointing to old IP
5. Shut down old server once confirmed working

Good luck! 🚀




