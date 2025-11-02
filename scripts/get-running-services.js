#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function getRunningServices() {
  try {
    // Get all running processes
    const { stdout: psOutput } = await execAsync('ps aux');
    const processes = psOutput.split('\n').slice(1).filter((line) => line.trim());
    
    const services = [];
    
    processes.forEach((line) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) return;
      
      const pid = parts[1];
      const user = parts[0];
      const cpu = parseFloat(parts[2]);
      const memory = parseFloat(parts[3]);
      const command = parts.slice(10).join(' ');
      
      // Extract filename from command
      const filename = command.split('/').pop() || command;
      
      // Skip irrelevant processes
      if (command.includes('cursor-server') ||
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
        return;
      }
      
      // Check if it's one of our services
      let serviceName = null;
      let serviceType = null;
      
      if (filename.includes('playwright-claimer') || command.includes('playwright-claimer')) {
        serviceName = 'Playwright Claimer';
        serviceType = 'claimer';
      } else if (filename.includes('discord-bot') || command.includes('discord-bot')) {
        serviceName = 'Discord Bot';
        serviceType = 'discord';
      } else if (filename.includes('server.js') && command.includes('dist/backend')) {
        serviceName = 'Backend API Server';
        serviceType = 'backend';
      } else if (filename.includes('server.js') && !command.includes('cursor')) {
        serviceName = 'Web Server';
        serviceType = 'website';
      }
      
      if (serviceName) {
        services.push({
          pid,
          user,
          cpu,
          memory,
          command,
          filename,
          name: serviceName,
          type: serviceType,
          status: 'running',
          uptime: 'N/A',
          lastRun: new Date().toISOString()
        });
      }
    });
    
    return {
      success: true,
      data: {
        services,
        activeCount: services.length,
        totalCount: services.length,
        lastUpdated: new Date().toISOString()
      }
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// If run directly, output JSON
if (require.main === module) {
  getRunningServices().then(result => {
    console.log(JSON.stringify(result, null, 2));
  });
}

module.exports = { getRunningServices };


