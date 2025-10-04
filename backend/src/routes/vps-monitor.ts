import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import os from 'os';
import { logger } from '../services/LoggerService';

const execAsync = promisify(exec);
const router = express.Router();

interface VPSStats {
  timestamp: string;
  system: {
    hostname: string;
    uptime: number;
    platform: string;
    arch: string;
    nodeVersion: string;
  };
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
    temperature?: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    available: number;
    usagePercent: number;
    swap: {
      total: number;
      free: number;
      used: number;
    };
  };
  disk: {
    total: number;
    free: number;
    used: number;
    usagePercent: number;
    inodes: {
      total: number;
      free: number;
      used: number;
    };
  };
  network: {
    interfaces: Array<{
      name: string;
      bytesReceived: number;
      bytesSent: number;
      packetsReceived: number;
      packetsSent: number;
    }>;
    connections: number;
  };
  processes: {
    total: number;
    running: number;
    sleeping: number;
    zombie: number;
  };
  services: Array<{
    name: string;
    status: string;
    uptime: string;
    memory: string;
    cpu: string;
  }>;
  ping: {
    google: number;
    cloudflare: number;
    localhost: number;
  };
  uptime: string;
}

// Cache for storing previous network stats
let previousNetworkStats: any = null;
let previousTimestamp = Date.now();

async function getCPUTemperature(): Promise<number | undefined> {
  try {
    // Try to get CPU temperature (works on Linux)
    const { stdout } = await execAsync('cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -1');
    const temp = parseInt(stdout.trim());
    return temp > 0 ? temp / 1000 : undefined; // Convert from millidegrees to degrees
  } catch {
    return undefined;
  }
}

async function getDiskUsage(): Promise<any> {
  try {
    const { stdout } = await execAsync('df -h / | tail -1');
    const parts = stdout.trim().split(/\s+/);
    return {
      total: parts[1],
      used: parts[2],
      free: parts[3],
      usagePercent: parseInt(parts[4].replace('%', ''))
    };
  } catch (error) {
    console.error('Error getting disk usage:', error);
    return { total: '0', used: '0', free: '0', usagePercent: 0 };
  }
}

async function getDiskInodes(): Promise<any> {
  try {
    const { stdout } = await execAsync('df -i / | tail -1');
    const parts = stdout.trim().split(/\s+/);
    return {
      total: parseInt(parts[1]),
      used: parseInt(parts[2]),
      free: parseInt(parts[3])
    };
  } catch (error) {
    console.error('Error getting disk inodes:', error);
    return { total: 0, used: 0, free: 0 };
  }
}

async function getNetworkStats(): Promise<Array<{
  name: string;
  bytesReceived: number;
  bytesSent: number;
  packetsReceived: number;
  packetsSent: number;
}>> {
  try {
    const { stdout } = await execAsync('cat /proc/net/dev');
    const lines = stdout.trim().split('\n').slice(2); // Skip header lines
    const interfaces: Array<{
      name: string;
      bytesReceived: number;
      bytesSent: number;
      packetsReceived: number;
      packetsSent: number;
    }> = [];
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 11 && parts[0] && parts[1] && parts[2] && parts[9] && parts[10]) {
        const name = parts[0].replace(':', '');
        
        interfaces.push({
          name,
          bytesReceived: parseInt(parts[1]) || 0,
          bytesSent: parseInt(parts[9]) || 0,
          packetsReceived: parseInt(parts[2]) || 0,
          packetsSent: parseInt(parts[10]) || 0
        });
      }
    }
    
    return interfaces;
  } catch (error) {
    console.error('Error getting network stats:', error);
    return [];
  }
}

async function getNetworkConnections(): Promise<number> {
  try {
    const { stdout } = await execAsync('ss -tuln | wc -l');
    return parseInt(stdout.trim());
  } catch {
    return 0;
  }
}

async function getProcessStats(): Promise<{
  total: number;
  running: number;
  sleeping: number;
  zombie: number;
}> {
  try {
    const { stdout } = await execAsync('ps -eo stat --no-headers | sort | uniq -c');
    const lines = stdout.trim().split('\n');
    
    let total = 0;
    let running = 0;
    let sleeping = 0;
    let zombie = 0;
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const count = parseInt(parts[0]);
        const status = parts[1];
        
        if (!isNaN(count)) {
          total += count;
          
          if (status.includes('R')) running += count;
          if (status.includes('S')) sleeping += count;
          if (status.includes('Z')) zombie += count;
        }
      }
    }
    
    return { total, running, sleeping, zombie };
  } catch (error) {
    console.error('Error getting process stats:', error);
    return { total: 0, running: 0, sleeping: 0, zombie: 0 };
  }
}

async function getServiceStats(): Promise<Array<{
  name: string;
  status: string;
  uptime: string;
  memory: string;
  cpu: string;
}>> {
  try {
    const { stdout } = await execAsync('systemctl list-units --type=service --state=running --no-pager --no-legend | head -10');
    const lines = stdout.trim().split('\n').filter(line => line.trim());
    const services: Array<{
      name: string;
      status: string;
      uptime: string;
      memory: string;
      cpu: string;
    }> = [];
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4 && parts[0] && parts[2]) {
        services.push({
          name: parts[0],
          status: parts[2],
          uptime: parts[3] || 'unknown',
          memory: 'N/A',
          cpu: 'N/A'
        });
      }
    }
    
    return services;
  } catch (error) {
    console.error('Error getting service stats:', error);
    return [];
  }
}

async function pingHost(host: string): Promise<number> {
  try {
    const { stdout } = await execAsync(`ping -c 1 -W 2 ${host} 2>/dev/null | grep 'time=' | sed 's/.*time=\\([0-9.]*\\).*/\\1/'`);
    const time = parseFloat(stdout.trim());
    return time > 0 ? time : -1;
  } catch {
    return -1; // -1 indicates ping failed
  }
}

async function getCPULoad(): Promise<number> {
  try {
    const loadAvg = os.loadavg();
    const cpuCount = os.cpus().length;
    return (loadAvg[0] / cpuCount) * 100; // Convert to percentage
  } catch {
    return 0;
  }
}

// GET /api/vps-monitor/stats - Get comprehensive VPS statistics
router.get('/stats', async (req, res) => {
  try {
    const timestamp = new Date().toISOString();
    
    // Get system info
    const hostname = os.hostname();
    const uptime = os.uptime();
    const platform = os.platform();
    const arch = os.arch();
    const nodeVersion = process.version;
    
    // Get CPU info
    const cpuUsage = await getCPULoad();
    const cpuCores = os.cpus().length;
    const loadAverage = os.loadavg();
    const cpuTemperature = await getCPUTemperature();
    
    // Get memory info
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = (usedMem / totalMem) * 100;
    
    // Get swap info (Linux)
    let swapInfo = { total: 0, free: 0, used: 0 };
    try {
      const swapOutput = await execAsync('free -b | grep Swap');
      const swapParts = swapOutput.stdout.trim().split(/\s+/);
      swapInfo = {
        total: parseInt(swapParts[1]),
        used: parseInt(swapParts[2]),
        free: parseInt(swapParts[3])
      };
    } catch {
      // Swap info not available or failed
    }
    
    // Get disk info
    const diskUsage = await getDiskUsage();
    const diskInodes = await getDiskInodes();
    
    // Get network info
    const networkInterfaces = await getNetworkStats();
    const networkConnections = await getNetworkConnections();
    
    // Get process info
    const processStats = await getProcessStats();
    
    // Get service info
    const serviceStats = await getServiceStats();
    
    // Get ping times
    const pingResults = await Promise.all([
      pingHost('google.com'),
      pingHost('1.1.1.1'),
      pingHost('127.0.0.1')
    ]);
    
    const stats: VPSStats = {
      timestamp,
      system: {
        hostname,
        uptime,
        platform,
        arch,
        nodeVersion
      },
      cpu: {
        usage: Math.round(cpuUsage * 100) / 100,
        cores: cpuCores,
        loadAverage: loadAverage.map(load => Math.round(load * 100) / 100),
        temperature: cpuTemperature
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        available: freeMem,
        usagePercent: Math.round(memUsagePercent * 100) / 100,
        swap: swapInfo
      },
      disk: {
        total: 0, // Will be filled by diskUsage
        free: 0,
        used: 0,
        usagePercent: diskUsage.usagePercent,
        inodes: diskInodes
      },
      network: {
        interfaces: networkInterfaces,
        connections: networkConnections
      },
      processes: processStats,
      services: serviceStats,
      ping: {
        google: pingResults[0],
        cloudflare: pingResults[1],
        localhost: pingResults[2]
      },
      uptime: formatUptime(uptime)
    };
    
    // Fill disk info from string values
    if (diskUsage.total !== '0') {
      stats.disk.total = parseSize(diskUsage.total);
      stats.disk.used = parseSize(diskUsage.used);
      stats.disk.free = parseSize(diskUsage.free);
    }
    
    res.json(stats);
  } catch (error) {
    console.error('Error getting VPS stats:', error);
    res.status(500).json({ error: 'Failed to get VPS statistics' });
  }
});

// Helper function to parse size strings like "50G", "100M", etc.
function parseSize(sizeStr: string): number {
  const units: { [key: string]: number } = {
    'K': 1024,
    'M': 1024 * 1024,
    'G': 1024 * 1024 * 1024,
    'T': 1024 * 1024 * 1024 * 1024
  };
  
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)([KMGTP]?)$/);
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2] || '';
  
  return value * (units[unit] || 1);
}

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0) parts.push(`${secs}s`);
  
  return parts.join(' ') || '0s';
}

export default router;
