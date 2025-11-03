#!/bin/bash

echo "🛑 Stopping 8BP Rewards System"
echo "=============================="
echo ""

# Stop PM2 processes
pm2 delete all 2>/dev/null || echo "No PM2 processes running"

# Stop database
# PostgreSQL runs as system service - don't stop it
echo "PostgreSQL runs as system service (not stopping)"

echo ""
echo "✅ All services stopped"



