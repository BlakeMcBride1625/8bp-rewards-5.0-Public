#!/bin/bash

# Service Health Check Script
# Checks critical services and alerts if they're down

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Checking critical services..."
echo ""

CRITICAL_SERVICES=(
    "8bp-postgres:5432:PostgreSQL Database"
    "8bp-backend:2600:Backend API"
    "8bp-discord-api:2700:Discord API"
    "myhub-postgres:1800:MyHub PostgreSQL"
    "myhub-app:1600:MyHub App"
)

FAILED=0
FAILED_SERVICES=()

for service_info in "${CRITICAL_SERVICES[@]}"; do
    IFS=':' read -r container_name port description <<< "$service_info"
    
    # Find the actual container name (may have hash prefix from docker-compose)
    actual_container=$(docker ps --format '{{.Names}}' | grep -E "(^|_)${container_name}$" | head -1)
    
    # Check if container is running
    if [ -n "$actual_container" ]; then
        # Check if it's healthy (if healthcheck exists)
        health=$(docker inspect --format='{{.State.Health.Status}}' "${actual_container}" 2>/dev/null || echo "no-healthcheck")
        
        if [[ "$health" == "healthy" ]] || [[ "$health" == "no-healthcheck" ]] || [[ "$health" == "" ]]; then
            echo -e "${GREEN}✅${NC} ${description} (${actual_container}) - Running"
        else
            echo -e "${YELLOW}⚠️${NC} ${description} (${actual_container}) - Running but ${health}"
            FAILED=$((FAILED + 1))
            FAILED_SERVICES+=("${actual_container}:${description}")
        fi
    else
        echo -e "${RED}❌${NC} ${description} (${container_name}) - NOT RUNNING"
        FAILED=$((FAILED + 1))
        FAILED_SERVICES+=("${container_name}:${description}")
    fi
done

echo ""
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All critical services are running${NC}"
    exit 0
else
    echo -e "${RED}✗ $FAILED service(s) have issues${NC}"
    
    # Send alerts if services failed
    if [ ${#FAILED_SERVICES[@]} -gt 0 ]; then
        echo ""
        echo "📧 Sending alerts..."
        
        # Get script directory
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        ALERT_SCRIPT="${SCRIPT_DIR}/send-service-alert.ts"
        
        # Check if ts-node is available, otherwise use compiled version
        if command -v ts-node >/dev/null 2>&1; then
            ts-node "${ALERT_SCRIPT}" "${FAILED_SERVICES[@]}" 2>&1
        elif [ -f "${SCRIPT_DIR}/../node_modules/.bin/ts-node" ]; then
            "${SCRIPT_DIR}/../node_modules/.bin/ts-node" "${ALERT_SCRIPT}" "${FAILED_SERVICES[@]}" 2>&1
        else
            # Try using node with ts-node/register
            node -r ts-node/register "${ALERT_SCRIPT}" "${FAILED_SERVICES[@]}" 2>&1 || {
                echo "⚠️  Could not run TypeScript alert script. Please ensure ts-node is installed."
                echo "   Install with: npm install -g ts-node typescript"
            }
        fi
    fi
    
    exit 1
fi

