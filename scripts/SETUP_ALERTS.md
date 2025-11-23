# Service Alert Setup Guide

## Overview
The service monitoring system automatically sends alerts via email and Discord when critical services go down.

## Configuration

### 1. Email Alerts
Email alerts are sent using your existing SMTP configuration. You can configure multiple recipients:

```env
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password

# Primary alert email
SERVICE_ALERT_EMAIL=your-email@example.com

# Secondary/system alert email (optional)
SYSTEM_ALERT_EMAIL=system-email@example.com

# "From" address for service alerts (optional, defaults to system-services@epildevconnect.uk)
SERVICE_ALERT_MAIL_FROM=system-services@epildevconnect.uk
```

**Note:** 
- Service alerts will appear to be from "System Services" but use your authenticated SMTP email address (required by SMTP servers)
- You can configure multiple recipients - both `SERVICE_ALERT_EMAIL` and `SYSTEM_ALERT_EMAIL` will receive alerts
- The email will show "System Services <your-smtp-user@domain.com>" as the sender

### 2. Discord DM Alerts
To receive alerts via Discord DMs:

1. **Get your Discord User ID:**
   - Enable Developer Mode in Discord (Settings → Advanced → Developer Mode)
   - Right-click on your username/avatar → Copy User ID

2. **Add to `.env`:**
   ```env
   SERVICE_ALERT_DISCORD_USER_ID=your_discord_user_id
   DISCORD_TOKEN=your_discord_bot_token
   ```
   
   Note: `DISCORD_TOKEN` should already be set if you're using the Discord bot.

## Testing

### Test Email Alert:
```bash
cd /home/blake/8bp-rewards
npx ts-node scripts/send-service-alert.ts "test-container:Test Service Description"
```

### Test Discord DM Alert:
```bash
cd /home/blake/8bp-rewards
npx ts-node scripts/send-service-alert.ts "test-container:Test Service Description"
```

### Test Full Health Check:
```bash
/home/blake/8bp-rewards/scripts/check-services.sh
```

If a service is down, alerts will be sent automatically.

## Monitoring

The cron job runs every 5 minutes and checks all services. When a service fails:
1. An email alert is sent to `SERVICE_ALERT_EMAIL`
2. A Discord DM is sent to `SERVICE_ALERT_DISCORD_USER_ID`
3. Both alerts include:
   - List of failed services
   - Timestamp
   - Server information
   - Action required notice

## Troubleshooting

### Email not sending:
- Check SMTP configuration in `.env`
- Verify `SERVICE_ALERT_EMAIL` is set
- Test SMTP connection manually

### Discord DM alerts not working:
- Verify `SERVICE_ALERT_DISCORD_USER_ID` is set correctly
- Verify `DISCORD_TOKEN` is set correctly
- Make sure the bot can DM you (check privacy settings)
- Ensure you've enabled Developer Mode to get your User ID

### TypeScript script errors:
- Ensure `ts-node` is installed: `npm install -g ts-node typescript`
- Or use: `npx ts-node scripts/send-service-alert.ts`

## Files

- `scripts/check-services.sh` - Health check script (runs every 5 minutes)
- `scripts/send-service-alert.ts` - Alert sending script (TypeScript)
- `scripts/setup-service-monitor.sh` - Cron job setup script
- `logs/service-monitor.log` - Monitoring log file

## Notes

- Alerts are only sent when services actually fail (not on every check)
- The script uses your existing SMTP configuration
- Discord DM is optional (alerts still work with just email)
- All alerts include formatted HTML/text for email and Discord embeds

