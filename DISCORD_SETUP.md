# Discord Bot Setup Guide

This guide will help you set up the Discord bot for 8 Ball Pool reward confirmations.

## Step 1: Create a Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Give your bot a name (e.g., "8BP Reward Bot")
4. Click "Create"

## Step 2: Create a Bot

1. In your application, go to the "Bot" section
2. Click "Add Bot"
3. Under "Token", click "Copy" to get your bot token
4. **Important**: Keep this token secret! Never share it publicly.

## Step 3: Set Bot Permissions

1. Go to "OAuth2" → "URL Generator"
2. Select scopes:
   - `bot`
   - `applications.commands`
3. Select bot permissions:
   - `Send Messages`
   - `Attach Files`
   - `Read Message History`
   - `Use Slash Commands`
4. Copy the generated URL and open it in your browser
5. Select your server and authorize the bot

## Step 4: Get Channel and Server IDs

### Server ID:
1. Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
2. Right-click your server name
3. Click "Copy Server ID"

### Channel ID:
1. Right-click the channel where you want confirmations posted
2. Click "Copy Channel ID"

## Step 5: Get Your Discord User ID

1. Right-click your username in Discord
2. Click "Copy User ID"

## Step 6: Update Configuration Files

### Update `.env` file:
```env
# Discord Bot Configuration
DISCORD_TOKEN=your_bot_token_here
DISCORD_CHANNEL_ID=your_channel_id_here
DISCORD_GUILD_ID=your_server_id_here

# Special Discord users who get DMs (comma-separated Discord IDs)
DISCORD_SPECIAL_USERS=your_discord_id,your_friend_discord_id
```

### Update `user-mapping.json`:
```json
{
  "userMappings": [
    {
      "discordId": "your_discord_id_here",
      "bpAccountId": "3057211056",
      "username": "Blake"
    },
    {
      "discordId": "your_friend_discord_id_here", 
      "bpAccountId": "1826254746",
      "username": "Friend"
    }
  ]
}
```

## Step 7: Install Dependencies

```bash
npm install
```

## Step 8: Test the Bot

### Option 1: Run Discord Bot Only (Recommended for slash commands)
```bash
# Start the Discord bot with slash commands
npm run bot
```

### Option 2: Test with Discord integration
```bash
# Test with Discord integration
npm run claim-discord

# Or start the scheduled version
npm run schedule-discord
```

### Option 3: Test Discord service
```bash
# Test Discord service functionality
npm run test-discord
```

## Features

### For Special Users (You + Your Friend):
- ✅ Direct Message (DM) with confirmation
- ✅ Channel posting
- ✅ Image attachment with claimed items
- ✅ 8BP account ID in message

### For All Other Users:
- ✅ Channel posting only
- ✅ Image attachment with claimed items  
- ✅ 8BP account ID in message

### File Management:
- ✅ Images sent to Discord are preserved
- ✅ Local PNG files are automatically deleted after sending
- ✅ Old confirmation files are cleaned up after 24 hours

### Slash Commands:
- ✅ `/add` - Register your 8BP account ID (Special users only)
- ✅ `/list` - View all registered accounts (Special users only)
- ✅ `/remove` - Remove your account (Special users only)
- ✅ `/claim` - Manual reward claiming (Special users only)
- ✅ `/get` - Claim rewards for specific 8BP account ID (Special users only)
- ✅ `/clear` - Delete messages (Special users only)
- ✅ `/md` - Show complete README documentation (Special users only)
- ✅ `/help` - Show all available commands (Special users only)

## Message Format

Each confirmation message includes:
- 🎱 8 Ball Pool logo
- Account ID
- Username
- Timestamp (UK time)
- List of claimed items (if any)
- Attached screenshot/confirmation image

## Slash Commands Guide

### `/add` - Register Your 8BP Account
```
/add bp_id:3417777776 username:YourName
```
- **Required**: `bp_id` - Your 8 Ball Pool account ID (e.g., 3417777776)
- **Required**: `username` - Choose a display name for this account
- **Result**: Adds your account to the reward claiming system
- **Permission**: Special users only
- **Example**: `/add bp_id:3417777776 username:Blake`

### `/list` - View Registered Accounts
```
/list
```
- **Result**: Shows all registered 8BP accounts with usernames and IDs
- **Permission**: Special users only

### `/remove` - Remove Your Account
```
/remove bp_id:3057211056
```
- **Required**: `bp_id` - Your 8 Ball Pool account ID to remove
- **Result**: Removes your account from the system
- **Note**: You can only remove your own account
- **Permission**: Special users only

### `/claim` - Manual Reward Claiming
```
/claim
```
- **Result**: Manually triggers reward claiming for your account
- **Permission**: Special users only
- **Use Case**: Test claiming or get rewards outside scheduled times

### `/get` - Claim Rewards for Specific Account
```
/get bp_id:3057211056
```
- **Required**: `bp_id` - The 8 Ball Pool account ID to claim rewards for
- **Result**: Manually claims rewards for the specified 8BP account
- **Permission**: Special users only
- **Security**: You can only claim for accounts you own
- **Use Case**: Claim rewards for specific accounts on demand

### `/clear` - Delete Messages
```
/clear amount:10
```
- **Required**: `amount` - Number of messages to delete (1-100)
- **Permission**: Special users only
- **Result**: Bulk deletes messages (excludes pinned messages)
- **Note**: Only works in server channels, not in DMs

### `/md` - Show Documentation
```
/md
```
- **Result**: Displays complete README documentation and setup information
- **Permission**: Special users only
- **Use Case**: Quick access to full documentation without leaving Discord

### `/help` - Show Commands
```
/help
```
- **Result**: Displays all available commands and usage instructions
- **Permission**: Special users only

## Access Control

**All slash commands are restricted to special users only!**

- Only users listed in `DISCORD_SPECIAL_USERS` in your `.env` file can use any slash commands
- Non-special users will receive an "Access denied" message when trying to use commands
- This provides enhanced security and prevents unauthorized users from managing the bot

### DM Support
- **Special users can use commands in both server channels AND direct messages**
- **Non-special users**: Cannot use commands anywhere (servers or DMs)
- **Exception**: `/clear` command only works in server channels (not DMs)
- **All other commands**: Work in both servers and DMs for special users

### Setting Up Special Users

In your `.env` file, add your Discord user IDs:
```env
DISCORD_SPECIAL_USERS=your_discord_id,your_friend_discord_id
```

To get your Discord user ID:
1. Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
2. Right-click your username → Copy User ID

## Troubleshooting

### Bot not responding:
1. Check if the bot is online in your server
2. Verify the bot has proper permissions
3. Check the token in your `.env` file

### Messages not sending:
1. Verify channel ID is correct
2. Check if bot has "Send Messages" permission
3. Ensure channel allows file attachments

### DMs not working:
1. Check if users have DMs enabled from server members
2. Verify Discord user IDs are correct
3. Bot can only send DMs to users who share a server

## Security Notes

- Never commit your `.env` file to version control
- Keep your bot token secret
- Consider using environment variables on your VPS
- Regularly rotate your bot token if needed
