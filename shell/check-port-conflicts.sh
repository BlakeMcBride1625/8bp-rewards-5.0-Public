#!/bin/bash

# 8BP Rewards System - Port Conflict Checker
# This script checks for port conflicts and shows current port usage

echo "🔍 8BP Rewards System - Port Conflict Checker"
echo "=============================================="
echo ""

# Define our reserved ports
BACKEND_PORT=2600
FRONTEND_PORT=2500
MONGODB_PORT=27017

echo "📋 Checking 8BP Reserved Ports:"
echo "  Backend API: $BACKEND_PORT"
echo "  Frontend:    $FRONTEND_PORT"
echo "  MongoDB:     $MONGODB_PORT"
echo ""

# Check if ports are in use
echo "🔍 Current Port Usage:"
echo ""

check_port() {
    local port=$1
    local service=$2
    
    if ss -tlnp | grep -q ":$port "; then
        echo "  ⚠️  Port $port ($service): IN USE"
        ss -tlnp | grep ":$port " | while read line; do
            echo "     $line"
        done
    else
        echo "  ✅ Port $port ($service): Available"
    fi
}

check_port $BACKEND_PORT "Backend API"
check_port $FRONTEND_PORT "Frontend"
check_port $MONGODB_PORT "MongoDB"

echo ""
echo "🚨 Checking for Conflicting Services:"
echo ""

# Check for known conflicting services
check_port 3000 "Zipline (CONFLICT)"
check_port 3001 "Uptime Kuma (CONFLICT)"
check_port 3300 "Nginx (CONFLICT)"
check_port 3356 "MySQL (CONFLICT)"
check_port 8000 "Portainer (CONFLICT)"
check_port 9443 "Portainer HTTPS (CONFLICT)"

echo ""
echo "🐳 Docker Container Ports:"
echo ""

if command -v docker &> /dev/null; then
    docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}" | head -10
else
    echo "  Docker not available"
fi

echo ""
echo "📊 Summary:"
echo ""

# Check if our services are running
backend_running=$(ss -tlnp | grep -q ":$BACKEND_PORT " && echo "✅" || echo "❌")
frontend_running=$(ss -tlnp | grep -q ":$FRONTEND_PORT " && echo "✅" || echo "❌")
mongodb_running=$(ss -tlnp | grep -q ":$MONGODB_PORT " && echo "✅" || echo "❌")

echo "  Backend API ($BACKEND_PORT):  $backend_running"
echo "  Frontend ($FRONTEND_PORT):    $frontend_running"
echo "  MongoDB ($MONGODB_PORT):      $mongodb_running"

echo ""
echo "🔧 Recommendations:"
echo ""

if ss -tlnp | grep -q ":$BACKEND_PORT "; then
    echo "  ✅ Backend is running correctly on port $BACKEND_PORT"
else
    echo "  ⚠️  Backend is not running. Start with: npm run start:backend"
fi

if ss -tlnp | grep -q ":$FRONTEND_PORT "; then
    echo "  ✅ Frontend is running correctly on port $FRONTEND_PORT"
else
    echo "  ⚠️  Frontend is not running. Start with: npm run start:frontend"
fi

if ss -tlnp | grep -q ":$MONGODB_PORT "; then
    echo "  ✅ MongoDB is accessible on port $MONGODB_PORT"
else
    echo "  ⚠️  MongoDB is not accessible. Check your database connection"
fi

echo ""
echo "📝 For more information, see PORT_CONFIGURATION.md"





