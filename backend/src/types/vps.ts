/**
 * VPS monitoring and access type definitions
 */

/**
 * VPS code structure
 */
export interface VPSCode {
  discordCode: string;
  telegramCode: string;
  emailCode: string;
  userEmail?: string;
  userId: string;
  username: string;
  expiresAt: Date;
  attempts: number;
  isUsed: boolean;
  discordMessageId?: string;
  telegramMessageId?: string;
}

/**
 * VPS access grant structure
 */
export interface VPSAccess {
  userId: string;
  grantedAt: Date;
  expiresAt: Date;
}

/**
 * System statistics structure
 */
export interface SystemStats {
  hostname: string;
  uptime: number;
  platform: string;
  arch: string;
  nodeVersion: string;
  release?: string;
}

/**
 * CPU statistics structure
 */
export interface CPUStats {
  usagePercent: number;
  cores: number;
  model?: string;
  temperature?: number;
}

/**
 * Memory statistics structure
 */
export interface MemoryStats {
  total: string;
  used: string;
  free: string;
  available?: string;
  usagePercent: number;
  swap?: {
    total: string;
    used: string;
    free: string;
  };
}

/**
 * Disk statistics structure
 */
export interface DiskStats {
  total: string;
  used: string;
  free: string;
  usagePercent: number;
  inodes?: {
    total: number;
    used: number;
    free: number;
  };
}

/**
 * Network interface statistics
 */
export interface NetworkInterfaceStats {
  name: string;
  bytesReceived: number;
  bytesSent: number;
  packetsReceived: number;
  packetsSent: number;
}

/**
 * Network statistics structure
 */
export interface NetworkStats {
  interfaces: NetworkInterfaceStats[];
  connections: number;
}

/**
 * Process statistics structure
 */
export interface ProcessStats {
  total: number;
  running: number;
  sleeping: number;
  zombie: number;
}

/**
 * Service status structure
 */
export interface ServiceStatus {
  name: string;
  status: string;
  uptime: string;
  memory: string;
  cpu: string;
}

/**
 * Ping statistics structure
 */
export interface PingStats {
  host: string;
  latency: number;
  status: 'online' | 'offline' | 'timeout';
}

/**
 * Complete VPS statistics structure
 */
export interface VPSStats {
  system: SystemStats;
  cpu: CPUStats;
  memory: MemoryStats;
  disk: DiskStats;
  network: NetworkStats;
  processes: ProcessStats;
  services: ServiceStatus[];
  ping: PingStats[];
  timestamp: string;
}





