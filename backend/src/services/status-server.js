const express = require('express');
const { logger } = require('./LoggerService');
const app = express();
const port = process.env.STATUS_PORT || 2750;

// Middleware
app.use(express.json());

// Status endpoint
app.get('/status', (req, res) => {
  const frontendPort = process.env.FRONTEND_PORT || '2500';
  const backendPort = process.env.BACKEND_PORT || '2600';
  const discordPort = process.env.DISCORD_API_PORT || '2700';
  const statusPort = process.env.STATUS_PORT || '2750';
  
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    services: {
      frontend: `http://localhost:${frontendPort}`,
      backend: `http://localhost:${backendPort}`,
      discordBot: `http://localhost:${discordPort}`,
      statusServer: `http://localhost:${statusPort}`
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
app.listen(port, () => {
  logger.info(`Status server running on port ${port}`);
  logger.info('Available endpoints:', {
    endpoints: [
      'GET /status - System status',
      'GET /health - Health check'
    ]
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down status server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down status server...');
  process.exit(0);
});
