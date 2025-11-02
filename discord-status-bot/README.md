# Discord Status Bot

A comprehensive Discord bot for monitoring website uptime, backend services, APIs, and claimer backends. This bot automatically posts daily status reports and real-time alerts when services go offline or come back online.

## Features

- **Automatic Service Discovery**: Automatically detects all `BOT2_*_URL` environment variables and treats them as endpoints to monitor
- **Daily Status Reports**: Posts comprehensive status embeds every 24 hours with service health, response times, and uptime statistics
- **Real-Time Alerts**: Immediately notifies when services go offline or come back online
- **Beautiful Embeds**: Dynamic colors and status indicators (🟢 Online, 🟡 Slow, 🔴 Offline)
- **Uptime Tracking**: Calculates uptime percentages and average response times for each service
- **Slash Commands**: Manual status checks, uptime statistics, and bot information
- **Graceful Error Handling**: Comprehensive error handling with retry logic and exponential backoff
- **Service Categorization**: Automatically groups services by type (Website, APIs, Backends, Claimers, etc.)

## Installation

1. **Install Dependencies**:
   ```bash
   cd discord-status-bot
   npm install
   ```

2. **Build the Project**:
   ```bash
   npm run build
   ```

3. **Configure Environment Variables**:
   Add the following variables to your parent directory's `.env` file:
   ```env
   # Bot Configuration
   BOT2_TOKEN=your-discord-bot-token
   BOT2_CLIENT_ID=your-discord-client-id
   BOT2_GUILD_ID=your-discord-server-id
   BOT2_STATUS_CHANNEL_ID=1430255977218969660
   
   # Monitoring Configuration
   BOT2_CHECK_INTERVAL=5                    # Check interval in minutes
   BOT2_DAILY_REPORT_INTERVAL=24           # Daily report interval in hours
   BOT2_NOTIFY_RESTORE=true                # Notify when services come back online
   BOT2_LOG_TO_FILE=false                  # Enable file logging
   
   # Services to Monitor (automatically detected)
   BOT2_WEBSITE_URL=https://yourwebsite.com
   BOT2_API_MAIN_URL=https://api.yourwebsite.com
   BOT2_API_AUTH_URL=https://api.yourwebsite.com/auth
   BOT2_BACKEND_URL=https://backend.yourwebsite.com
   BOT2_CLAIMER_1_URL=https://claimer1.yourwebsite.com
   BOT2_CLAIMER_2_URL=https://claimer2.yourwebsite.com
   BOT2_CLAIMER_3_URL=https://claimer3.yourwebsite.com
   BOT2_DATABASE_URL=https://backend.yourwebsite.com/db-health
   ```

## Usage

### Starting the Bot
```bash
npm start
```

### Development Mode
```bash
npm run dev
```

### Watch Mode (for development)
```bash
npm run watch
```

## Slash Commands

- `/status` - Check the current status of all monitored services
- `/uptime` - Display uptime statistics for all services
- `/botuptime` - Display bot uptime and system information
- `/dailyreport` - Manually trigger a daily status report (Admin only)

## Service Monitoring

The bot automatically monitors any environment variable ending with `_URL` and prefixed with `BOT2_`. Services are categorized as follows:

- **Website**: Variables containing "website" or "main"
- **APIs**: Variables containing "api"
- **Backends**: Variables containing "backend"
- **Claimers**: Variables containing "claimer"
- **Database**: Variables containing "database" or "db"
- **Misc**: All other services

### Service Status Levels

- 🟢 **Online**: Successful response with good performance (< 5s response time)
- 🟡 **Slow**: Successful response but high latency (> 5s) or client errors (4xx)
- 🔴 **Offline**: Failed requests, timeouts, or server errors (5xx)

## Daily Reports

Daily reports are automatically posted at midnight and include:

- Overall system status with dynamic colors
- Service status grouped by category
- Response times and uptime percentages
- Summary statistics
- Service restoration notifications (if enabled)

## Alerts

The bot sends real-time alerts for:

- **Service Down**: When a service goes offline
- **Service Restored**: When a service comes back online (configurable)
- **Multiple Services Down**: When 3+ services are offline simultaneously

## Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `BOT2_CHECK_INTERVAL` | Service check interval in minutes | 5 |
| `BOT2_DAILY_REPORT_INTERVAL` | Daily report interval in hours | 24 |
| `BOT2_NOTIFY_RESTORE` | Notify when services come back online | true |
| `BOT2_LOG_TO_FILE` | Enable file logging | false |

## Architecture

```
src/
├── index.ts              # Main Discord bot class
├── main.ts               # Application entry point
├── monitor/
│   ├── checkService.ts   # HTTP service monitoring
│   ├── buildEmbed.ts     # Discord embed builder
│   └── scheduler.ts      # Task scheduling
├── types/
│   └── service.ts        # TypeScript type definitions
└── utils/
    ├── logger.ts         # Logging utility
    └── env.ts           # Environment configuration
```

## Error Handling

The bot includes comprehensive error handling:

- **Retry Logic**: Exponential backoff for failed requests
- **Graceful Degradation**: Continues monitoring even if some services fail
- **Uncaught Exception Handling**: Proper cleanup on crashes
- **Signal Handling**: Graceful shutdown on SIGINT/SIGTERM

## Logging

The bot provides detailed logging with:

- Console output with color coding
- Optional file logging (daily log files)
- Service check results
- Alert notifications
- Error tracking

## Requirements

- Node.js 18+
- TypeScript 5.3+
- Discord.js v14
- Access to Discord server with appropriate permissions

## License

MIT License - see LICENSE file for details.
