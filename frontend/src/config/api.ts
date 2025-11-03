/**
 * API Configuration
 * Automatically uses the correct API URL based on environment
 */

// In production build, use production API URL
// In development, use localhost with configured backend port
const backendPort = process.env.REACT_APP_BACKEND_PORT || '2600';
export const API_BASE_URL = process.env.REACT_APP_API_URL || `http://localhost:${backendPort}/api`;

// WebSocket URL - use same origin as the current page
export const getWebSocketURL = (): string => {
  // Use the current window location to determine protocol and host
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}`;
  }
  
  // Fallback for SSR: use API_BASE_URL
  const apiUrl = API_BASE_URL.replace('/api', '');
  if (apiUrl.startsWith('https://')) {
    return apiUrl.replace('https://', 'wss://');
  } else {
    return apiUrl.replace('http://', 'ws://');
  }
};

export const WEBSOCKET_URL = getWebSocketURL();

export const API_ENDPOINTS = {
  // Base URL for direct access
  BASE_URL: API_BASE_URL.replace('/api', ''),
  
  // Auth
  AUTH_STATUS: `${API_BASE_URL}/auth/status`,
  AUTH_DISCORD: `${API_BASE_URL}/auth/discord`,
  AUTH_LOGOUT: `${API_BASE_URL}/auth/logout`,
  
  // Registration
  REGISTRATION: `${API_BASE_URL}/registration`,
  
  // Admin
  ADMIN_OVERVIEW: `${API_BASE_URL}/admin/overview`,
  ADMIN_REGISTRATIONS: `${API_BASE_URL}/admin/registrations`,
  ADMIN_CLAIM_ALL: `${API_BASE_URL}/admin/claim-all`,
  ADMIN_CLAIM_USERS: `${API_BASE_URL}/admin/claim-users`,
  ADMIN_TEST_USERS: `${API_BASE_URL}/admin/test-users`,
  ADMIN_USERS: `${API_BASE_URL}/admin/users`,
  ADMIN_CLAIM_PROGRESS: `${API_BASE_URL}/admin/claim-progress`,
  ADMIN_CLAIM_PROGRESS_BY_ID: (processId: string) => `${API_BASE_URL}/admin/claim-progress/${processId}`,
  ADMIN_CLAIM_PROGRESS_CLEANUP: `${API_BASE_URL}/admin/claim-progress/cleanup`,
  ADMIN_RESET_LEADERBOARD: `${API_BASE_URL}/admin/reset-leaderboard`,
  ADMIN_RESET_LEADERBOARD_REQUEST_ACCESS: `${API_BASE_URL}/admin/reset-leaderboard/request-access`,
  ADMIN_RESET_LEADERBOARD_VERIFY_ACCESS: `${API_BASE_URL}/admin/reset-leaderboard/verify-access`,
  ADMIN_RESET_LEADERBOARD_ACCESS_STATUS: `${API_BASE_URL}/admin/reset-leaderboard/access-status`,
  ADMIN_ACTIVE_SERVICES: `${API_BASE_URL}/admin/active-services`,
  ADMIN_HEARTBEAT_SUMMARY: `${API_BASE_URL}/admin/heartbeat/summary`,
  ADMIN_USER_COUNT: `${API_BASE_URL}/admin/user-count`,
  
  // VPS Monitor Authentication
  ADMIN_VPS_REQUEST_ACCESS: `${API_BASE_URL}/admin/vps/request-access`,
  ADMIN_VPS_VERIFY_ACCESS: `${API_BASE_URL}/admin/vps/verify-access`,
  ADMIN_VPS_ACCESS_STATUS: `${API_BASE_URL}/admin/vps/access-status`,
  
  // System Status
  STATUS: `${API_BASE_URL}/status`,
  STATUS_SCHEDULER: `${API_BASE_URL}/status/scheduler`,
  
  // VPS Monitor
  VPS_MONITOR_STATS: `${API_BASE_URL}/vps-monitor/stats`,
  
  // Leaderboard
  LEADERBOARD: `${API_BASE_URL}/leaderboard`,
  
  // Contact
  CONTACT: `${API_BASE_URL}/contact`,
  
  // Validation
  VALIDATION_REVALIDATE_USER: `${API_BASE_URL}/validation/revalidate-user`,
  VALIDATION_REVALIDATE_ALL: `${API_BASE_URL}/validation/revalidate-all-invalid`,
  VALIDATION_DEREGISTERED_USERS: `${API_BASE_URL}/validation/deregistered-users`,
};

// Helper function to build admin user block endpoint
export const getAdminUserBlockEndpoint = (eightBallPoolId: string): string => {
  return `${API_BASE_URL}/admin/users/${eightBallPoolId}/block`;
};

// Helper function to build admin registration delete endpoint  
export const getAdminRegistrationDeleteEndpoint = (eightBallPoolId: string): string => {
  return `${API_BASE_URL}/admin/registrations/${eightBallPoolId}`;
};

console.log('🌐 API Base URL:', API_BASE_URL);

