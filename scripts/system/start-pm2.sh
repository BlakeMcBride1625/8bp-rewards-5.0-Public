#!/bin/bash

# 8BP Rewards System - PM2 Startup Script (deprecated)

set -e

echo "🛑 PM2 deployment is deprecated for 8BP Rewards."
echo "   Docker Compose now owns process management."
echo ""
echo "👉 To start the stack, use:"
echo "   docker compose up -d"
echo ""
echo "If you really need the old PM2 profile, see archive/legacy/pm2-ecosystem.config.js."

exit 1



