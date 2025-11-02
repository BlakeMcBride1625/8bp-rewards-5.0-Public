#!/bin/bash

# Setup script for new Cloudflare Tunnel
# This creates a fresh tunnel and updates configuration for consolidated Docker setup

set -e

echo "🚀 Setting up new Cloudflare Tunnel for 8BP Rewards"
echo "=================================================="
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "❌ cloudflared is not installed"
    echo ""
    echo "Install with:"
    echo "  wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"
    echo "  sudo dpkg -i cloudflared-linux-amd64.deb"
    exit 1
fi

# Check if logged in
echo "🔐 Checking Cloudflare authentication..."
if ! cloudflared tunnel list &> /dev/null; then
    echo "❌ Not logged in to Cloudflare"
    echo ""
    echo "Please run: cloudflared tunnel login"
    echo "Then run this script again."
    exit 1
fi
echo "✅ Authenticated with Cloudflare"
echo ""

# List existing tunnels
echo "📋 Existing tunnels:"
cloudflared tunnel list || echo "No existing tunnels"
echo ""

# Delete old tunnel if exists
read -p "Do you want to delete the old '8bp-rewards-tunnel'? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️  Deleting old tunnel..."
    cloudflared tunnel delete 8bp-rewards-tunnel 2>/dev/null || echo "Note: Tunnel may not exist"
    echo ""
fi

# Create new tunnel
echo "🆕 Creating new tunnel..."
TUNNEL_OUTPUT=$(cloudflared tunnel create 8bp-rewards-tunnel 2>&1)
if [ $? -ne 0 ]; then
    echo "❌ Failed to create tunnel: $TUNNEL_OUTPUT"
    exit 1
fi

# Extract tunnel UUID
TUNNEL_UUID=$(cloudflared tunnel list | grep "8bp-rewards-tunnel" | awk '{print $1}')
if [ -z "$TUNNEL_UUID" ]; then
    echo "❌ Could not find tunnel UUID"
    exit 1
fi

echo "✅ Tunnel created with UUID: $TUNNEL_UUID"
echo ""

# Create DNS route
echo "🌐 Creating DNS route..."
cloudflared tunnel route dns 8bp-rewards-tunnel 8bp.epildevconnect.uk || {
    echo "⚠️  DNS route may already exist (this is OK)"
}
echo ""

# Setup config directory
echo "📋 Setting up tunnel configuration..."
mkdir -p ~/.cloudflared

# Create config file with tunnel UUID
cat > ~/.cloudflared/config.yml <<EOF
# Cloudflare Tunnel Configuration for 8BP Rewards System
# Auto-generated on $(date)
tunnel: 8bp-rewards-tunnel
credentials-file: $HOME/.cloudflared/${TUNNEL_UUID}.json

ingress:
  # All traffic (frontend + backend API) goes to backend port 2600
  # Backend serves frontend static files under /8bp-rewards route
  - hostname: 8bp.epildevconnect.uk
    service: http://localhost:2600
    originRequest:
      httpHostHeader: 8bp.epildevconnect.uk
      noHappyEyeballs: true

  # Catch-all rule (must be last)
  - service: http_status:404
EOF

echo "✅ Configuration saved to ~/.cloudflared/config.yml"
echo ""

# Update the template file too
cat > cloudflare-tunnel.yml <<EOF
# Cloudflare Tunnel Configuration for 8BP Rewards System
# This file configures Cloudflare Tunnels to route traffic to your local services
# Updated for consolidated setup (frontend served from backend)

tunnel: 8bp-rewards-tunnel
credentials-file: $HOME/.cloudflared/${TUNNEL_UUID}.json

ingress:
  # All traffic (frontend + backend API) now goes to backend port 2600
  # Backend serves frontend static files under /8bp-rewards route
  - hostname: 8bp.epildevconnect.uk
    service: http://localhost:2600
    originRequest:
      httpHostHeader: 8bp.epildevconnect.uk
      noHappyEyeballs: true

  # Catch-all rule (must be last)
  - service: http_status:404
EOF

echo "✅ Template file updated: cloudflare-tunnel.yml"
echo ""

# Test tunnel config
echo "🧪 Testing tunnel configuration..."
if cloudflared tunnel --config ~/.cloudflared/config.yml ingress validate; then
    echo "✅ Tunnel configuration is valid"
else
    echo "⚠️  Tunnel configuration validation failed"
fi
echo ""

# Create/update systemd service
echo "🔧 Setting up systemd service..."
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
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Systemd service created"
echo ""

# Reload systemd
sudo systemctl daemon-reload
echo "✅ Systemd daemon reloaded"
echo ""

# Ask if user wants to start the service now
read -p "Start the tunnel service now? (Y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo "🚀 Starting tunnel service..."
    sudo systemctl enable cloudflared-tunnel.service
    sudo systemctl start cloudflared-tunnel.service
    
    sleep 2
    
    if sudo systemctl is-active --quiet cloudflared-tunnel.service; then
        echo "✅ Tunnel service is running!"
    else
        echo "⚠️  Service may have issues. Check with: sudo systemctl status cloudflared-tunnel.service"
    fi
fi

echo ""
echo "🎉 Cloudflare Tunnel setup complete!"
echo ""
echo "📊 Useful commands:"
echo "   Check status: sudo systemctl status cloudflared-tunnel.service"
echo "   View logs:    sudo journalctl -u cloudflared-tunnel.service -f"
echo "   Restart:      sudo systemctl restart cloudflared-tunnel.service"
echo "   Stop:         sudo systemctl stop cloudflared-tunnel.service"
echo ""
echo "🌐 Your application will be available at:"
echo "   https://8bp.epildevconnect.uk/8bp-rewards/"
echo ""

