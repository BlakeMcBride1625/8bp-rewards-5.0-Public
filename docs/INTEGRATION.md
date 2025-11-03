# 🔗 Integration Guide

Complete guide for integrating Discord, Telegram, Cloudflare, and VPS authentication.

## 📋 Table of Contents

1. [Discord Integration](#discord-integration)
2. [Telegram Integration](#telegram-integration)
3. [Cloudflare Tunnel](#cloudflare-tunnel)
4. [VPS Authentication](#vps-authentication)

---

## Discord Integration

### Bot Setup

1. **Create Application**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application"
   - Name your bot (e.g., "8BP Rewards Bot")

2. **Create Bot**
   - Go to "Bot" section
   - Click "Add Bot"
   - Copy bot token (keep secret!)

3. **OAuth2 Configuration**
   - Go to "OAuth2" → "General"
   - Add redirect URIs:
     - Production: `https://yourdomain.com/8bp-rewards/auth/discord/callback`
     - Development: `http://localhost:2600/api/auth/discord/callback`

4. **Bot Permissions**
   - Go to "OAuth2" → "URL Generator"
   - Select scopes: `bot`, `applications.commands`
   - Select permissions:
     - Send Messages
     - Attach Files
     - Read Message History
     - Use Slash Commands
     - Manage Messages
   - Use generated URL to invite bot to server

### Environment Configuration

```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_GUILD_ID=your_server_id
REGISTRATION_CHANNEL_ID=your_channel_id
REWARDS_CHANNEL_ID=your_channel_id
SCHEDULER_CHANNEL_ID=your_channel_id
ALLOWED_ADMINS=discord_id1,discord_id2
OAUTH_REDIRECT_URI=https://yourdomain.com/8bp-rewards/auth/discord/callback
```

### Getting Discord IDs

1. **Enable Developer Mode**: User Settings → Advanced → Developer Mode
2. **User ID**: Right-click user → Copy User ID
3. **Server ID**: Right-click server name → Copy Server ID
4. **Channel ID**: Right-click channel → Copy Channel ID

### Discord Commands

The bot supports these slash commands:
- `/register <8bp_id>` - Register for automated claims
- `/list-accounts` - List registered accounts
- `/check-accounts` - Check account status
- `/deregister <8bp_id>` - Remove registration
- `/help` - Show help information

### Testing Discord Bot

```bash
# Test bot connection
docker-compose logs -f discord-api

# Check bot status via API
curl http://localhost:2600/api/admin/bot-status-public
```

---

## Telegram Integration

### Bot Setup

1. **Create Bot**
   - Open Telegram, search for `@BotFather`
   - Send `/newbot`
   - Follow prompts to name your bot
   - Copy the bot token

2. **Get Your Telegram ID**
   - Start a conversation with your bot
   - Send any message
   - Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Find your user ID in the response

### Environment Configuration

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
ALLOWED_TELEGRAM_USERS=telegram_id1,telegram_id2
DISCORD_TO_TELEGRAM_MAPPING=discord_id1:telegram_id1,discord_id2:telegram_id2
```

### User Mapping

Map Discord IDs to Telegram IDs for VPS access:
```env
DISCORD_TO_TELEGRAM_MAPPING=discord_id1:telegram_id1,discord_id2:telegram_id2
```

**Format:** `discord_id:telegram_id,discord_id:telegram_id`

### Testing Telegram

```bash
# Send test message to bot
curl "https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<YOUR_ID>&text=Test"
```

---

## Cloudflare Tunnel

### Overview

Cloudflare Tunnel provides secure access without exposing ports or configuring firewalls. It automatically handles SSL/TLS.

### Quick Setup

```bash
# Use automated script
./scripts/cloudflare/quick-tunnel-setup.sh
```

### Manual Setup

1. **Install cloudflared**
   ```bash
   wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared-linux-amd64.deb
   ```

2. **Authenticate**
   ```bash
   cloudflared tunnel login
   ```
   Opens browser - login and select your domain.

3. **Create Tunnel**
   ```bash
   cloudflared tunnel create 8bp-rewards-tunnel
   ```

4. **Configure DNS**
   ```bash
   cloudflared tunnel route dns 8bp-rewards-tunnel yourdomain.com
   ```

5. **Get Tunnel UUID**
   ```bash
   cloudflared tunnel list
   ```

6. **Create Configuration**
   Edit `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: 8bp-rewards-tunnel
   credentials-file: /home/user/.cloudflared/TUNNEL_UUID.json
   
   ingress:
     - hostname: yourdomain.com
       service: http://localhost:2600
       originRequest:
         httpHostHeader: yourdomain.com
     - service: http_status:404
   ```

7. **Create Systemd Service**
   ```bash
   sudo tee /etc/systemd/system/cloudflared-tunnel.service > /dev/null <<EOF
   [Unit]
   Description=Cloudflare Tunnel
   After=network.target
   
   [Service]
   Type=simple
   User=$USER
   ExecStart=/usr/bin/cloudflared tunnel --config $HOME/.cloudflared/config.yml run
   Restart=always
   
   [Install]
   WantedBy=multi-user.target
   EOF
   
   sudo systemctl enable cloudflared-tunnel
   sudo systemctl start cloudflared-tunnel
   ```

### Tunnel Management

```bash
# Check status
sudo systemctl status cloudflared-tunnel

# View logs
sudo journalctl -u cloudflared-tunnel -f

# List tunnels
cloudflared tunnel list

# Delete tunnel
cloudflared tunnel delete 8bp-rewards-tunnel

# Update DNS route
cloudflared tunnel route dns 8bp-rewards-tunnel yourdomain.com
```

### Troubleshooting

**Tunnel won't start:**
- Check credentials file exists: `~/.cloudflared/TUNNEL_UUID.json`
- Verify config file syntax
- Check logs: `sudo journalctl -u cloudflared-tunnel -xe`

**DNS not resolving:**
- Wait 5-10 minutes for DNS propagation
- Verify route exists: `cloudflared tunnel route dns list`

---

## VPS Authentication

### Multi-Channel Authentication

VPS Monitor access supports three authentication methods:
1. **Discord** - Access code via DM
2. **Telegram** - Access code via Telegram bot
3. **Email** - 6-digit PIN code via email

### Setup

1. **Configure VPS Owners**
   ```env
   VPS_OWNERS=discord_id1,discord_id2
   ALLOWED_VPS_ADMINS=discord_id1,discord_id2
   ```

2. **Email Mapping** (for email authentication)
   ```env
   ADMIN_EMAILS=admin1@example.com,admin2@example.com
   DISCORD_TO_EMAIL_MAPPING=discord_id1:admin1@example.com,discord_id2:admin2@example.com
   ```

3. **Telegram Mapping** (for Telegram authentication)
   ```env
   DISCORD_TO_TELEGRAM_MAPPING=discord_id1:telegram_id1,discord_id2:telegram_id2
   ```

### Authentication Flow

1. User clicks "VPS Monitor" tab
2. System checks if user is in `ALLOWED_VPS_ADMINS`
3. User requests access code via preferred method
4. Code sent via Discord DM, Telegram, or Email
5. User enters code in modal
6. Code verified (expires in 5 minutes)
7. Access granted

### Code Formats

- **Discord/Telegram**: 16-character hex code (e.g., `A1B2C3D4E5F6789A`)
- **Email**: 6-digit PIN (e.g., `123456`)

### Security Features

- Codes expire after 5 minutes
- One-time use only
- User-specific (only requester can use)
- Auto-cleanup of Discord/Telegram messages
- Database storage for audit trail

### Testing VPS Access

1. Log in as admin
2. Navigate to Admin Dashboard
3. Click "VPS Monitor" tab
4. Request access code
5. Enter code when received
6. Verify VPS Monitor loads

### Troubleshooting

**Email not sending:**
- Check SMTP configuration in `.env`
- Verify `ADMIN_EMAILS` or `DISCORD_TO_EMAIL_MAPPING` configured
- Check email service logs

**Discord code not received:**
- Verify bot has DM permissions
- Check `ALLOWED_VPS_ADMINS` includes your Discord ID
- Check Discord bot service logs

**Telegram code not received:**
- Verify `TELEGRAM_BOT_TOKEN` configured
- Check `DISCORD_TO_TELEGRAM_MAPPING` includes your mapping
- Verify Telegram bot is running

---

## Integration Testing

### Test All Integrations

```bash
# Test Discord OAuth
curl http://localhost:2600/api/auth/discord

# Test Discord Bot Status
curl http://localhost:2600/api/admin/bot-status-public

# Test Database Connection
docker-compose exec postgres psql -U admin -d 8bp_rewards -c "SELECT NOW();"

# Test Email (if configured)
# Request VPS access code via email from admin dashboard
```

### Verification Checklist

- [ ] Discord bot online and responding
- [ ] Discord OAuth login works
- [ ] Telegram bot responding (if configured)
- [ ] Email sending works (if configured)
- [ ] Cloudflare tunnel active (if using)
- [ ] VPS access codes working for all channels
- [ ] All mappings configured correctly

---

*Last Updated: November 3, 2025*

