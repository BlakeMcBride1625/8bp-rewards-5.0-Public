#!/bin/bash
# Script to verify user count in PostgreSQL database
# Can work via API endpoint or direct database connection

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_info() { echo "ℹ️  $1"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }

EXPECTED_COUNT=63

echo "🔍 Verifying User Count in PostgreSQL Database"
echo "=============================================="
echo ""

# Method 1: Try API endpoint (if backend is running)
print_info "Attempting to check via API endpoint..."
if curl -s http://localhost:2600/api/admin/user-count --cookie-jar /tmp/cookies.txt --cookie /tmp/cookies.txt 2>&1 | grep -q "success"; then
    API_RESPONSE=$(curl -s http://localhost:2600/api/admin/user-count 2>&1)
    TOTAL=$(echo "$API_RESPONSE" | grep -o '"total":[0-9]*' | cut -d: -f2 || echo "0")
    
    if [ ! -z "$TOTAL" ] && [ "$TOTAL" != "0" ]; then
        print_success "API Check: Found $TOTAL users"
        
        if [ "$TOTAL" -eq "$EXPECTED_COUNT" ]; then
            print_success "✅ User count matches expected: $EXPECTED_COUNT"
            exit 0
        else
            print_error "⚠️  User count mismatch: Expected $EXPECTED_COUNT, found $TOTAL"
            exit 1
        fi
    fi
fi

# Method 2: Try direct Node.js script
print_info "Checking via Node.js script..."
if [ -f "scripts/check-user-count.js" ]; then
    NODE_RESULT=$(node scripts/check-user-count.js 2>&1)
    
    if echo "$NODE_RESULT" | grep -q "Expected 63 users found"; then
        print_success "✅ User count verified: 63 users"
        exit 0
    elif echo "$NODE_RESULT" | grep -q "total_users"; then
        TOTAL=$(echo "$NODE_RESULT" | grep "Total Users:" | awk '{print $3}')
        if [ "$TOTAL" -eq "$EXPECTED_COUNT" ]; then
            print_success "✅ User count matches expected: $EXPECTED_COUNT"
            exit 0
        else
            print_error "⚠️  User count mismatch: Expected $EXPECTED_COUNT, found $TOTAL"
            exit 1
        fi
    fi
fi

# Method 3: Direct PostgreSQL connection (if credentials available)
print_info "Attempting direct PostgreSQL connection..."
if command -v psql > /dev/null 2>&1; then
    # Try to get credentials from environment or .env file
    if [ -f ".env" ]; then
        source .env 2>/dev/null || true
    fi
    
    POSTGRES_HOST=${POSTGRES_HOST:-localhost}
    POSTGRES_PORT=${POSTGRES_PORT:-5432}
    POSTGRES_DB=${POSTGRES_DB:-8bp_rewards}
    POSTGRES_USER=${POSTGRES_USER:-admin}
    
    if [ ! -z "$POSTGRES_PASSWORD" ]; then
        export PGPASSWORD="$POSTGRES_PASSWORD"
        TOTAL=$(psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM registrations;" 2>/dev/null | tr -d ' ')
        
        if [ ! -z "$TOTAL" ] && [ "$TOTAL" != "0" ]; then
            print_success "Direct DB Check: Found $TOTAL users"
            
            if [ "$TOTAL" -eq "$EXPECTED_COUNT" ]; then
                print_success "✅ User count matches expected: $EXPECTED_COUNT"
                exit 0
            else
                print_error "⚠️  User count mismatch: Expected $EXPECTED_COUNT, found $TOTAL"
                exit 1
            fi
        fi
    fi
fi

print_error "❌ Could not verify user count"
print_info "Please ensure:"
print_info "  1. PostgreSQL is running"
print_info "  2. Backend API is running (for API method)"
print_info "  3. Database credentials are configured"
echo ""
print_info "To start services, run: ./start-system.sh"
exit 1



