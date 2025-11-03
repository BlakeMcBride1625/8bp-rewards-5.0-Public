const express = require('express');
const cors = require('cors');
const DiscordService = require('./discord-service');

// Initialize heartbeat for service tracking
let heartbeatInitialized = false;
try {
  const path = require('path');
  const heartbeatPath = path.join(__dirname, '../backend/src/utils/heartbeat-client.ts');
  const heartbeatJsPath = path.join(__dirname, '../backend/dist/backend/src/utils/heartbeat-client.js');
  // Try to require compiled JS version first
  if (require('fs').existsSync(heartbeatJsPath)) {
    const { initModuleHeartbeat } = require(heartbeatJsPath);
    initModuleHeartbeat(module, { service: 'discord-api' });
    heartbeatInitialized = true;
    console.log('✅ Heartbeat initialized for discord-api service');
  } else {
    // Fallback: manual heartbeat via HTTP request
    const heartbeatUrl = process.env.HEARTBEAT_URL || `${process.env.PUBLIC_URL || 'http://localhost:2600'}/8bp-rewards/api/heartbeat/beat`;
    const axios = require('axios');
    const intervalMs = Math.max(5000, parseInt(process.env.HEARTBEAT_INTERVAL_MS || '5000', 10));
    
    const sendHeartbeat = () => {
      axios.post(heartbeatUrl, {
        moduleId: module.id || __filename,
        filePath: __filename,
        processId: process.pid,
        service: 'discord-api'
      }, { timeout: 2000 }).catch(() => {});
    };
    
    sendHeartbeat();
    setInterval(sendHeartbeat, intervalMs);
    heartbeatInitialized = true;
    console.log('✅ Heartbeat initialized for discord-api service (HTTP fallback)');
  }
} catch (error) {
  console.log('⚠️ Could not initialize heartbeat:', error.message);
}

class DiscordApiServer {
  constructor() {
    this.app = express();
    this.port = process.env.DISCORD_API_PORT || 2700;
    this.discordService = new DiscordService();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    
    // Basic logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
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

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found'
      });
    });
  }

  async start() {
    try {
      // Start Discord bot first
      console.log('🚀 Starting Discord bot...');
      const discordStarted = await this.discordService.login();
      
      if (!discordStarted) {
        console.log('⚠️ Discord bot failed to start, but API server will continue');
      }

      // Start HTTP server
      this.app.listen(this.port, () => {
        console.log(`🌐 Discord API server running on port ${this.port}`);
        console.log(`📡 Available endpoints:`);
        console.log(`   GET  /health - Health check`);
        console.log(`   GET  /api/bot-status - Get bot status`);
        console.log(`   POST /api/bot-status - Change bot status`);
      });

    } catch (error) {
      console.error('❌ Failed to start Discord API server:', error);
      process.exit(1);
    }
  }

  async stop() {
    console.log('🛑 Stopping Discord API server...');
    await this.discordService.logout();
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  if (global.discordApiServer) {
    await global.discordApiServer.stop();
  }
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  if (global.discordApiServer) {
    await global.discordApiServer.stop();
  }
});

// Start the server
const server = new DiscordApiServer();
global.discordApiServer = server;
server.start().catch(console.error);

module.exports = DiscordApiServer;
