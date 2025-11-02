import { Router } from 'express';
import { authenticateAdmin } from '../middleware/auth';
import { logger } from '../services/LoggerService';
import { HeartbeatRegistry } from '../services/HeartbeatRegistry';

const router = Router();

// Active Services endpoint - shows ALL running processes
router.get('/active-services', authenticateAdmin, async (req, res) => {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // Get actual running services from host system
    const { stdout: psOutput } = await execAsync('ps aux');
    const processes = psOutput.split('\n').slice(1).filter((line: string) => line.trim());
    
    const detectedServices: any[] = [];
    
    // Detect actual running services
    processes.forEach((line: string) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) return;
      
      const pid = parts[1];
      const user = parts[0];
      const cpu = parseFloat(parts[2]) || 0;
      const memory = parseFloat(parts[3]) || 0;
      const command = parts.slice(10).join(' ');
      const filename = command.split('/').pop() || command;
      
      let name = filename;
      let type = 'other';
      let description = '';
      
      // Detect our specific services
      if (command.includes('playwright-claimer-discord.js')) {
        name = 'Playwright Discord Claimer';
        type = 'claimer';
        description = 'Discord-integrated claimer service';
      } else if (command.includes('playwright-claimer.js')) {
        name = 'Playwright Claimer';
        type = 'claimer';
        description = 'Main claimer service';
      } else if (command.includes('dist/backend/backend/src/server.js')) {
        name = 'Backend API Server';
        type = 'backend';
        description = 'Express.js backend server';
      } else if (command.includes('discord-bot.js')) {
        name = 'Discord Bot';
        type = 'discord';
        description = 'Discord bot service';
      } else {
        return; // Skip processes not related to our services
      }
      
      detectedServices.push({
        pid,
        user,
        cpu,
        memory,
        command,
        filename,
        name,
        description,
        type,
        status: 'running',
        uptime: 'N/A',
        lastRun: new Date().toISOString()
      });
    });
    
    // Add systemd services
    try {
      const { stdout: systemdOutput } = await execAsync('systemctl list-units --type=service --state=running | grep 8bp');
      const systemdServices = systemdOutput.trim().split('\n').filter((line: string) => line.trim());
      
      systemdServices.forEach((line: string) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const serviceName = parts[0];
          let name = serviceName;
          let type = 'scheduler';
          let description = 'Systemd service';
          
          if (serviceName.includes('scheduler')) {
            name = 'Scheduler Service';
            description = 'Systemd service for automated claiming';
          } else if (serviceName.includes('claimer')) {
            name = 'Claimer Service';
            type = 'claimer';
            description = 'Systemd claimer service';
          } else if (serviceName.includes('discord')) {
            name = 'Discord Service';
            type = 'discord';
            description = 'Systemd Discord service';
          }
          
          detectedServices.push({
            pid: `systemd-${serviceName}`,
            user: 'root',
            cpu: 0.1,
            memory: 0.1,
            command: `systemd service: ${serviceName}`,
            filename: serviceName,
            name,
            description,
            type,
            status: 'running',
            uptime: 'N/A',
            lastRun: new Date().toISOString()
          });
        }
      });
    } catch (error: any) {
      logger.warn('Could not get systemd services:', { error: error.message });
    }
    
    // Only add heartbeat files for actual service processes, not individual modules
    const registry = HeartbeatRegistry.getInstance();
    const activeFiles = registry.getActiveRecords();
    
    // Group by process and only add one entry per process with service info
    const processServices = new Map();
    activeFiles.forEach(rec => {
      if (rec.service && rec.service !== 'backend') {
        const key = `${rec.processId}-${rec.service}`;
        if (!processServices.has(key)) {
          processServices.set(key, {
            pid: String(rec.processId),
            user: 'n/a',
            cpu: 0,
            memory: 0,
            command: `${rec.service} (heartbeat tracked)`,
            filename: `${rec.service}.js`,
            name: `${rec.service.charAt(0).toUpperCase() + rec.service.slice(1)} Service`,
            description: `Heartbeat-tracked ${rec.service} service`,
            type: rec.service,
            status: 'running',
            uptime: 'N/A',
            lastRun: new Date().toISOString()
          });
        }
      }
    });
    
    // Add the grouped service entries
    processServices.forEach(service => {
      detectedServices.push(service);
    });

    const allServices = detectedServices;
    
    // Categorize services
    const categorizedServices: { [key: string]: any[] } = {
      'Claimers': [],
      'Discord Services': [],
      'Website': [],
      'Other / System': []
    };
    
    allServices.forEach((service: any) => {
      switch (service.type) {
        case 'claimer':
          categorizedServices['Claimers'].push(service);
          break;
        case 'discord':
          categorizedServices['Discord Services'].push(service);
          break;
        case 'backend':
        case 'website':
          categorizedServices['Website'].push(service);
          break;
        default:
          categorizedServices['Other / System'].push(service);
      }
    });
    
    // Sort each category alphabetically by name
    Object.keys(categorizedServices).forEach(category => {
      categorizedServices[category].sort((a, b) => a.name.localeCompare(b.name));
    });
    
    // Get system info
    const { stdout: uptimeOutput } = await execAsync('uptime');
    const { stdout: memoryOutput } = await execAsync('free -h');
    const { stdout: diskOutput } = await execAsync('df -h /');
    
    const systemInfo = {
      uptime: uptimeOutput.trim(),
      memory: memoryOutput.trim(),
      disk: diskOutput.trim()
    };
    
    const responseData = {
      success: true,
      data: {
        services: allServices,
        categorizedServices: categorizedServices,
        activeCount: allServices.length,
        totalCount: allServices.length,
        systemInfo: systemInfo,
        lastUpdated: new Date().toISOString()
      }
    };
    
    logger.info('Active services response:', { 
      serviceCount: allServices.length, 
      activeCount: responseData.data.activeCount,
      totalCount: responseData.data.totalCount 
    });
    
    // Prevent caching to ensure fresh data
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.json(responseData);
    
  } catch (error: any) {
    logger.error('Error getting active services:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get active services',
      details: error.message
    });
  }
});

export default router;
