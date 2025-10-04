# Complete .env Configuration Guide

## Current .env Configuration

Your `.env` file is already set up with all necessary variables. Here's what each one does and how to get the values:

## 8ball Pool Configuration

### USER_IDS
```env
USER_IDS=3057211056,1826254746
```
- **What**: Comma-separated list of 8 Ball Pool account IDs
- **How to get**: From your 8BP profile or when you register with `/add`
- **Example**: `USER_IDS=3057211056,1826254746,1234567890`

### SHOP_URL
```env
SHOP_URL=https://8ballpool.com/en/shop
```
- **What**: The 8 Ball Pool shop URL
- **Default**: Already correct, don't change unless needed

### HEADLESS
```env
HEADLESS=true
```
- **What**: Run browser in background (true) or visible (false)
- **For VPS**: Keep `true`
- **For debugging**: Set to `false`

### TIMEOUT
```env
TIMEOUT=60000
```
- **What**: Page load timeout in milliseconds
- **Default**: 60 seconds (good for most cases)

### DELAY_BETWEEN_USERS
```env
DELAY_BETWEEN_USERS=10000
```
- **What**: Delay between processing different users (prevents rate limiting)
- **Default**: 10 seconds (good balance)

## Discord Bot Configuration

### DISCORD_TOKEN
```env
DISCORD_TOKEN=your_discord_bot_token_here
```
- **What**: Your Discord bot's authentication token
- **How to get**:
  1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
  2. Select your application
  3. Go to "Bot" section
  4. Click "Copy" under Token
- **⚠️ Keep this secret!**

### DISCORD_CHANNEL_ID
```env
DISCORD_CHANNEL_ID=your_channel_id_here
```
- **What**: Channel where confirmations will be posted
- **How to get**:
  1. Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
  2. Right-click the channel → Copy Channel ID
- **Example**: `DISCORD_CHANNEL_ID=1234567890123456789`

### DISCORD_GUILD_ID
```env
DISCORD_GUILD_ID=your_server_id_here
```
- **What**: Your Discord server ID
- **How to get**:
  1. Enable Developer Mode in Discord
  2. Right-click your server name → Copy Server ID
- **Example**: `DISCORD_GUILD_ID=9876543210987654321`

### DISCORD_SPECIAL_USERS
```env
DISCORD_SPECIAL_USERS=your_discord_id,your_friend_discord_id
```
- **What**: Discord IDs of users who can use slash commands and get DMs
- **How to get**:
  1. Enable Developer Mode in Discord
  2. Right-click usernames → Copy User ID
- **Example**: `DISCORD_SPECIAL_USERS=111111111111111111,222222222222222222`

## Discord OAuth2 Configuration

### DISCORD_CLIENT_ID
```env
DISCORD_CLIENT_ID=your_discord_client_id_here
```
- **What**: Your Discord application's Client ID
- **How to get**:
  1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
  2. Select your application
  3. Go to "General Information"
  4. Copy "Application ID" (this is the Client ID)

### DISCORD_CLIENT_SECRET
```env
DISCORD_CLIENT_SECRET=your_discord_client_secret_here
```
- **What**: Your Discord application's Client Secret
- **How to get**:
  1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
  2. Select your application
  3. Go to "General Information"
  4. Click "Reset Secret" if needed
  5. Copy the "Client Secret"
- **⚠️ Keep this secret!**

## Complete Example

Here's what a fully configured `.env` file looks like:

```env
# 8ball Pool Configuration
USER_IDS=3057211056,1826254746,1234567890
SHOP_URL=https://8ballpool.com/en/shop
HEADLESS=true
TIMEOUT=60000
DELAY_BETWEEN_USERS=10000

# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CHANNEL_ID=1234567890123456789
DISCORD_GUILD_ID=9876543210987654321
DISCORD_SPECIAL_USERS=111111111111111111,222222222222222222

# Discord OAuth2 Configuration
DISCORD_CLIENT_ID=1234567890123456789
DISCORD_CLIENT_SECRET=AbCdEfGhIjKlMnOpQrStUvWxYz123456789
```

## Required vs Optional

### Required for Basic Functionality:
- ✅ `USER_IDS`
- ✅ `DISCORD_TOKEN`
- ✅ `DISCORD_CHANNEL_ID`
- ✅ `DISCORD_SPECIAL_USERS`

### Optional (but recommended):
- ✅ `DISCORD_GUILD_ID` (for faster command registration)
- ✅ `DISCORD_CLIENT_ID` (for OAuth2 features)
- ✅ `DISCORD_CLIENT_SECRET` (for OAuth2 features)
- ✅ `SHOP_URL` (default is fine)
- ✅ `HEADLESS` (default is fine)
- ✅ `TIMEOUT` (default is fine)
- ✅ `DELAY_BETWEEN_USERS` (default is fine)

## Security Notes

- 🔒 **Never commit `.env` to version control**
- 🔒 **Keep Discord tokens and secrets private**
- 🔒 **Use environment variables on VPS**
- 🔒 **Regularly rotate tokens if needed**

## Testing Your Configuration

After updating your `.env` file:

1. **Test Discord integration**:
   ```bash
   npm run test-discord
   ```

2. **Start the Discord bot**:
   ```bash
   npm run bot
   ```

3. **Test slash commands** in your Discord server

4. **Test automation**:
   ```bash
   npm run claim-discord
   ```

## Troubleshooting

### Common Issues:

1. **"No Discord token provided"**
   - Check if `DISCORD_TOKEN` is set correctly
   - Make sure there are no extra spaces

2. **"Discord channel not found"**
   - Verify `DISCORD_CHANNEL_ID` is correct
   - Make sure bot has access to the channel

3. **"Access denied"**
   - Check if your Discord ID is in `DISCORD_SPECIAL_USERS`
   - Make sure Discord IDs are correct

4. **Commands not appearing**
   - Restart the bot after updating `.env`
   - Check bot permissions in Discord

Your `.env` file is ready! Just replace the placeholder values with your actual Discord tokens and IDs.
