#!/bin/bash

# Update script for existing Cloudflare Tunnel
# Updates configuration for consolidated Docker setup

set -e

TUNNEL_NAME="8bp-rewards-tunnel"
HOSTNAME="8bp.epildevconnect.uk"

echo "🔄 Updating Cloudflare Tunnel Configuration"
echo "==========================================="
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

# Get tunnel ID from name
echo "📋 Finding tunnel..."
TUNNEL_INFO=$(cloudflared tunnel list | grep "$TUNNEL_NAME" || echo "")
if [ -z "$TUNNEL_INFO" ]; then
    echo "❌ Tunnel '$TUNNEL_NAME' not found"
    exit 1
fi

# Extract tunnel ID (first column)
TUNNEL_ID=$(echo "$TUNNEL_INFO" | awk '{print $1}')
echo "✅ Tunnel found: $TUNNEL_NAME (ID: $TUNNEL_ID)"
echo ""

# Get tunnel token
echo "🔑 Getting tunnel token..."
TUNNEL_TOKEN=$(cloudflared tunnel token "$TUNNEL_NAME" 2>/dev/null || cloudflared tunnel token "$TUNNEL_ID" 2>/dev/null || echo "")
CREDENTIALS_FILE="$HOME/.cloudflared/${TUNNEL_ID}.json"

# Check authentication method
USE_TOKEN=false
if [ ! -f "$CREDENTIALS_FILE" ]; then
    if [ -n "$TUNNEL_TOKEN" ]; then
        echo "✅ Using token-based authentication (no credentials file needed)"
        USE_TOKEN=true
    else
        echo "⚠️  Credentials file not found and token unavailable"
        echo "📝 You can either:"
        echo "   1. Download credentials file from Cloudflare dashboard"
        echo "   2. Or we'll use tunnel name (may require credentials file)"
        echo ""
        read -p "Continue with tunnel name? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Exiting. Please download credentials file from Cloudflare dashboard."
            exit 1
        fi
    fi
else
    echo "✅ Credentials file found: $CREDENTIALS_FILE"
fi
echo ""

# Update config file
echo "📝 Updating tunnel configuration..."
if [ "$USE_TOKEN" = true ]; then
    # Use token-based authentication
    cat > ~/.cloudflared/config.yml <<EOF
# Cloudflare Tunnel Configuration for 8BP Rewards System
# Updated: $(date)
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
else
    # Use credentials file or tunnel name
    cat > ~/.cloudflared/config.yml <<EOF
# Cloudflare Tunnel Configuration for 8BP Rewards System
# Updated: $(date)
# Consolidated setup: All traffic routes to backend port 2600

tunnel: ${TUNNEL_NAME}
$([ -f "$CREDENTIALS_FILE" ] && echo "credentials-file: ${CREDENTIALS_FILE}" || echo "# Using tunnel name authentication")

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
fi

echo "✅ Configuration updated at ~/.cloudflared/config.yml"
echo ""

# Verify DNS route exists
echo "🌐 Checking DNS routing..."
if cloudflared tunnel route dns list 2>&1 | grep -q "$HOSTNAME" || cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" 2>&1 | grep -q "already"; then
    echo "✅ DNS route configured for $HOSTNAME"
else
    echo "📡 Setting up DNS route..."
    if cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" 2>&1; then
        echo "✅ DNS route created for $HOSTNAME"
    else
        echo "⚠️  DNS route may already exist or failed (this is OK if it already exists)"
    fi
fi
echo ""

# Validate config
echo "🧪 Validating tunnel configuration..."
if cloudflared tunnel --config ~/.cloudflared/config.yml ingress validate 2>&1; then
    echo "✅ Tunnel configuration is valid"
else
    echo "⚠️  Configuration validation had warnings (may still work)"
fi
echo ""

# Update systemd service
echo "🔧 Updating systemd service..."
sudo tee /etc/systemd/system/cloudflared-tunnel.service > /dev/null <<EOF
[Unit]
Description=Cloudflare Tunnel for 8BP Rewards
After=network.target

[Service]
Type=simple
User=blake
ExecStart=/usr/bin/cloudflared tunnel --config $HOME/.cloudflared/config.yml run
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Systemd service updated"
echo ""

# Reload systemd
sudo systemctl daemon-reload
echo "✅ Systemd daemon reloaded"
echo ""

# Ask if user wants to start the service
read -p "Start the tunnel service now? (Y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo "🚀 Starting tunnel service..."
    sudo systemctl enable cloudflared-tunnel.service
    sudo systemctl restart cloudflared-tunnel.service
    
    sleep 3
    
    if sudo systemctl is-active --quiet cloudflared-tunnel.service; then
        echo "✅ Tunnel service is running!"
    else
        echo "⚠️  Service may have issues. Check with: sudo systemctl status cloudflared-tunnel.service"
    fi
fi

echo ""
echo "🎉 Cloudflare Tunnel update complete!"
echo ""
echo "📊 Useful commands:"
echo "   Check status: sudo systemctl status cloudflared-tunnel.service"
echo "   View logs:    sudo journalctl -u cloudflared-tunnel.service -f"
echo "   Restart:      sudo systemctl restart cloudflared-tunnel.service"
echo ""
echo "🌐 Your application will be available at:"
echo "   https://${HOSTNAME}/8bp-rewards/"
echo ""

