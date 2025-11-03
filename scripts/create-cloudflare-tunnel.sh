#!/bin/bash

# Create new Cloudflare Tunnel for 8BP Rewards
# Non-interactive version - creates tunnel automatically

set -e

TUNNEL_NAME="8bp-rewards-tunnel"
HOSTNAME="8ballpool.website"

echo "🚀 Creating new Cloudflare Tunnel for 8BP Rewards"
echo "=================================================="
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "❌ cloudflared is not installed"
    exit 1
fi

# Check if logged in
echo "🔐 Checking Cloudflare authentication..."
if ! cloudflared tunnel list &> /dev/null; then
    echo "❌ Not logged in to Cloudflare"
    echo "Please run: cloudflared tunnel login"
    exit 1
fi
echo "✅ Authenticated with Cloudflare"
echo ""

# Delete old tunnel if exists (non-interactive)
echo "🗑️  Checking for existing tunnel..."
if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
    echo "   Deleting existing tunnel..."
    cloudflared tunnel delete "$TUNNEL_NAME" --force || echo "   Note: May already be deleted"
fi
echo ""

# Create new tunnel
echo "🆕 Creating new tunnel '$TUNNEL_NAME'..."
TUNNEL_OUTPUT=$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1)
echo "$TUNNEL_OUTPUT"

# Extract tunnel ID
TUNNEL_ID=$(echo "$TUNNEL_OUTPUT" | grep -oP '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)

if [ -z "$TUNNEL_ID" ]; then
    # Try alternative method to get tunnel ID
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
fi

if [ -z "$TUNNEL_ID" ]; then
    echo "❌ Failed to get tunnel ID. Exiting."
    exit 1
fi

echo "✅ Tunnel created with ID: $TUNNEL_ID"
echo ""

# Ensure credentials directory exists
mkdir -p ~/.cloudflared

# Get credentials file path
CREDENTIALS_FILE="$HOME/.cloudflared/${TUNNEL_ID}.json"

echo "📝 Checking credentials file..."
if [ -f "$CREDENTIALS_FILE" ]; then
    echo "✅ Credentials file found: $CREDENTIALS_FILE"
else
    echo "⚠️  Credentials file not found. It should be created automatically."
    echo "   If missing, download from Cloudflare dashboard"
fi
echo ""

# Create DNS route
echo "🌐 Setting up DNS route for $HOSTNAME..."
if cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" 2>&1; then
    echo "✅ DNS route created for $HOSTNAME"
else
    echo "⚠️  DNS route may already exist or failed (check manually if needed)"
fi
echo ""

# Create config file
echo "📋 Creating tunnel configuration..."
cat > ~/.cloudflared/config.yml <<EOF
# Cloudflare Tunnel Configuration for 8BP Rewards System
# Created: $(date)
# Consolidated setup: All traffic routes to backend port 2600

tunnel: ${TUNNEL_ID}
credentials-file: ${CREDENTIALS_FILE}

ingress:
  # All traffic (frontend + backend API) routes to backend port 2600
  # Backend serves frontend static files under /8bp-rewards route
  - hostname: ${HOSTNAME}
    service: http://localhost:2600
    originRequest:
      httpHostHeader: ${HOSTNAME}
      noHappyEyeballs: true

  # Catch-all rule (must be last)
  - service: http_status:404
EOF

echo "✅ Configuration file created at ~/.cloudflared/config.yml"
echo ""

# Validate config
echo "🧪 Validating tunnel configuration..."
if cloudflared tunnel --config ~/.cloudflared/config.yml ingress validate 2>&1; then
    echo "✅ Tunnel configuration is valid"
else
    echo "⚠️  Configuration validation had warnings"
fi
echo ""

# Update systemd service
echo "🔧 Creating systemd service..."
CLOUDFLARED_PATH=$(which cloudflared)
sudo tee /etc/systemd/system/cloudflared-tunnel.service > /dev/null <<EOF
[Unit]
Description=Cloudflare Tunnel for 8BP Rewards
After=network.target

[Service]
Type=simple
User=blake
ExecStart=${CLOUDFLARED_PATH} tunnel --config $HOME/.cloudflared/config.yml run
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Systemd service file created"
echo ""

# Reload and start service
echo "🚀 Starting tunnel service..."
sudo systemctl daemon-reload
sudo systemctl enable cloudflared-tunnel.service
sudo systemctl start cloudflared-tunnel.service

sleep 5

if sudo systemctl is-active --quiet cloudflared-tunnel.service; then
    echo ""
    echo "✅ ✅ ✅ SUCCESS! ✅ ✅ ✅"
    echo ""
    echo "🎉 Cloudflare tunnel is running!"
    echo ""
    echo "🌐 Your application is available at:"
    echo "   https://${HOSTNAME}/8bp-rewards/"
    echo ""
else
    echo "⚠️  Service may have issues starting. Checking logs..."
    sudo journalctl -u cloudflared-tunnel.service -n 20 --no-pager
    echo ""
    echo "⚠️  If credentials file is missing, you may need to:"
    echo "   1. Go to https://one.dash.cloudflare.com/"
    echo "   2. Networks > Tunnels > $TUNNEL_NAME"
    echo "   3. Download credentials file"
    echo "   4. Save to: $CREDENTIALS_FILE"
    echo "   5. Run: sudo systemctl restart cloudflared-tunnel.service"
fi

echo ""
echo "📊 Useful commands:"
echo "   Check status: sudo systemctl status cloudflared-tunnel.service"
echo "   View logs:    sudo journalctl -u cloudflared-tunnel.service -f"
echo "   Restart:      sudo systemctl restart cloudflared-tunnel.service"
echo ""
echo "🎉 Tunnel setup complete!"

