export interface DeviceInfo {
  type: 'mobile' | 'tablet' | 'desktop';
  os: string;
  browser: string;
  screenResolution: string;
  userAgent: string;
  platform: string;
  language: string;
  timezone: string;
}

/**
 * Detects device information from the browser
 */
export function detectDevice(): DeviceInfo {
  const userAgent = navigator.userAgent;
  const platform = navigator.platform;
  const language = navigator.language;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Detect device type
  let deviceType: 'mobile' | 'tablet' | 'desktop' = 'desktop';
  if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
    deviceType = 'tablet';
  } else if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) {
    deviceType = 'mobile';
  }

  // Detect OS
  let os = 'Unknown';
  if (userAgent.indexOf('Win') !== -1) os = 'Windows';
  else if (userAgent.indexOf('Mac') !== -1) os = 'macOS';
  else if (userAgent.indexOf('X11') !== -1) os = 'UNIX';
  else if (userAgent.indexOf('Linux') !== -1) os = 'Linux';
  else if (userAgent.indexOf('Android') !== -1) os = 'Android';
  else if (userAgent.indexOf('iPhone') !== -1 || userAgent.indexOf('iPad') !== -1) os = 'iOS';

  // Detect Browser
  let browser = 'Unknown';
  if (userAgent.indexOf('Firefox') !== -1) browser = 'Firefox';
  else if (userAgent.indexOf('Chrome') !== -1 && userAgent.indexOf('Edg') === -1 && userAgent.indexOf('OPR') === -1) browser = 'Chrome';
  else if (userAgent.indexOf('Safari') !== -1 && userAgent.indexOf('Chrome') === -1) browser = 'Safari';
  else if (userAgent.indexOf('Edg') !== -1) browser = 'Edge';
  else if (userAgent.indexOf('OPR') !== -1) browser = 'Opera';
  else if (userAgent.indexOf('MSIE') !== -1 || userAgent.indexOf('Trident') !== -1) browser = 'Internet Explorer';

  // Get screen resolution
  const screenResolution = `${window.screen.width}x${window.screen.height}`;

  return {
    type: deviceType,
    os,
    browser,
    screenResolution,
    userAgent,
    platform,
    language,
    timezone
  };
}

/**
 * Formats device info for display
 */
export function formatDeviceInfo(device: DeviceInfo): string {
  return `${device.os} • ${device.browser} • ${device.screenResolution}`;
}

