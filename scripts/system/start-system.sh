#!/bin/bash

# 8BP Rewards System - Direct System Startup (Host-Only)
# Runs: PostgreSQL on host, backend and frontend on host

set -e

echo "🚀 Starting 8BP Rewards System"
echo "==============================="
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_info() { echo "ℹ️  $1"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }

# Check if PostgreSQL is installed and running
print_info "Checking PostgreSQL service..."
if systemctl is-active --quiet postgresql || systemctl is-active --quiet postgresql@*; then
    print_success "PostgreSQL service is running"
elif command -v pg_isready > /dev/null 2>&1 && pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    print_success "PostgreSQL is accessible"
else
    print_error "PostgreSQL is not running!"
    print_info "Please start PostgreSQL: sudo systemctl start postgresql"
    exit 1
fi

# Wait for PostgreSQL to be ready
print_info "Waiting for PostgreSQL to be ready..."
for i in {1..10}; do
    if pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
        print_success "PostgreSQL is ready"
        break
    fi
    if [ $i -eq 10 ]; then
        print_error "PostgreSQL did not become ready"
        exit 1
    fi
    sleep 1
done

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    print_info "Installing backend dependencies..."
    npm install
fi

if [ ! -d "frontend/node_modules" ]; then
    print_info "Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# Build backend
print_info "Building backend..."
npm run build:backend

# Build frontend
print_info "Building frontend..."
cd frontend && npm run build && cd ..

echo ""
print_success "Build complete!"
echo ""

# Start backend
print_info "Starting backend on port 2600..."
nohup npm run start:backend > logs/backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > /tmp/8bp-backend.pid
print_success "Backend started (PID: $BACKEND_PID)"

# Start frontend (serve build folder)
print_info "Installing serve globally..."
sudo npm install -g serve 2>/dev/null || true

print_info "Starting frontend on port 2500..."
nohup serve -s frontend/build -l 2500 > logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > /tmp/8bp-frontend.pid
print_success "Frontend started (PID: $FRONTEND_PID)"

echo ""
echo "==============================="
print_success "All services started!"
echo "==============================="
echo ""
echo "📊 Service Status:"
echo "   Database:  host (PostgreSQL on localhost:5432)"
echo "   Backend:   PID $BACKEND_PID (port 2600)"
echo "   Frontend:  PID $FRONTEND_PID (port 2500)"
echo ""
echo "🌐 Access:"
echo "   Local:  http://localhost:2500"
echo "   Public: https://8ballpool.website/8bp-rewards/"
echo ""
echo "📝 Logs:"
echo "   Backend:  tail -f logs/backend.log"
echo "   Frontend: tail -f logs/frontend.log"
echo ""
echo "🛑 Stop: ./stop-system.sh"
echo ""



