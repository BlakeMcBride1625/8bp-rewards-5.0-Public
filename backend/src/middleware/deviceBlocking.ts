import { Request, Response, NextFunction } from 'express';
import { DeviceDetectionService } from '../services/DeviceDetectionService';
import { BlockingService } from '../services/BlockingService';
import { logger } from '../services/LoggerService';

export interface DeviceBlockedRequest extends Request {
  deviceInfo?: any;
  isDeviceBlocked?: boolean;
  blockedDevice?: any;
}

/**
 * Middleware to check if the requesting device is blocked
 * This should be applied to all public routes
 */
export const checkDeviceBlocking = async (req: DeviceBlockedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const deviceDetectionService = DeviceDetectionService.getInstance();
    const blockingService = BlockingService.getInstance();
    
    // Extract device information
    const deviceInfo = deviceDetectionService.extractDeviceInfo(req);
    req.deviceInfo = deviceInfo;
    
    // Get client IP
    const clientIP = req.ip || 
                     req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
                     req.headers['x-real-ip']?.toString() ||
                     req.headers['cf-connecting-ip']?.toString() ||
                     req.connection?.remoteAddress ||
                     req.socket?.remoteAddress ||
                     'unknown';
    
    // Check if device is blocked
    const blockedDevice = await blockingService.isBlocked(deviceInfo, clientIP);
    
    if (blockedDevice) {
      req.isDeviceBlocked = true;
      req.blockedDevice = blockedDevice;
      
      logger.warn('Blocked device attempted access', {
        action: 'blocked_device_access_attempt',
        ip: clientIP,
        deviceId: deviceInfo.deviceId.substring(0, 8) + '...',
        deviceType: deviceInfo.deviceType,
        userAgent: deviceInfo.userAgent,
        blockedAt: blockedDevice.blockedAt,
        reason: blockedDevice.reason,
        eightBallPoolId: blockedDevice.eightBallPoolId,
        username: blockedDevice.username,
        url: req.url,
        method: req.method
      });
      
      res.status(403).json({
        error: 'Access denied',
        message: 'Your device has been blocked from accessing this service',
        reason: blockedDevice.reason,
        blockedAt: blockedDevice.blockedAt,
        contactSupport: true
      });
      return;
    }
    
    req.isDeviceBlocked = false;
    next();
    
  } catch (error) {
    logger.error('Device blocking check failed', {
      action: 'device_blocking_check_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip,
      url: req.url,
      method: req.method
    });
    
    // If device blocking check fails, allow the request to proceed
    // This ensures the service remains available even if blocking service is down
    req.isDeviceBlocked = false;
    next();
  }
};

/**
 * Middleware to log device information for analytics
 * This should be applied to routes where you want to track device usage
 */
export const logDeviceInfo = async (req: DeviceBlockedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.deviceInfo) {
      logger.info('Device access logged', {
        action: 'device_access_log',
        ip: req.ip,
        deviceId: req.deviceInfo.deviceId.substring(0, 8) + '...',
        deviceType: req.deviceInfo.deviceType,
        platform: req.deviceInfo.platform,
        browser: req.deviceInfo.browser,
        url: req.url,
        method: req.method,
        userAgent: req.deviceInfo.userAgent.substring(0, 100) + '...' // Truncate for privacy
      });
    }
    
    next();
  } catch (error) {
    logger.error('Device info logging failed', {
      action: 'device_info_logging_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    next();
  }
};

/**
 * Middleware to update last login time for registered users
 * This should be applied to login/authentication routes
 */
export const updateLastLogin = async (req: DeviceBlockedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    // This will be implemented when we have user authentication
    // For now, we'll just pass through
    next();
  } catch (error) {
    logger.error('Last login update failed', {
      action: 'last_login_update_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    next();
  }
};
