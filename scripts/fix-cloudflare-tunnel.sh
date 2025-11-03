#!/bin/bash

# Quick fix script for Cloudflare tunnel
# This updates the systemd service path and checks for credentials

set -e

echo "🔧 Fixing Cloudflare Tunnel Configuration"
echo "=========================================="
echo ""

# Fix systemd service path
echo "1️⃣ Fixing systemd service path..."
sudo tee /etc/systemd/system/cloudflared-tunnel.service > /dev/null <<EOF
[Unit]
Description=Cloudflare Tunnel for 8BP Rewards
After=network.target

[Service]
Type=simple
User=blake
ExecStart=$(which cloudflared) tunnel --config /home/blake/.cloudflared/config.yml run
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
echo "✅ Systemd service updated"
echo ""

# Check for credentials file
TUNNEL_ID="3190cedb-aaf5-45cd-b7bb-dacad27d29c1"
CREDENTIALS_FILE="$HOME/.cloudflared/${TUNNEL_ID}.json"

echo "2️⃣ Checking credentials file..."
if [ -f "$CREDENTIALS_FILE" ]; then
    echo "✅ Credentials file found: $CREDENTIALS_FILE"
    
    # Update config with credentials file
    cat > ~/.cloudflared/config.yml <<EOF
# Cloudflare Tunnel Configuration for 8BP Rewards System
# Updated: $(date)
# Consolidated setup: All traffic routes to backend port 2600

tunnel: ${TUNNEL_ID}
credentials-file: ${CREDENTIALS_FILE}

ingress:
  # All traffic (frontend + backend API) routes to backend port 2600
  # Backend serves frontend static files under /8bp-rewards route
  - hostname: 8ballpool.website
    service: http://localhost:2600
    originRequest:
      httpHostHeader: 8ballpool.website
      noHappyEyeballs: true

  # Catch-all rule (must be last)
  - service: http_status:404
EOF
    
    echo "✅ Config updated with credentials file"
    echo ""
    echo "3️⃣ Starting tunnel service..."
    sudo systemctl enable cloudflared-tunnel.service
    sudo systemctl restart cloudflared-tunnel.service
    
    sleep 3
    
    if sudo systemctl is-active --quiet cloudflared-tunnel.service; then
        echo "✅ Tunnel service is running!"
        echo ""
        echo "📊 Check status: sudo systemctl status cloudflared-tunnel.service"
        echo "📋 View logs:   sudo journalctl -u cloudflared-tunnel.service -f"
    else
        echo "⚠️  Service may have issues. Check logs:"
        sudo journalctl -u cloudflared-tunnel.service -n 10 --no-pager
    fi
else
    echo "❌ Credentials file NOT found: $CREDENTIALS_FILE"
    echo ""
    echo "📥 To download credentials file:"
    echo "   1. Go to: https://one.dash.cloudflare.com/"
    echo "   2. Networks > Tunnels > 8bp-rewards-tunnel"
    echo "   3. Download credentials JSON file"
    echo "   4. Save to: $CREDENTIALS_FILE"
    echo ""
    echo "   Then run this script again."
    exit 1
fi

echo ""
echo "🎉 Done!"

