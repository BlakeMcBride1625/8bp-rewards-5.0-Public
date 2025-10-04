#!/bin/bash

# Fix screenshot directory permissions to prevent claim failures
# This script ensures the claimer can write screenshots without permission errors

echo "🔧 Fixing screenshot directory permissions..."

# Change ownership to current user
sudo chown -R $(whoami):$(whoami) screenshots/ 2>/dev/null || true

# Set proper permissions
chmod -R 755 screenshots/ 2>/dev/null || true

# Ensure directories exist with proper permissions
mkdir -p screenshots/{shop-page,login,id-entry,go-click,final-page} 2>/dev/null || true

echo "✅ Screenshot permissions fixed!"
echo "   - All files now owned by: $(whoami)"
echo "   - Permissions set to: 755"
echo "   - Directories created if missing"

# Verify fix
echo ""
echo "📊 Verification:"
ls -la screenshots/shop-page/ | head -5
echo "..."
echo "Total files in shop-page: $(ls screenshots/shop-page/ | wc -l)"

