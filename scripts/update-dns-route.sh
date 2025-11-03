#!/bin/bash

# Update DNS route for Cloudflare Tunnel
# This script helps update DNS to point to the new tunnel

set -e

TUNNEL_NAME="8bp-rewards-tunnel"
TUNNEL_ID="3ebdc4f9-8bcb-4913-8336-19c295bdaff0"
HOSTNAME="8ballpool.website"

echo "🌐 Updating DNS Route for Cloudflare Tunnel"
echo "============================================"
echo ""
echo "Tunnel: $TUNNEL_NAME (ID: $TUNNEL_ID)"
echo "Hostname: $HOSTNAME"
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "❌ cloudflared is not installed"
    exit 1
fi

echo "📋 Current tunnel info:"
cloudflared tunnel info "$TUNNEL_NAME" 2>&1 | head -10
echo ""

echo "🔍 Attempting to update DNS route..."
echo ""

# Try to delete old route first (if possible)
echo "1️⃣ Checking for existing DNS record..."
# Note: cloudflared doesn't have a direct delete command for DNS routes
# We need to do this via Cloudflare dashboard or API

# Try to create/update the route
echo "2️⃣ Creating DNS route..."
if cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" 2>&1; then
    echo "✅ DNS route successfully created/updated!"
else
    echo ""
    echo "⚠️  DNS route creation failed - record already exists"
    echo ""
    echo "📝 To fix this, you need to manually update the DNS record:"
    echo ""
    echo "   Method 1: Via Cloudflare Dashboard (Easiest)"
    echo "   ─────────────────────────────────────────────"
    echo "   1. Go to: https://dash.cloudflare.com/"
    echo "   2. Select your domain: 8ballpool.website"
    echo "   3. Go to: DNS > Records"
    echo "   4. Find the CNAME record for '@' or root domain"
    echo "   5. Click 'Edit' on that record"
    echo "   6. Change the target/content to the new tunnel ID:"
    echo "      $TUNNEL_ID.cfargotunnel.com"
    echo "   7. Save the record"
    echo ""
    echo "   Method 2: Via Cloudflare API"
    echo "   ──────────────────────────"
    echo "   Use Cloudflare API to update the CNAME record:"
    echo "   - Name: 8bp"
    echo "   - Type: CNAME"
    echo "   - Content: $TUNNEL_ID.cfargotunnel.com"
    echo ""
    echo "   Method 3: Delete and Recreate"
    echo "   ───────────────────────────"
    echo "   1. Delete the existing '8bp' CNAME record from dashboard"
    echo "   2. Then run: cloudflared tunnel route dns $TUNNEL_NAME $HOSTNAME"
    echo ""
    exit 1
fi

echo ""
echo "✅ DNS update complete!"
echo ""
echo "🌐 Your tunnel should now be accessible at:"
echo "   https://$HOSTNAME/8bp-rewards/"
echo ""
echo "🧪 Test the connection:"
echo "   curl -I https://$HOSTNAME/8bp-rewards/"
echo ""

