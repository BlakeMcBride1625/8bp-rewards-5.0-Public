const express = require('express');
const { logger } = require('./LoggerService');
const app = express();
const port = process.env.STATUS_PORT || 2750;

// Middleware
app.use(express.json());

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    services: {
      frontend: 'http://localhost:2500',
      backend: 'http://localhost:2600',
      discordBot: 'http://localhost:2700',
      statusServer: 'http://localhost:2750'
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
