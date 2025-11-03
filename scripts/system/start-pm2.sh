#!/bin/bash

# 8BP Rewards System - PM2 Startup Script

set -e

echo "🚀 Starting 8BP Rewards System (PM2)"
echo "===================================="
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_info() { echo "ℹ️  $1"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }

# Check if PostgreSQL is running (system service)
print_info "Checking PostgreSQL service..."
if ! systemctl is-active --quiet postgresql 2>/dev/null && ! command -v pg_isready > /dev/null 2>&1; then
    print_error "PostgreSQL client tools not found!"
    print_info "Install with: sudo apt install postgresql-client"
elif ! systemctl is-active --quiet postgresql 2>/dev/null && ! pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    print_error "PostgreSQL is not running!"
    print_info "Please start PostgreSQL: sudo systemctl start postgresql"
    exit 1
fi
print_success "PostgreSQL is running"
echo ""

# Wait for PostgreSQL to be ready
print_info "Waiting for PostgreSQL to be ready..."
sleep 2

# Start PM2 processes
print_info "Starting services with PM2..."
pm2 start ecosystem.config.js

echo ""
print_success "All services started!"
echo ""
echo "📊 View status:"
echo "   pm2 status"
echo ""
echo "📝 View logs:"
echo "   pm2 logs           # All logs"
echo "   pm2 logs backend   # Backend only"
echo "   pm2 logs frontend  # Frontend only"
echo ""
echo "🔄 Restart services:"
echo "   pm2 restart all"
echo "   pm2 restart backend"
echo ""
echo "🛑 Stop services:"
echo "   ./stop-pm2.sh"
echo ""

pm2 status



