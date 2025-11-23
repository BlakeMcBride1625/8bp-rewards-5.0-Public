#!/bin/bash

# Setup cron job to monitor services every 5 minutes
# This will check critical services and log any failures

SCRIPT_PATH="/home/blake/8bp-rewards/scripts/check-services.sh"
LOG_FILE="/home/blake/8bp-rewards/logs/service-monitor.log"

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

# Add cron job (runs every 5 minutes)
(crontab -l 2>/dev/null | grep -v "check-services.sh"; echo "*/5 * * * * $SCRIPT_PATH >> $LOG_FILE 2>&1") | crontab -

echo "✅ Service monitor cron job added (checks every 5 minutes)"
echo "📝 Logs will be written to: $LOG_FILE"
echo ""
echo "To view recent logs: tail -f $LOG_FILE"
echo "To remove the cron job: crontab -e (then delete the check-services.sh line)"


