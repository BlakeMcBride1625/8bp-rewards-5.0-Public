#!/bin/bash

# 8BP Rewards System - New Server Setup Script
# Server IP: 87.106.54.142
# Domain: 8bp.epildevconnect.uk

set -e

echo "🚀 8BP Rewards System - New Server Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_info() { echo "ℹ️  $1"; }

# Check if running on new server
echo "Checking server IP..."
SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com)
print_info "Detected IP: $SERVER_IP"

if [ "$SERVER_IP" != "87.106.54.142" ]; then
    print_warning "This doesn't appear to be the new server (expected 87.106.54.142)"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    print_success "Confirmed: Running on new server (87.106.54.142)"
fi

echo ""
echo "Select setup option:"
echo "1) Direct IP Access (Simple - uses A record)"
echo "2) Cloudflare Tunnel (Recommended - more secure)"
read -p "Enter choice (1 or 2): " -n 1 -r
echo ""

if [[ $REPLY == "2" ]]; then
    echo ""
    echo "🔧 Setting up Cloudflare Tunnel..."
    echo ""

    # Check if cloudflared is installed
    if ! command -v cloudflared &> /dev/null; then
        print_info "Installing cloudflared..."
        wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        sudo dpkg -i cloudflared-linux-amd64.deb
        rm cloudflared-linux-amd64.deb
        print_success "cloudflared installed"
    else
        print_success "cloudflared already installed"
    fi

    # Check if user is authenticated
    print_info "Checking Cloudflare authentication..."
    if ! cloudflared tunnel list &> /dev/null; then
        print_warning "Not authenticated with Cloudflare"
        print_info "Opening browser for authentication..."
        cloudflared tunnel login
        
        if [ $? -ne 0 ]; then
            print_error "Failed to authenticate with Cloudflare"
            exit 1
        fi
        print_success "Authenticated with Cloudflare"
    else
        print_success "Already authenticated with Cloudflare"
    fi

    # Check if tunnel exists
    print_info "Checking for existing tunnel..."
    if cloudflared tunnel list | grep -q "8bp-rewards-tunnel"; then
        print_warning "Tunnel '8bp-rewards-tunnel' already exists"
        read -p "Delete and recreate? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cloudflared tunnel delete 8bp-rewards-tunnel
            print_success "Old tunnel deleted"
        else
            print_info "Using existing tunnel"
        fi
    fi

    # Create tunnel if it doesn't exist
    if ! cloudflared tunnel list | grep -q "8bp-rewards-tunnel"; then
        print_info "Creating new tunnel..."
        cloudflared tunnel create 8bp-rewards-tunnel
        print_success "Tunnel created: 8bp-rewards-tunnel"
    fi

    # Get tunnel UUID
    TUNNEL_UUID=$(cloudflared tunnel list | grep "8bp-rewards-tunnel" | awk '{print $1}')
    print_info "Tunnel UUID: $TUNNEL_UUID"

    # Create DNS route
    print_info "Creating DNS route..."
    if cloudflared tunnel route dns 8bp-rewards-tunnel 8bp.epildevconnect.uk; then
        print_success "DNS route created for 8bp.epildevconnect.uk"
    else
        print_warning "DNS route may already exist or failed to create"
    fi

    # Setup configuration
    print_info "Setting up tunnel configuration..."
    mkdir -p ~/.cloudflared

    # Update cloudflare-tunnel.yml with correct credentials path
    if [ -f "cloudflare-tunnel.yml" ]; then
        sed "s|credentials-file:.*|credentials-file: $HOME/.cloudflared/${TUNNEL_UUID}.json|" cloudflare-tunnel.yml > ~/.cloudflared/config.yml
        print_success "Tunnel configuration updated"
    else
        print_error "cloudflare-tunnel.yml not found in current directory"
        exit 1
    fi

    # Create systemd service
    print_info "Creating systemd service..."
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

    # Reload systemd and start service
    sudo systemctl daemon-reload
    sudo systemctl enable cloudflared-tunnel.service
    sudo systemctl start cloudflared-tunnel.service

    # Check if service started
    sleep 2
    if sudo systemctl is-active --quiet cloudflared-tunnel.service; then
        print_success "Cloudflare tunnel is running!"
        echo ""
        print_info "Your application will be available at:"
        echo "   https://8bp.epildevconnect.uk/8bp-rewards/"
        echo ""
        print_info "Check tunnel status: sudo systemctl status cloudflared-tunnel.service"
        print_info "View logs: sudo journalctl -u cloudflared-tunnel.service -f"
    else
        print_error "Failed to start tunnel service"
        print_info "Check logs with: sudo journalctl -u cloudflared-tunnel.service -xe"
        exit 1
    fi

elif [[ $REPLY == "1" ]]; then
    echo ""
    print_info "Using Direct IP Access setup"
    echo ""
    
    print_warning "Make sure you have updated your Cloudflare DNS A record to: 87.106.54.142"
    echo ""
    
    # Setup firewall
    print_info "Configuring firewall..."
    if command -v ufw &> /dev/null; then
        sudo ufw allow 22/tcp comment 'SSH'
        sudo ufw allow 2500/tcp comment '8BP Frontend'
        sudo ufw allow 2600/tcp comment '8BP Backend'
        sudo ufw allow 2700/tcp comment '8BP Discord Bot'
        
        # Enable UFW if not already enabled
        if ! sudo ufw status | grep -q "Status: active"; then
            print_warning "UFW is not active. Enable it? (y/N)"
            read -p "> " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                sudo ufw --force enable
                print_success "Firewall enabled"
            fi
        fi
        
        print_success "Firewall rules configured"
        sudo ufw status numbered
    else
        print_warning "UFW not installed. Skipping firewall setup."
    fi
    
    echo ""
    print_info "Your services will be accessible at:"
    echo "   Frontend: http://87.106.54.142:2500/"
    echo "   Backend:  http://87.106.54.142:2600/"
    echo ""
    print_warning "Note: You'll need to setup SSL manually (e.g., with Let's Encrypt)"
    print_info "Consider using Cloudflare Tunnel for automatic SSL and better security"
else
    print_error "Invalid choice"
    exit 1
fi

echo ""
echo "=========================================="
print_success "Setup Complete!"
echo "=========================================="
echo ""
print_info "Next steps:"
echo "  1. Start your application services"
echo "  2. Test access from external network"
echo "  3. Verify all features are working"
echo "  4. Update any external integrations"
echo ""
print_info "For detailed troubleshooting, see NEW_SERVER_SETUP.md"
echo ""




