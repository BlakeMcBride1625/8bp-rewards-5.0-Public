import { Router } from 'express';
import { authenticateAdmin } from '../middleware/auth';
import { logger } from '../services/LoggerService';

const router = Router();

// Active Services endpoint - shows ALL running processes
router.get('/active-services', authenticateAdmin, async (req, res) => {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // Get all running processes
    const { stdout: psOutput } = await execAsync('ps aux');
    const processes = psOutput.split('\n').slice(1).filter((line: string) => line.trim());
    
    // Parse processes and create categorized service objects (ordered by specification)
    const categorizedServices: { [key: string]: any[] } = {
      'Claimers': [],
      'Discord Services': [],
      'Website': [],
      'Other / System': []
    };
    
    processes.forEach((line: string) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) return;
      
      const pid = parts[1];
      const user = parts[0];
      const cpu = parts[2];
      const memory = parts[3];
      const command = parts.slice(10).join(' ');
      
      // Extract filename from command
      const filename = command.split('/').pop() || command;
      const fullPath = command;
      
      // Categorize services based on filename patterns
      let category = 'Other / System';
      let name = filename;
      let description = 'Running process';
      let type = 'unknown';
      let language = 'Unknown';
      let details = {};
      
      // Determine language type
      if (filename.includes('.ts')) {
        language = 'TypeScript';
      } else if (filename.includes('.js')) {
        language = 'JavaScript';
      } else if (filename.includes('.tsx')) {
        language = 'TypeScript (React)';
      } else if (filename.includes('.jsx')) {
        language = 'JavaScript (React)';
      }
      
      // Skip irrelevant system processes
      if (command.includes('kworker') || 
          command.includes('kthreadd') || 
          command.includes('rcu_') ||
          command.includes('cursor-server') ||
          command.includes('cursor-remote') ||
          command.includes('fail2ban') ||
          command.includes('systemd') ||
          command.includes('dbus') ||
          command.includes('NetworkManager') ||
          command.includes('sshd') ||
          command.includes('cron') ||
          command.includes('rsyslog') ||
          filename.includes('[') ||
          filename.includes(']') ||
          filename.length < 3) {
        return; // Skip these processes entirely
      }

      // 1. Claimers - Only actual claimer files
      if ((filename.match(/.*\.claimer\.(ts|js)$/i) || 
           filename.includes('claimer') || 
           command.includes('playwright-claimer') || 
           command.includes('first-time-claim') ||
           command.includes('remove-failed-claims')) &&
          !command.includes('cursor') && 
          !command.includes('systemd')) {
        category = 'Claimers';
        name = filename;
        description = `Claimer service (${language})`;
        type = 'claimer';
        details = {
          language,
          status: 'running',
          lastActivity: new Date().toISOString(),
          logs: 'Available'
        };
      }
      // 2. Discord Services - Pattern: discord*.ts, *.discord.js, or discord/ folder
      else if (filename.match(/^discord.*\.(ts|js)$/i) || 
               filename.match(/.*\.discord\.(ts|js)$/i) || 
               command.includes('discord-bot') ||
               command.includes('discord/') ||
               filename.includes('discord')) {
        category = 'Discord Services';
        name = filename;
        description = `Discord bot/handler (${language})`;
        type = 'discord';
        details = {
          botName: filename.replace(/\.(ts|js)$/, ''),
          eventListeners: ['onMessage', 'onInteraction'],
          commandTypes: ['slash', 'text']
        };
      }
      // 3. Website - Only actual web servers and our application files
      else if ((filename.match(/.*\.route\.(ts|js)$/i) || 
               filename.match(/.*\.page\.(tsx|jsx)$/i) || 
               command.includes('dist/backend/server.js') ||
               command.includes('build/server') ||
               (filename.includes('server.js') && !command.includes('cursor')) ||
               (filename.includes('serve.js') && !command.includes('cursor'))) &&
               !command.includes('cursor') &&
               !command.includes('systemd')) {
        category = 'Website';
        name = filename;
        description = `Web service (${language})`;
        type = 'website';
        details = {
          routePath: filename.includes('server') ? '/' : '/dashboard',
          moduleName: filename,
          isStatic: !filename.includes('server')
        };
      }
      // 4. Other / System - Catch-all
      else {
        category = 'Other / System';
        name = filename;
        description = `System service (${language})`;
        type = 'system';
        details = {
          role: filename.includes('config') ? 'config' : 
                filename.includes('logger') ? 'logger' : 
                filename.includes('health') ? 'healthcheck' : 'utility'
        };
      }
      
      const service = {
        pid,
        user,
        cpu: parseFloat(cpu),
        memory: parseFloat(memory),
        command,
        filename,
        fullPath,
        name,
        description,
        type,
        language,
        details,
        status: 'running',
        uptime: 'N/A',
        lastRun: new Date().toISOString()
      };
      
      categorizedServices[category].push(service);
    });
    
    // Sort each category alphabetically by filename
    Object.keys(categorizedServices).forEach(category => {
      categorizedServices[category].sort((a, b) => a.filename.localeCompare(b.filename));
    });
    
    // Convert to flat array for backward compatibility
    const allServices = Object.values(categorizedServices).flat();
    
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
