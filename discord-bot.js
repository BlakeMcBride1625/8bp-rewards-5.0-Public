const DiscordService = require('./services/discord-service');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

class DiscordBot {
  constructor() {
    this.discordService = new DiscordService();
    this.app = express();
    this.port = process.env.DISCORD_API_PORT || 2700;
    
    this.setupApiServer();
  }

  setupApiServer() {
    this.app.use(cors());
    this.app.use(express.json());
    
    // Basic logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        discordReady: this.discordService.isReady
      });
    });

    // Get bot status
    this.app.get('/api/bot-status', async (req, res) => {
      try {
        const status = await this.discordService.getBotStatus();
        res.json(status);
      } catch (error) {
        console.error('Error getting bot status:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Change bot status
    this.app.post('/api/bot-status', async (req, res) => {
      try {
        const { status } = req.body;
        
        if (!status) {
          return res.status(400).json({
            success: false,
            error: 'Status is required'
          });
        }

        const result = await this.discordService.changeBotStatus(status);
        
        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        console.error('Error changing bot status:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Bot toggle endpoint (enable/disable)
    this.app.post('/api/bot-toggle', async (req, res) => {
      try {
        const { enabled } = req.body;
        
        if (typeof enabled !== 'boolean') {
          return res.status(400).json({
            success: false,
            error: 'enabled field must be a boolean'
          });
        }

        const result = await this.discordService.toggleBot(enabled);
        
        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        console.error('Error toggling bot:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found'
      });
    });
  }

  async start() {
    console.log('🚀 Starting Discord Bot...');
    
    // Always start the HTTP API server first
    this.app.listen(this.port, () => {
      console.log(`🌐 Discord API server running on port ${this.port}`);
      console.log(`📡 Available endpoints:`);
      console.log(`   GET  /health - Health check`);
      console.log(`   GET  /api/bot-status - Get bot status`);
      console.log(`   POST /api/bot-status - Change bot status`);
    });
    
    try {
      const success = await this.discordService.login();
      
      if (success) {
        console.log('✅ Discord Bot is now running!');
        console.log('💡 Use slash commands in your Discord server');
        console.log('📋 Available commands:');
        console.log('   /register - Register an 8BP account');
        console.log('   /list-accounts - List all registered accounts');
        console.log('   /check-accounts - Check account status');
        console.log('   /deregister - Remove a registration');
        console.log('   /clear - Delete bot messages');
        console.log('   /help - Show help information');
        console.log('   /md - Show documentation');
        console.log('   /server-status - Check bot server status');
        console.log('   /website-status - Check website status');
        console.log('   /ping-discord - Test Discord connectivity');
        console.log('   /ping-website - Test website connectivity');
        
        // Keep the bot running
        process.on('SIGINT', async () => {
          console.log('\n🛑 Shutting down Discord Bot...');
          await this.discordService.logout();
          process.exit(0);
        });
        
        // Keep process alive
        setInterval(() => {}, 1000);
        
      } else {
        console.log('⚠️ Discord Bot login failed, but API server is running');
        console.log('🔄 Bot will retry login automatically');
        
        // Keep process alive and retry periodically
        setInterval(async () => {
          try {
            const retrySuccess = await this.discordService.login();
            if (retrySuccess) {
              console.log('✅ Discord Bot reconnected successfully!');
            }
          } catch (retryError) {
            console.log('🔄 Discord login retry failed, will try again later');
          }
        }, 60000); // Retry every minute
      }
    } catch (error) {
      console.error('❌ Error starting Discord Bot:', error);
      console.log('⚠️ API server is still running for status checks');
      
      // Keep process alive and retry periodically
      setInterval(async () => {
        try {
          const retrySuccess = await this.discordService.login();
          if (retrySuccess) {
            console.log('✅ Discord Bot reconnected successfully!');
          }
        } catch (retryError) {
          console.log('🔄 Discord login retry failed, will try again later');
        }
      }, 60000); // Retry every minute
    }
  }
}

// Start the bot if this file is run directly
if (require.main === module) {
  const bot = new DiscordBot();
  bot.start();
}

module.exports = DiscordBot;
