# 8 Ball Pool Rewards Bot

An automated Discord bot that claims free cue pieces and daily rewards from the 8 Ball Pool website shop, with MongoDB storage and comprehensive Discord integration.

## Features

- 🎯 **Automated Claiming**: Uses Playwright to interact with the 8 Ball Pool shop
- 🆔 **Multiple User Support**: Claim rewards for multiple users with different User IDs
- 🔐 **Login Automation**: Automatically handles the login modal and "Go" button
- 🎁 **Daily Rewards**: Claims free daily rewards and cue pieces
- ⏰ **Daily Scheduling**: Automatically runs daily at 12:00 AM and 12:00 PM
- 📝 **Comprehensive Logging**: Tracks all activities and errors
- 🛡️ **Error Handling**: Robust error handling for various scenarios
- 🖥️ **Headless Operation**: Runs in the background without opening browser windows
- 🤖 **Discord Integration**: Sends confirmation messages with images to Discord
- 📸 **Image Generation**: Creates confirmation images with claimed items
- 🗑️ **Automatic Cleanup**: Deletes local files after sending to Discord
- 💾 **MongoDB Storage**: Persistent user data with automatic backups
- 🔄 **Smart Override**: Automatic conflict resolution for duplicate accounts
- 📊 **Statistics Tracking**: Monitor claim counts and timestamps
- 🔧 **TypeScript**: Fully typed for better development experience

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn

## Installation

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create environment file:**
   ```bash
   cp env-template.txt .env
   ```

3. **Configure your settings in `.env`:**

### Docker Deployment (Recommended for VPS)

1. **Clone the repository on your VPS:**
   ```bash
   git clone <your-repo-url> 8bp-rewards
   cd 8bp-rewards
   ```

2. **Run the deployment script:**
   ```bash
   ./docker-deploy.sh
   ```

3. **Follow the prompts to configure your `.env` file**

4. **Or manually deploy:**
   ```bash
   # Copy environment template
   cp env.docker .env
   
   # Edit .env with your settings
   nano .env
   
   # Build and start services
   docker-compose up -d
   ```

## Docker Commands

```bash
# Build and start services
npm run docker:build && npm run docker:up

# View logs
npm run docker:logs

# Restart services
npm run docker:restart

# Stop services
npm run docker:down

# Clean up (removes data!)
npm run docker:clean
```

## Configuration
   ```env
   # 8ball Pool Configuration
   USER_IDS=3057211056,1826254746
   SHOP_URL=https://8ballpool.com/en/shop
   HEADLESS=true
   TIMEOUT=60000
   DELAY_BETWEEN_USERS=10000
   
   # Discord Bot Configuration (optional)
   DISCORD_TOKEN=your_discord_bot_token_here
   DISCORD_CHANNEL_ID=your_channel_id_here
   DISCORD_GUILD_ID=your_server_id_here
   DISCORD_SPECIAL_USERS=your_discord_id,your_friend_discord_id
   ```

## Usage

### Build the project
```bash
npm run build
```

### Run once (without scheduling)
```bash
npm run claim
```

### Run with Discord integration
```bash
npm run claim-discord
```

### Run with daily scheduling
```bash
npm run schedule
```

### Run with Discord and daily scheduling
```bash
npm run schedule-discord
```

### Development mode (with TypeScript directly)
```bash
# Run once in dev mode
npm run dev-once

# Run with scheduling in dev mode
npm run dev
```

## Configuration

The tool uses environment variables for configuration:

| Variable | Description | Default |
|----------|-------------|---------|
| `USER_IDS` | Comma-separated 8ball pool User IDs | `1826254746` |
| `SHOP_URL` | The shop URL | `https://8ballpool.com/en/shop` |
| `HEADLESS` | Run browser in headless mode | `true` |
| `TIMEOUT` | Page timeout in milliseconds | `60000` |
| `DELAY_BETWEEN_USERS` | Delay between users in milliseconds | `10000` |
| `DISCORD_TOKEN` | Discord bot token (optional) | - |
| `DISCORD_CHANNEL_ID` | Discord channel ID for confirmations | - |
| `DISCORD_GUILD_ID` | Discord server ID | - |
| `DISCORD_SPECIAL_USERS` | Comma-separated Discord IDs for DMs | - |
| `MONGO_ROOT_USERNAME` | MongoDB root username (Docker) | `admin` |
| `MONGO_ROOT_PASSWORD` | MongoDB root password (Docker) | - |
| `MONGO_DATABASE` | MongoDB database name (Docker) | `8bp_rewards` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/8bp-rewards` |
| `TZ` | Timezone | `Europe/London` |

## Docker Architecture

The application uses Docker Compose with two services:

### Services
- **mongodb**: MongoDB 7.0 database with persistent storage
- **app**: 8BP Rewards application with Discord integration

### Volumes
- **mongodb_data**: Persistent MongoDB data storage
- **mongodb_config**: MongoDB configuration storage
- **./logs**: Application logs (mounted from host)
- **./user-mapping.json**: User mapping file (mounted from host)

### Networking
- Services communicate via Docker network (`8bp-network`)
- MongoDB accessible on port 27017 (for external connections if needed)

### Health Checks
- MongoDB: Checks database connectivity
- App: Basic Node.js process health check

## Project Structure

```
8bp-rewards/
├── src/
│   ├── 8bp-claimer.ts    # Main automation class
│   ├── run-once.ts       # One-time execution script
│   ├── config.ts         # Configuration management
│   └── logger.ts         # Logging utility
├── dist/                 # Compiled JavaScript (after build)
├── playwright-claimer.js              # Working Playwright automation
├── playwright-claimer-discord.js      # Discord-enabled version
├── discord-service.js                 # Discord bot service
├── image-generator.js                 # Image generation utility
├── user-mapping.json                  # Discord to 8BP ID mappings
├── package.json                       # Dependencies and scripts
├── tsconfig.json                      # TypeScript configuration
├── env-template.txt                   # Environment variables template
├── env.docker                         # Docker environment template
├── Dockerfile                         # Docker image configuration
├── docker-compose.yml                 # Docker services configuration
├── docker-deploy.sh                   # Docker deployment script
├── .dockerignore                      # Docker ignore patterns
├── DISCORD_SETUP.md                   # Discord bot setup guide
└── README.md                          # This file
```

## Logging

All activities are logged to `8bp-claimer.log` and displayed in the console with timestamps and different log levels:

- **INFO**: General information about the process
- **WARN**: Warnings about potential issues
- **ERROR**: Errors that occurred
- **SUCCESS**: Successful operations

## Scheduling

The main script automatically schedules daily runs at 12:00 AM and 12:00 PM using `node-cron`. You can modify the schedule in the Playwright claimer files:

```javascript
// Schedule for 12:00 AM (midnight)
cron.schedule('0 0 * * *', async () => {
  console.log('🕛 Midnight claim starting...');
  await this.runDailyClaim();
});

// Schedule for 12:00 PM (noon)
cron.schedule('0 12 * * *', async () => {
  console.log('🕛 Noon claim starting...');
  await this.runDailyClaim();
});
```

Cron format: `minute hour day month day-of-week`
- `0 0 * * *` = Every day at 12:00 AM (midnight)
- `0 12 * * *` = Every day at 12:00 PM (noon)
- `0 */6 * * *` = Every 6 hours
- `0 9 * * 1-5` = Weekdays at 9:00 AM

## Discord Integration

The tool includes a comprehensive Discord confirmation system:

### Features
- 📸 **Image Confirmations**: Sends screenshots of claimed items
- 💬 **Channel Posting**: Posts confirmations to designated Discord channel
- 📩 **Direct Messages**: Sends DMs to special users (you + your friend)
- 🆔 **Account Linking**: Links Discord IDs to 8BP account IDs
- 🗑️ **File Cleanup**: Automatically deletes local files after sending

### Setup
1. **Create Discord Bot**: Follow the guide in `DISCORD_SETUP.md`
2. **Update Configuration**: Add Discord settings to your `.env` file
3. **Map Users**: Update `user-mapping.json` with Discord and 8BP IDs
4. **Run with Discord**: Use `npm run claim-discord` or `npm run schedule-discord`

### Message Format
Each confirmation includes:
- 🎱 8 Ball Pool branding
- Account ID and username
- Timestamp (UK time)
- List of claimed items
- Screenshot attachment

### User Types
- **Special Users**: Get both DMs and channel posts + can use all slash commands
- **Regular Users**: Get channel posts only (no command access)
- **All Users**: Images remain permanently in Discord messages

### Access Control
- **Slash Commands**: Restricted to special users only (defined in `DISCORD_SPECIAL_USERS`)
- **Security**: Prevents unauthorized users from managing the bot
- **Permissions**: Only you and your friend can use commands

## Troubleshooting

### Common Issues

1. **"Could not find user ID input field"**
   - The website layout may have changed
   - Try running without headless mode: set `HEADLESS=false` in `.env`
   - Check the logs for more details

2. **"Could not find claim button"**
   - The button selectors may need updating
   - Check if the website requires additional steps

3. **Browser crashes or timeouts**
   - Increase the timeout: set `TIMEOUT=60000` in `.env`
   - Ensure you have enough system resources

4. **Dependencies issues**
   ```bash
   # Clear node_modules and reinstall
   rm -rf node_modules package-lock.json
   npm install
   ```

### Debug Mode

To run with visible browser (for debugging):
1. Set `HEADLESS=false` in `.env`
2. Run the script
3. Watch the browser automation in real-time

### Logs

Check `8bp-claimer.log` for detailed information about what the tool is doing and any errors encountered.

## Development

### Adding New Features

1. **Modify selectors**: Update the selector arrays in `8bp-claimer.ts`
2. **Add new checks**: Extend the success detection logic
3. **Improve error handling**: Add more specific error cases

### Building

```bash
# Clean previous build
npm run clean

# Build TypeScript to JavaScript
npm run build
```

## Security Notes

- The tool only uses your User ID, no passwords required
- All browser automation runs locally on your machine
- No data is sent to external servers
- Logs are stored locally only

## License

MIT License - feel free to modify and distribute.

## Support

If you encounter issues:
1. Check the logs in `8bp-claimer.log`
2. Verify your User ID is correct
3. Ensure the website hasn't changed its layout
4. Try running without headless mode for debugging

---

**Note**: This tool is for educational purposes. Please respect the website's terms of service and use responsibly.
