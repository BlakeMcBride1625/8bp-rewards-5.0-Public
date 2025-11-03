import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from './LoggerService';
import { Request } from 'express';
import session from 'express-session';

interface PassportUser {
  id: string;
  username?: string;
  discriminator?: string;
  avatar?: string;
}

export interface SocketWithSession extends Socket {
  request: Request & {
    session?: session.Session & {
      passport?: {
        user?: PassportUser;
      };
    };
  };
  userId?: string;
  isAdmin?: boolean;
}

export interface ClaimProgressEvent {
  processId: string;
  status: 'starting' | 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  currentUser: string | null;
  totalUsers: number;
  completedUsers: number;
  failedUsers: number;
  userProgress: Array<{
    userId: string;
    status: string;
    steps: Array<{ step: string; timestamp: Date }>;
  }>;
  logs: Array<{
    level: string;
    message: string;
    timestamp: string;
  }>;
  exitCode?: number;
}

// VPSStatsEvent matches the actual structure from vps-monitor.ts
export interface VPSStatsEvent {
  timestamp: string;
  system: {
    hostname: string;
    uptime?: number;
    platform: string;
    arch: string;
    nodeVersion?: string;
    release?: string;
  };
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
    model?: string;
    temperature?: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    available?: number;
    usagePercent?: number;
    percentage?: number;
    swap?: {
      total: number;
      free: number;
      used: number;
    };
  };
  disk: {
    total: number;
    free: number;
    used: number;
    usagePercent?: number;
    percentage?: number;
    inodes?: {
      total: number;
      free: number;
      used: number;
    };
  };
  network: {
    interfaces?: Array<{
      name: string;
      bytesReceived: number;
      bytesSent: number;
      packetsReceived?: number;
      packetsSent?: number;
    }>;
    connections?: number;
    [key: string]: any; // Allow additional network properties
  };
  processes: {
    total: number;
    running: number;
    sleeping?: number;
    stopped?: number;
    zombie: number;
  };
  services: Array<{
    name: string;
    status: string;
    uptime?: string | number;
    memory?: string;
    cpu?: string;
  }>;
  ping: {
    google?: number;
    cloudflare?: number;
    localhost?: number;
    latency?: number;
    status?: string;
    [key: string]: any; // Allow additional ping properties
  };
  uptime: string;
}

class WebSocketService {
  private io: SocketIOServer | null = null;
  private httpServer: HTTPServer | null = null;
  private static instance: WebSocketService;

  private constructor() {}

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public initialize(httpServer: HTTPServer): void {
    this.httpServer = httpServer;
    
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: (origin, callback) => {
          const frontendPort = process.env.FRONTEND_PORT || '2500';
          const allowedOrigins = [
            `http://localhost:${frontendPort}`,
            'https://8ballpool.website',
            process.env.PUBLIC_URL
          ].filter(Boolean);
          
          // Allow requests with no origin (like mobile apps)
          if (!origin) return callback(null, true);
          
          const isAllowed = allowedOrigins.some(allowed => 
            origin.startsWith(allowed as string)
          );
          
          if (isAllowed) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        },
        credentials: true,
        methods: ['GET', 'POST']
      },
      transports: ['websocket', 'polling'], // Allow both for fallback
      allowEIO3: true,
      path: '/8bp-rewards/socket.io' // Match the base path
    });

    // Authentication middleware
    this.io.use((socket: Socket, next) => {
      const socketWithSession = socket as SocketWithSession;
      const req = socketWithSession.request as Request & {
        session?: session.Session & {
          passport?: {
            user?: PassportUser;
          };
        };
      };
      
      // Check if user has a session (basic check)
      // Full authentication will be done per-room/event if needed
      if (req.session?.passport?.user) {
        // User is authenticated
        socketWithSession.userId = req.session.passport.user.id;
        socketWithSession.isAdmin = true;
        return next();
      }
      
      // Allow unauthenticated connections for public events
      // Admin-only events should check auth in handlers
      return next();
    });

    this.io.on('connection', (socket: Socket) => {
      const socketWithSession = socket as SocketWithSession;
      const req = socket.request as Request;
      const userId = socketWithSession.userId || 'anonymous';
      
      logger.info('WebSocket client connected', {
        action: 'websocket_connect',
        socketId: socket.id,
        userId: userId
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.info('WebSocket client disconnected', {
          action: 'websocket_disconnect',
          socketId: socket.id,
          userId: userId,
          reason: reason
        });
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error('WebSocket error', {
          action: 'websocket_error',
          socketId: socket.id,
          userId: userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });

      // Join process-specific room for claim progress
      socket.on('join-claim-progress', (processId: string) => {
        if (processId) {
          socket.join(`claim-progress-${processId}`);
          logger.info('Client joined claim progress room', {
            action: 'websocket_join_room',
            socketId: socket.id,
            userId: userId,
            room: `claim-progress-${processId}`
          });
        }
      });

      // Leave process-specific room
      socket.on('leave-claim-progress', (processId: string) => {
        if (processId) {
          socket.leave(`claim-progress-${processId}`);
          logger.info('Client left claim progress room', {
            action: 'websocket_leave_room',
            socketId: socket.id,
            userId: userId,
            room: `claim-progress-${processId}`
          });
        }
      });

      // Join VPS stats room
      socket.on('join-vps-stats', () => {
        socket.join('vps-stats');
        logger.info('Client joined VPS stats room', {
          action: 'websocket_join_room',
          socketId: socket.id,
          userId: userId,
          room: 'vps-stats'
        });
      });

      // Leave VPS stats room
      socket.on('leave-vps-stats', () => {
        socket.leave('vps-stats');
        logger.info('Client left VPS stats room', {
          action: 'websocket_leave_room',
          socketId: socket.id,
          userId: userId,
          room: 'vps-stats'
        });
      });
    });

    logger.info('WebSocket service initialized');
  }

  public emitClaimProgress(processId: string, progress: ClaimProgressEvent): void {
    if (!this.io) {
      logger.warn('WebSocket server not initialized, cannot emit claim progress');
      return;
    }

    this.io.to(`claim-progress-${processId}`).emit('claim-progress', progress);
    
    logger.debug('Emitted claim progress event', {
      action: 'websocket_emit_claim_progress',
      processId: processId,
      status: progress.status
    });
  }

  public emitVPSStats(stats: VPSStatsEvent): void {
    if (!this.io) {
      logger.warn('WebSocket server not initialized, cannot emit VPS stats');
      return;
    }

    this.io.to('vps-stats').emit('vps-stats', stats);
    
    logger.debug('Emitted VPS stats event', {
      action: 'websocket_emit_vps_stats',
      timestamp: stats.timestamp
    });
  }

  public getIO(): SocketIOServer | null {
    return this.io;
  }

  public isInitialized(): boolean {
    return this.io !== null;
  }
}

export default WebSocketService.getInstance();

