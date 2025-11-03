#!/bin/bash

# Quick Cloudflare Tunnel Setup for New Server
# This script will set up the tunnel with minimal interaction

set -e

echo "🚀 Setting up Cloudflare Tunnel on new server (87.106.54.142)"
echo ""

# Install cloudflared
echo "📦 Installing cloudflared..."
sudo dpkg -i cloudflared-linux-amd64.deb
echo "✅ cloudflared installed"
echo ""

# Authenticate
echo "🔐 Authenticating with Cloudflare..."
echo "A browser window will open. Please login and select 'epildevconnect.uk'"
cloudflared tunnel login
echo "✅ Authenticated"
echo ""

# List existing tunnels
echo "📋 Current tunnels:"
cloudflared tunnel list
echo ""

# Delete old tunnel
echo "🗑️  Deleting old tunnel..."
cloudflared tunnel delete 8bp-rewards-tunnel || echo "Note: Tunnel may not exist or already deleted"
echo ""

# Create new tunnel
echo "🆕 Creating new tunnel..."
cloudflared tunnel create 8bp-rewards-tunnel
echo "✅ Tunnel created"
echo ""

# Get tunnel UUID
TUNNEL_UUID=$(cloudflared tunnel list | grep "8bp-rewards-tunnel" | awk '{print $1}')
echo "📝 Tunnel UUID: $TUNNEL_UUID"
echo ""

# Create DNS route
echo "🌐 Creating DNS route..."
cloudflared tunnel route dns 8bp-rewards-tunnel 8bp.epildevconnect.uk
echo "✅ DNS route created"
echo ""

# Setup config
echo "⚙️  Setting up configuration..."
mkdir -p ~/.cloudflared

# Update config file with correct credentials path
cat > ~/.cloudflared/config.yml <<EOF
# Cloudflare Tunnel Configuration for 8BP Rewards System
tunnel: 8bp-rewards-tunnel
credentials-file: $HOME/.cloudflared/${TUNNEL_UUID}.json

ingress:
  # Frontend (React app)
  - hostname: 8bp.epildevconnect.uk
    path: /8bp-rewards/*
    service: http://localhost:2500
    originRequest:
      httpHostHeader: 8bp.epildevconnect.uk

  # Backend API
  - hostname: 8bp.epildevconnect.uk
    path: /8bp-rewards/api/*
    service: http://localhost:2600
    originRequest:
      httpHostHeader: 8bp.epildevconnect.uk

  # Catch-all rule (must be last)
  - service: http_status:404
EOF

echo "✅ Configuration created at ~/.cloudflared/config.yml"
echo ""

# Create systemd service
echo "🔧 Creating systemd service..."
sudo tee /etc/systemd/system/cloudflared-tunnel.service > /dev/null <<EOF
[Unit]
Description=Cloudflare Tunnel for 8BP Rewards
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=/usr/bin/cloudflared tunnel --config $HOME/.cloudflared/config.yml run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Systemd service created"
echo ""

# Enable and start service
echo "🚀 Starting tunnel service..."
sudo systemctl daemon-reload
sudo systemctl enable cloudflared-tunnel.service
sudo systemctl start cloudflared-tunnel.service

# Wait a moment for service to start
sleep 3

# Check status
if sudo systemctl is-active --quiet cloudflared-tunnel.service; then
    echo ""
    echo "✅ ✅ ✅ SUCCESS! ✅ ✅ ✅"
    echo ""
    echo "🎉 Cloudflare tunnel is running!"
    echo ""
    echo "🌐 Your application is now available at:"
    echo "   https://8bp.epildevconnect.uk/8bp-rewards/"
    echo ""
    echo "📊 Useful commands:"
    echo "   Check status: sudo systemctl status cloudflared-tunnel.service"
    echo "   View logs:    sudo journalctl -u cloudflared-tunnel.service -f"
    echo "   Restart:      sudo systemctl restart cloudflared-tunnel.service"
    echo ""
else
    echo "❌ Service failed to start"
    echo "Check logs: sudo journalctl -u cloudflared-tunnel.service -xe"
    exit 1
fi

# Cleanup
rm -f cloudflared-linux-amd64.deb
echo "🧹 Cleaned up installation files"
echo ""
echo "✅ Setup complete!"




