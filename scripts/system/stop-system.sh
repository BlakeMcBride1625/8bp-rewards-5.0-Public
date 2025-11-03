#!/bin/bash

echo "🛑 Stopping 8BP Rewards System"
echo "==============================="
echo ""

# Stop backend
if [ -f /tmp/8bp-backend.pid ]; then
    BACKEND_PID=$(cat /tmp/8bp-backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo "Stopping backend (PID: $BACKEND_PID)..."
        kill $BACKEND_PID
        rm /tmp/8bp-backend.pid
        echo "✅ Backend stopped"
    else
        echo "⚠️  Backend not running"
        rm -f /tmp/8bp-backend.pid
    fi
fi

# Stop frontend
if [ -f /tmp/8bp-frontend.pid ]; then
    FRONTEND_PID=$(cat /tmp/8bp-frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "Stopping frontend (PID: $FRONTEND_PID)..."
        kill $FRONTEND_PID
        rm /tmp/8bp-frontend.pid
        echo "✅ Frontend stopped"
    else
        echo "⚠️  Frontend not running"
        rm -f /tmp/8bp-frontend.pid
    fi
fi

# PostgreSQL runs as system service - don't stop it
echo "PostgreSQL runs as system service (not stopping)"

echo ""
echo "✅ All services stopped"



