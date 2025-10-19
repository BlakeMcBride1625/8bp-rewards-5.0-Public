import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import passport from 'passport';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

// Import services
import { logger } from './services/LoggerService';
import { DatabaseService } from './services/DatabaseService';
import SchedulerService from './services/SchedulerService';

// Import routes
import authRoutes from './routes/auth';
import registrationRoutes from './routes/registration';
import adminRoutes from './routes/admin';
import contactRoutes from './routes/contact';
import statusRoutes from './routes/status';
import leaderboardRoutes from './routes/leaderboard';
import vpsMonitorRoutes from './routes/vps-monitor';
import screenshotsRoutes from './routes/screenshots';
import adminTerminalRoutes from './routes/admin-terminal';
import tiktokProfilesRoutes from './routes/tiktok-profiles';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

class Server {
  private app: express.Application;
  private port: number;
  private databaseService: DatabaseService;
  private schedulerService: SchedulerService | null = null;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.BACKEND_PORT || '2600', 10);
    this.databaseService = new DatabaseService();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Trust proxy (needed for Cloudflare tunnel)
    this.app.set('trust proxy', 1);
    
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'", "https://8bp.epildevconnect.uk"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://8bp.epildevconnect.uk"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "https://8bp.epildevconnect.uk"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://8bp.epildevconnect.uk"],
          imgSrc: ["'self'", "data:", "https:", "https://8bp.epildevconnect.uk"],
          connectSrc: ["'self'", "https://8bp.epildevconnect.uk", "https://*.8bp.epildevconnect.uk", "wss://8bp.epildevconnect.uk", "https://api.ipify.org"]
        }
      }
    }));

    // CORS configuration
    const allowedOrigins = [
      'http://localhost:2500',
      'http://localhost:3000',
      'https://8bp.epildevconnect.uk',
      process.env.PUBLIC_URL
    ].filter(Boolean);

    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.some(allowed => origin.startsWith(allowed as string))) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Compression
    this.app.use(compression());

    // Request logging
    this.app.use(morgan('combined', {
      stream: {
        write: (message: string) => logger.info(message.trim())
      }
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // limit each IP to 1000 requests per windowMs (increased for admin operations)
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limiting for admin routes
        return req.path.startsWith('/api/admin/');
      }
    });
    this.app.use('/api/', limiter);

    // Disable ETags globally to prevent caching issues
    this.app.set('etag', false);
    
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Session configuration
    this.app.use(session({
      secret: process.env.SESSION_SECRET || 'your-secret-key',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/'
      }
    }));

    // Passport initialization
    this.app.use(passport.initialize());
    this.app.use(passport.session());

    // Custom request logger middleware
    this.app.use(requestLogger);
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // API routes (both at /api and /8bp-rewards/api for compatibility)
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/registration', registrationRoutes);
    this.app.use('/api/admin', adminRoutes);
    this.app.use('/api/contact', contactRoutes);
    this.app.use('/api/status', statusRoutes);
    this.app.use('/api/leaderboard', leaderboardRoutes);
    this.app.use('/api/vps-monitor', vpsMonitorRoutes);
    this.app.use('/api/admin/screenshots', screenshotsRoutes);
    this.app.use('/api/admin/terminal', adminTerminalRoutes);
    this.app.use('/api/tiktok-profiles', tiktokProfilesRoutes);
    
    // Also register API routes under /8bp-rewards prefix for frontend
    this.app.use('/8bp-rewards/api/auth', authRoutes);
    this.app.use('/8bp-rewards/api/registration', registrationRoutes);
    this.app.use('/8bp-rewards/api/admin', adminRoutes);
    this.app.use('/8bp-rewards/api/contact', contactRoutes);
    this.app.use('/8bp-rewards/api/status', statusRoutes);
    this.app.use('/8bp-rewards/api/leaderboard', leaderboardRoutes);
    this.app.use('/8bp-rewards/api/vps-monitor', vpsMonitorRoutes);
    this.app.use('/8bp-rewards/api/admin/screenshots', screenshotsRoutes);
    this.app.use('/8bp-rewards/api/admin/terminal', adminTerminalRoutes);
    this.app.use('/8bp-rewards/api/tiktok-profiles', tiktokProfilesRoutes);

    // Serve static files from React build
    if (process.env.NODE_ENV === 'production') {
      this.app.use('/8bp-rewards', express.static(path.join(__dirname, '../../frontend/build')));
      
      // Handle React routing, return all requests to React app
      this.app.get('/8bp-rewards/*', (req, res) => {
        res.sendFile(path.join(__dirname, '../../frontend/build/index.html'));
      });
      
      // Redirect root to /8bp-rewards
      this.app.get('/', (req, res) => {
        res.redirect('/8bp-rewards/home');
      });
      
      // Redirect any other GET requests (not API) to /8bp-rewards
      this.app.get('*', (req, res, next) => {
        // Don't redirect API calls
        if (req.path.startsWith('/api/')) {
          return next();
        }
        // Redirect to the same path under /8bp-rewards
        res.redirect('/8bp-rewards' + req.path);
      });
    }
  }

  private setupErrorHandling(): void {
    // 404 handler for API routes only
    this.app.use('/api/*', (req, res) => {
      res.status(404).json({
        error: 'API route not found',
        path: req.originalUrl,
        method: req.method
      });
    });
    
    // Final 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method
      });
    });

    // Global error handler
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Connect to database
      logger.info('Connecting to MongoDB...');
      const dbConnected = await this.databaseService.connect();
      
      if (!dbConnected) {
        throw new Error('Failed to connect to database');
      }

      // Start server
      this.app.listen(this.port, () => {
        logger.info(`🚀 Backend server running on port ${this.port}`);
        logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`🔗 Public URL: ${process.env.PUBLIC_URL || 'http://localhost:2500'}`);
      });

      // Initialize scheduler service
      this.schedulerService = new SchedulerService();
      logger.info('⏰ Scheduler service initialized');
      logger.info('📅 Next scheduled run: ' + (this.schedulerService.getStatus().nextRun || 'Not scheduled'));

      // Graceful shutdown
      process.on('SIGTERM', this.shutdown.bind(this));
      process.on('SIGINT', this.shutdown.bind(this));

    } catch (error) {
      logger.error('Failed to start server', { error: error instanceof Error ? error.message : 'Unknown error' });
      process.exit(1);
    }
  }

  private async shutdown(): Promise<void> {
    logger.info('🛑 Shutting down server...');
    
    try {
      await this.databaseService.disconnect();
      logger.info('✅ Server shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error: error instanceof Error ? error.message : 'Unknown error' });
      process.exit(1);
    }
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new Server();
  server.start();
}

export default Server;



