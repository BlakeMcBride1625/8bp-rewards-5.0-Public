# Telegram Bot Setup Guide

This guide will help you set up the Telegram bot for dual-channel VPS Monitor authentication.

## Step 1: Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Start a chat with BotFather
3. Send the command `/newbot`
4. Choose a name for your bot (e.g., "8BP VPS Monitor Bot")
5. Choose a username for your bot (must end with 'bot', e.g., "8bp_vps_monitor_bot")
6. BotFather will give you a **Bot Token** - **SAVE THIS SECURELY!**

## Step 2: Configure Bot Settings

1. Send `/setprivacy` to BotFather
2. Select your bot
3. Choose `Disable` - This allows the bot to read all messages in groups (needed for DMs)

## Step 3: Get Your Telegram User ID

1. Open Telegram and search for [@userinfobot](https://t.me/userinfobot)
2. Start a chat with @userinfobot
3. Send any message
4. The bot will reply with your User ID - **SAVE THIS!**

## Step 4: Test Your Bot

1. Start a chat with your bot (search for the username you created)
2. Send `/start` to your bot
3. Your bot should respond (even if it's just a default message)

## Step 5: Update Configuration

### Update your `.env` file:
```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
ALLOWED_TELEGRAM_USERS=your_telegram_user_id_here,your_friend_telegram_user_id_here
```

Replace:
- `your_bot_token_here` with the token you got from BotFather
- `your_telegram_user_id_here` with your Telegram User ID
- `your_friend_telegram_user_id_here` with any additional Telegram User IDs (comma-separated)

**Important**: Only users listed in `ALLOWED_TELEGRAM_USERS` will receive Telegram codes. This provides an extra layer of security.

## Step 6: Test the Integration

1. Restart your backend server
2. Try accessing the VPS Monitor
3. You should receive codes via both Discord and Telegram

## Important Notes

### Security:
- **Never share your bot token publicly**
- **Keep your Telegram User ID private**
- The bot token is like a password - treat it securely

### Bot Capabilities:
- The bot can only send messages to users who have started a chat with it
- Users must have sent `/start` to the bot before it can send DMs
- The bot automatically deletes access codes after use for security

### Troubleshooting:

**Bot not responding:**
- Check if the bot token is correct
- Make sure you've started a chat with your bot
- Verify the bot is not blocked

**Can't receive DMs:**
- Make sure you've sent `/start` to your bot
- Check if you have DMs enabled from bots
- Verify your User ID is correct

**Integration not working:**
- Check backend logs for Telegram API errors
- Verify the bot token in your `.env` file
- Make sure the backend service has internet access

## Example Bot Token Format:
```
1234567890:ABCdefGHIjklMNOpqrsTUVwxyz-1234567890
```

## Example User ID Format:
```
123456789
```

## Testing Commands:

You can test your Telegram bot integration using the admin endpoints:
- `POST /api/admin/vps/test-telegram` - Test Telegram DM functionality
- `POST /api/admin/vps/test-discord` - Test Discord DM functionality

## Security Features:

✅ **Dual-Channel Authentication**: Requires both Discord AND Telegram codes
✅ **Auto-Delete Messages**: Access codes are automatically deleted after use
✅ **Time-Limited Codes**: Codes expire after 5 minutes
✅ **One-Time Use**: Each code can only be used once
✅ **Secure Storage**: Codes are stored in memory and cleaned up automatically

This dual-channel system provides enhanced security by ensuring access to both communication platforms is required for VPS Monitor access.
