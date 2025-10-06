#!/bin/bash

echo "🚀 Setting up 8ball Pool Claimer for VPS..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Chromium
echo "🌐 Installing Chromium browser..."
sudo apt-get install -y chromium-browser

# Install Playwright browsers
echo "🎭 Installing Playwright browsers..."
npm install
npx playwright install chromium

# Install PM2 for process management
echo "⚙️ Installing PM2 process manager..."
sudo npm install -g pm2

# Create systemd service for auto-start
echo "🔧 Creating systemd service..."
sudo tee /etc/systemd/system/8bp-claimer.service > /dev/null <<EOF
[Unit]
Description=8ball Pool Reward Claimer
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node playwright-claimer.js --schedule
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=HEADLESS=true

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable 8bp-claimer.service

echo "✅ VPS setup complete!"
echo ""
echo "📋 Commands:"
echo "  Start service: sudo systemctl start 8bp-claimer"
echo "  Stop service:  sudo systemctl stop 8bp-claimer"
echo "  View logs:     sudo journalctl -u 8bp-claimer -f"
echo "  Manual run:    node playwright-claimer.js"
echo "  Schedule run:  node playwright-claimer.js --schedule"
echo ""
echo "🔧 Edit your .env file with your user IDs before starting!"

