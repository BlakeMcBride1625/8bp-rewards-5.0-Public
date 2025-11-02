import { logger } from './LoggerService';
import { Request } from 'express';

export interface DeviceInfo {
  deviceId: string;
  deviceType: string;
  platform: string;
  browser: string;
  userAgent: string;
}

export class DeviceDetectionService {
  private static instance: DeviceDetectionService;

  public static getInstance(): DeviceDetectionService {
    if (!DeviceDetectionService.instance) {
      DeviceDetectionService.instance = new DeviceDetectionService();
    }
    return DeviceDetectionService.instance;
  }

  /**
   * Extract device information from request headers and body
   */
  public extractDeviceInfo(req: Request): DeviceInfo {
    const userAgent = req.headers['user-agent'] || '';
    const deviceId = this.extractDeviceId(req);
    const deviceType = this.detectDeviceType(userAgent);
    const platform = this.detectPlatform(userAgent);
    const browser = this.detectBrowser(userAgent);

    logger.info('Device detection completed', {
      action: 'device_detection',
      deviceId: deviceId.substring(0, 8) + '...', // Log partial ID for privacy
      deviceType,
      platform,
      browser,
      userAgentLength: userAgent.length
    });

    return {
      deviceId,
      deviceType,
      platform,
      browser,
      userAgent
    };
  }

  /**
   * Extract device ID from various sources
   */
  private extractDeviceId(req: Request): string {
    // Priority order: custom header, fingerprint, Windows-specific headers, fallback to IP-based
    const customDeviceId = req.headers['x-device-id'] || req.body?.deviceId;
    if (customDeviceId && this.isValidDeviceId(customDeviceId)) {
      return customDeviceId;
    }

    // Try to extract from fingerprint data
    const fingerprint = req.body?.fingerprint || req.headers['x-fingerprint'];
    if (fingerprint) {
      return this.generateDeviceIdFromFingerprint(fingerprint);
    }

    // Windows-specific device identification
    const windowsDeviceId = this.extractWindowsDeviceId(req);
    if (windowsDeviceId) {
      return windowsDeviceId;
    }

    // Fallback to IP + User-Agent based ID
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    return this.generateFallbackDeviceId(ip, userAgent);
  }

  /**
   * Extract Windows-specific device identifiers
   */
  private extractWindowsDeviceId(req: Request): string | null {
    const userAgent = req.headers['user-agent'] || '';
    
    if (!userAgent.toLowerCase().includes('windows')) {
      return null;
    }

    // Try to extract Windows-specific identifiers
    const windowsHeaders = [
      req.headers['x-windows-device-id'],
      req.headers['x-device-uuid'],
      req.headers['x-hardware-id'],
      req.headers['x-machine-id']
    ].filter(Boolean);

    if (windowsHeaders.length > 0) {
      return this.hashString(windowsHeaders.join('|'));
    }

    // Extract from User-Agent for Windows devices
    const ua = userAgent.toLowerCase();
    const windowsIdentifiers: string[] = [];

    // Extract Windows version
    if (ua.includes('windows nt 10.0')) windowsIdentifiers.push('win10');
    else if (ua.includes('windows nt 6.3')) windowsIdentifiers.push('win8.1');
    else if (ua.includes('windows nt 6.2')) windowsIdentifiers.push('win8');
    else if (ua.includes('windows nt 6.1')) windowsIdentifiers.push('win7');

    // Extract architecture
    if (ua.includes('win64')) windowsIdentifiers.push('x64');
    else if (ua.includes('wow64')) windowsIdentifiers.push('wow64');
    else if (ua.includes('win32')) windowsIdentifiers.push('x86');

    // Extract browser engine
    if (ua.includes('edg/')) windowsIdentifiers.push('edge');
    else if (ua.includes('chrome/')) windowsIdentifiers.push('chrome');
    else if (ua.includes('firefox/')) windowsIdentifiers.push('firefox');

    // Extract Surface device info
    if (ua.includes('surface')) {
      if (ua.includes('surface laptop')) windowsIdentifiers.push('surface-laptop');
      else if (ua.includes('surface pro')) windowsIdentifiers.push('surface-pro');
      else if (ua.includes('surface book')) windowsIdentifiers.push('surface-book');
      else if (ua.includes('surface studio')) windowsIdentifiers.push('surface-studio');
      else if (ua.includes('surface go')) windowsIdentifiers.push('surface-go');
      else windowsIdentifiers.push('surface');
    }

    if (windowsIdentifiers.length > 0) {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      return this.hashString(windowsIdentifiers.join('|') + '|' + ip);
    }

    return null;
  }

  /**
   * Generate device ID from fingerprint data
   */
  private generateDeviceIdFromFingerprint(fingerprint: string | object): string {
    try {
      const fp = typeof fingerprint === 'string' ? JSON.parse(fingerprint) : fingerprint as Record<string, any>;
      
      // Extract key identifiers
      const identifiers = [
        fp.screen?.width + 'x' + fp.screen?.height,
        fp.timezone,
        fp.language,
        fp.platform,
        fp.cpuClass,
        fp.hardwareConcurrency,
        fp.deviceMemory,
        fp.webglVendor,
        fp.webglRenderer
      ].filter(Boolean);

      // Create hash from identifiers
      const combined = identifiers.join('|');
      return this.hashString(combined);
    } catch (error) {
      logger.warn('Failed to parse fingerprint data', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return this.generateFallbackDeviceId('unknown', 'unknown');
    }
  }

  /**
   * Generate fallback device ID from IP and User-Agent
   */
  private generateFallbackDeviceId(ip: string, userAgent: string): string {
    const combined = `${ip}|${userAgent}`;
    return this.hashString(combined);
  }

  /**
   * Detect device type from user agent
   */
  private detectDeviceType(userAgent: string): string {
    const ua = userAgent.toLowerCase();

    // Mobile devices
    if (ua.includes('iphone')) {
      const model = this.detectiPhoneModel(userAgent);
      return model || 'iPhone';
    }
    
    if (ua.includes('ipad')) {
      const model = this.detectiPadModel(userAgent);
      return model || 'iPad';
    }
    
    if (ua.includes('android')) {
      const model = this.detectAndroidModel(userAgent);
      return model || 'Android Device';
    }

    // Desktop devices
    if (ua.includes('macintosh') || ua.includes('mac os')) {
      const model = this.detectMacModel(userAgent);
      return model || 'Mac';
    }
    
    if (ua.includes('windows')) {
      const model = this.detectWindowsModel(userAgent);
      return model || 'Windows PC';
    }
    
    if (ua.includes('linux')) {
      return 'Linux PC';
    }

    return 'Unknown Device';
  }

  /**
   * Detect iPhone model
   */
  private detectiPhoneModel(userAgent: string): string | null {
    const ua = userAgent.toLowerCase();
    
    // iPhone 16 series
    if (ua.includes('iphone16,4')) return 'iPhone 16 Pro Max';
    if (ua.includes('iphone16,3')) return 'iPhone 16 Pro';
    if (ua.includes('iphone16,2')) return 'iPhone 16 Plus';
    if (ua.includes('iphone16,1')) return 'iPhone 16';
    
    // iPhone 15 series
    if (ua.includes('iphone15,4')) return 'iPhone 15 Pro Max';
    if (ua.includes('iphone15,3')) return 'iPhone 15 Pro';
    if (ua.includes('iphone15,2')) return 'iPhone 15 Plus';
    if (ua.includes('iphone15,1')) return 'iPhone 15';
    
    // iPhone 14 series
    if (ua.includes('iphone14,7')) return 'iPhone 14 Pro Max';
    if (ua.includes('iphone14,6')) return 'iPhone 14 Pro';
    if (ua.includes('iphone14,5')) return 'iPhone 14 Plus';
    if (ua.includes('iphone14,4')) return 'iPhone 14';
    
    // iPhone 13 series
    if (ua.includes('iphone13,4')) return 'iPhone 13 Pro Max';
    if (ua.includes('iphone13,3')) return 'iPhone 13 Pro';
    if (ua.includes('iphone13,2')) return 'iPhone 13';
    if (ua.includes('iphone13,1')) return 'iPhone 13 mini';
    
    // Older models
    if (ua.includes('iphone12,8')) return 'iPhone SE (2nd gen)';
    if (ua.includes('iphone12,5')) return 'iPhone 11 Pro Max';
    if (ua.includes('iphone12,3')) return 'iPhone 11 Pro';
    if (ua.includes('iphone12,1')) return 'iPhone 11';
    
    return null;
  }

  /**
   * Detect iPad model
   */
  private detectiPadModel(userAgent: string): string | null {
    const ua = userAgent.toLowerCase();
    
    if (ua.includes('ipad13,18') || ua.includes('ipad13,19')) return 'iPad Pro 12.9" (6th gen)';
    if (ua.includes('ipad13,16') || ua.includes('ipad13,17')) return 'iPad Pro 11" (4th gen)';
    if (ua.includes('ipad14,2')) return 'iPad Air (5th gen)';
    if (ua.includes('ipad13,1') || ua.includes('ipad13,2')) return 'iPad Air (4th gen)';
    if (ua.includes('ipad11,6') || ua.includes('ipad11,7')) return 'iPad (9th gen)';
    if (ua.includes('ipad12,1') || ua.includes('ipad12,2')) return 'iPad (10th gen)';
    
    return null;
  }

  /**
   * Detect Android model
   */
  private detectAndroidModel(userAgent: string): string | null {
    const ua = userAgent.toLowerCase();
    
    // Samsung Galaxy
    if (ua.includes('sm-s918')) return 'Galaxy S23 Ultra';
    if (ua.includes('sm-s911')) return 'Galaxy S23';
    if (ua.includes('sm-s901')) return 'Galaxy S22';
    if (ua.includes('sm-g998')) return 'Galaxy S21 Ultra';
    if (ua.includes('sm-g991')) return 'Galaxy S21';
    if (ua.includes('sm-g975')) return 'Galaxy S10+';
    if (ua.includes('sm-g973')) return 'Galaxy S10';
    
    // Google Pixel
    if (ua.includes('pixel 8 pro')) return 'Pixel 8 Pro';
    if (ua.includes('pixel 8')) return 'Pixel 8';
    if (ua.includes('pixel 7 pro')) return 'Pixel 7 Pro';
    if (ua.includes('pixel 7')) return 'Pixel 7';
    if (ua.includes('pixel 6 pro')) return 'Pixel 6 Pro';
    if (ua.includes('pixel 6')) return 'Pixel 6';
    
    // OnePlus
    if (ua.includes('oneplus 11')) return 'OnePlus 11';
    if (ua.includes('oneplus 10 pro')) return 'OnePlus 10 Pro';
    if (ua.includes('oneplus 9 pro')) return 'OnePlus 9 Pro';
    
    return null;
  }

  /**
   * Detect Mac model
   */
  private detectMacModel(userAgent: string): string | null {
    const ua = userAgent.toLowerCase();
    
    if (ua.includes('macbookpro')) {
      if (ua.includes('macos 14')) return 'MacBook Pro (M3)';
      if (ua.includes('macos 13')) return 'MacBook Pro (M2)';
      if (ua.includes('macos 12')) return 'MacBook Pro (M1)';
      return 'MacBook Pro';
    }
    
    if (ua.includes('macbookair')) {
      if (ua.includes('macos 14')) return 'MacBook Air (M3)';
      if (ua.includes('macos 13')) return 'MacBook Air (M2)';
      if (ua.includes('macos 12')) return 'MacBook Air (M1)';
      return 'MacBook Air';
    }
    
    if (ua.includes('imac')) return 'iMac';
    if (ua.includes('mac mini')) return 'Mac Mini';
    if (ua.includes('mac studio')) return 'Mac Studio';
    if (ua.includes('mac pro')) return 'Mac Pro';
    
    return null;
  }

  /**
   * Detect Windows model
   */
  private detectWindowsModel(userAgent: string): string | null {
    const ua = userAgent.toLowerCase();
    
    // Microsoft Surface devices (check for Surface in user agent)
    if (ua.includes('surface')) {
      if (ua.includes('surface laptop 5')) return 'Surface Laptop 5';
      if (ua.includes('surface laptop 4')) return 'Surface Laptop 4';
      if (ua.includes('surface laptop 3')) return 'Surface Laptop 3';
      if (ua.includes('surface laptop go')) return 'Surface Laptop Go';
      if (ua.includes('surface laptop')) return 'Surface Laptop';
      
      if (ua.includes('surface pro 9')) return 'Surface Pro 9';
      if (ua.includes('surface pro 8')) return 'Surface Pro 8';
      if (ua.includes('surface pro 7+')) return 'Surface Pro 7+';
      if (ua.includes('surface pro 7')) return 'Surface Pro 7';
      if (ua.includes('surface pro x')) return 'Surface Pro X';
      if (ua.includes('surface pro')) return 'Surface Pro';
      
      if (ua.includes('surface studio 2+')) return 'Surface Studio 2+';
      if (ua.includes('surface studio 2')) return 'Surface Studio 2';
      if (ua.includes('surface studio')) return 'Surface Studio';
      
      if (ua.includes('surface book 3')) return 'Surface Book 3';
      if (ua.includes('surface book 2')) return 'Surface Book 2';
      if (ua.includes('surface book')) return 'Surface Book';
      
      if (ua.includes('surface go')) return 'Surface Go';
      if (ua.includes('surface duo')) return 'Surface Duo';
      
      return 'Surface Device';
    }
    
    // Windows version detection
    if (ua.includes('windows nt 10.0')) {
      // Try to detect Windows 11 vs Windows 10
      if (ua.includes('windows nt 10.0; win64; x64')) {
        // Additional checks for Windows 11
        if (ua.includes('edg/')) return 'Windows 11 (Edge)';
        if (ua.includes('chrome/')) return 'Windows 11 (Chrome)';
        if (ua.includes('firefox/')) return 'Windows 11 (Firefox)';
        return 'Windows 11/10';
      }
      return 'Windows 11/10';
    }
    
    if (ua.includes('windows nt 6.3')) return 'Windows 8.1';
    if (ua.includes('windows nt 6.2')) return 'Windows 8';
    if (ua.includes('windows nt 6.1')) return 'Windows 7';
    if (ua.includes('windows nt 6.0')) return 'Windows Vista';
    if (ua.includes('windows nt 5.1')) return 'Windows XP';
    if (ua.includes('windows nt 5.0')) return 'Windows 2000';
    
    // Generic Windows detection
    if (ua.includes('windows')) return 'Windows PC';
    
    return null;
  }

  /**
   * Detect platform
   */
  private detectPlatform(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    
    if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('macintosh') || ua.includes('mac os')) return 'macOS';
    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('linux')) return 'Linux';
    
    return 'Unknown';
  }

  /**
   * Detect browser
   */
  private detectBrowser(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    
    if (ua.includes('chrome') && !ua.includes('edg')) return 'Chrome';
    if (ua.includes('firefox')) return 'Firefox';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
    if (ua.includes('edg')) return 'Edge';
    if (ua.includes('opera')) return 'Opera';
    if (ua.includes('brave')) return 'Brave';
    
    return 'Unknown';
  }

  /**
   * Validate device ID format
   */
  private isValidDeviceId(deviceId: string): boolean {
    // Device IDs should be alphanumeric and reasonable length
    return /^[a-zA-Z0-9_-]{8,64}$/.test(deviceId);
  }

  /**
   * Simple hash function for generating device IDs
   */
  private hashString(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36) + str.length.toString(36);
  }

  /**
   * Check if device is blocked
   */
  public async isDeviceBlocked(deviceInfo: DeviceInfo, ip: string): Promise<boolean> {
    // This will be implemented with the database service
    // For now, return false
    return false;
  }
}
