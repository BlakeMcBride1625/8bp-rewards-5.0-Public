#!/usr/bin/env node

/**
 * Service Alert Script
 * Sends alerts via email and Discord webhook when services go down
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as os from 'os';
import * as nodemailer from 'nodemailer';
import axios from 'axios';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Configuration from environment variables
const ALERT_EMAIL = process.env.SERVICE_ALERT_EMAIL || '';
const SYSTEM_ALERT_EMAIL = process.env.SYSTEM_ALERT_EMAIL || '';
const DISCORD_USER_ID = process.env.SERVICE_ALERT_DISCORD_USER_ID || '';
const DISCORD_BOT_TOKEN = process.env.DISCORD_TOKEN || '';

// Service alert SMTP configuration - all values from environment variables
const SERVICE_ALERT_SMTP_USER = process.env.SERVICE_ALERT_SMTP_USER || '';
const SERVICE_ALERT_SMTP_PASS = process.env.SERVICE_ALERT_SMTP_PASS || '';
const SERVICE_ALERT_SMTP_HOST = process.env.SERVICE_ALERT_SMTP_HOST || process.env.SMTP_HOST || '';
const SERVICE_ALERT_SMTP_PORT = parseInt(process.env.SERVICE_ALERT_SMTP_PORT || process.env.SMTP_PORT || '587');
const SERVICE_ALERT_MAIL_FROM_ADDRESS = process.env.SERVICE_ALERT_MAIL_FROM || '';

// Validate required configuration
if (!SERVICE_ALERT_SMTP_USER) {
  console.error('❌ SERVICE_ALERT_SMTP_USER is required in .env');
  process.exit(1);
}
if (!SERVICE_ALERT_SMTP_PASS) {
  console.error('❌ SERVICE_ALERT_SMTP_PASS is required in .env');
  process.exit(1);
}
if (!SERVICE_ALERT_SMTP_HOST) {
  console.error('❌ SERVICE_ALERT_SMTP_HOST (or SMTP_HOST) is required in .env');
  process.exit(1);
}
if (!SERVICE_ALERT_MAIL_FROM_ADDRESS) {
  console.error('❌ SERVICE_ALERT_MAIL_FROM is required in .env');
  process.exit(1);
}

const SMTP_CONFIG = {
  host: SERVICE_ALERT_SMTP_HOST,
  port: SERVICE_ALERT_SMTP_PORT,
  secure: (process.env.SERVICE_ALERT_SMTP_SECURE === 'true' || process.env.SMTP_SECURE === 'true') || 
          SERVICE_ALERT_SMTP_PORT === 465,
  auth: {
    user: SERVICE_ALERT_SMTP_USER,
    pass: SERVICE_ALERT_SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
};

// Use "System Services" as display name, from address from environment variable
const SERVICE_ALERT_FROM_NAME = 'System Services';

interface FailedService {
  container: string;
  description: string;
}

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer: {
    text: string;
  };
  timestamp: string;
}

/**
 * Send email alert
 */
async function sendEmailAlert(failedServices: FailedService[]): Promise<boolean> {
  // Collect all recipient emails
  const recipientEmails: string[] = [];
  if (ALERT_EMAIL) {
    recipientEmails.push(ALERT_EMAIL);
  }
  if (SYSTEM_ALERT_EMAIL) {
    recipientEmails.push(SYSTEM_ALERT_EMAIL);
  }

  if (recipientEmails.length === 0) {
    console.error('❌ Email alert: No recipient emails configured (SERVICE_ALERT_EMAIL or SYSTEM_ALERT_EMAIL)');
    return false;
  }

  if (!SMTP_CONFIG.host || !SMTP_CONFIG.auth.user || !SMTP_CONFIG.auth.pass) {
    console.error('❌ Email alert: SMTP not configured');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport(SMTP_CONFIG);
    
    const serviceList = failedServices.map(s => `  • ${s.description} (${s.container})`).join('\n');
    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'Europe/London',
      dateStyle: 'full',
      timeStyle: 'long'
    });

    // Use the from address from environment variable (no hardcoded values)
    const fromAddress = `${SERVICE_ALERT_FROM_NAME} <${SERVICE_ALERT_MAIL_FROM_ADDRESS}>`;

    const mailOptions: any = {
      from: fromAddress,
      to: recipientEmails.join(', '),
      subject: `🚨 Service Alert: ${failedServices.length} Service(s) Down - 8BP Rewards`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🚨 Service Alert</h1>
          </div>
          
          <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
            <div style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
              <p style="margin: 0; color: #991b1b; font-size: 16px; font-weight: bold;">
                ⚠️ ${failedServices.length} service(s) are currently down or unhealthy
              </p>
            </div>
            
            <h2 style="color: #333; margin-top: 0; font-size: 20px;">Failed Services:</h2>
            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <pre style="margin: 0; color: #374151; font-family: 'Courier New', monospace; font-size: 14px; white-space: pre-wrap;">${serviceList}</pre>
            </div>
            
            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>Action Required:</strong> Please check the service status and restart if necessary.
              </p>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 25px;">
              <strong>Timestamp:</strong> ${timestamp}<br>
              <strong>Server:</strong> ${process.env.HOSTNAME || os.hostname() || 'Unknown'}
            </p>
            
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
              <strong>8 Ball Pool Rewards - Service Monitor</strong><br>
              This is an automated alert, please do not reply.
            </p>
          </div>
        </div>
      `,
      text: `
🚨 SERVICE ALERT

${failedServices.length} service(s) are currently down or unhealthy:

${serviceList}

Timestamp: ${timestamp}
Server: ${process.env.HOSTNAME || os.hostname() || 'Unknown'}

Action Required: Please check the service status and restart if necessary.

---
8 Ball Pool Rewards - Service Monitor
This is an automated alert.
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email alert sent to ${recipientEmails.join(', ')} from ${SERVICE_ALERT_MAIL_FROM_ADDRESS}`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Email alert failed:', errorMessage);
    if (errorMessage.includes('Sender address rejected')) {
      console.error(`⚠️  Your email server rejected ${SERVICE_ALERT_MAIL_FROM_ADDRESS}`);
      console.error(`💡 You need to configure your email server to allow sending from ${SERVICE_ALERT_MAIL_FROM_ADDRESS}`);
      console.error('   Contact your email provider or server administrator to enable this address as a sender.');
    }
    return false;
  }
}

/**
 * Create a DM channel with a Discord user
 */
async function createDMChannel(userId: string): Promise<string | null> {
  if (!DISCORD_BOT_TOKEN) {
    return null;
  }

  try {
    const response = await axios.post(
      'https://discord.com/api/v10/users/@me/channels',
      {
        recipient_id: userId.toString()
      },
      {
        headers: {
          'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        validateStatus: (status) => status < 500
      }
    );

    if (response.status >= 400) {
      console.error(`❌ Discord API error: ${response.status} - ${JSON.stringify(response.data)}`);
      return null;
    }

    return response.data.id;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Failed to create DM channel:', errorMessage);
    return null;
  }
}

/**
 * Send Discord DM alert
 */
async function sendDiscordAlert(failedServices: FailedService[]): Promise<boolean> {
  if (!DISCORD_BOT_TOKEN || !DISCORD_USER_ID) {
    console.error('❌ Discord alert: DISCORD_TOKEN or SERVICE_ALERT_DISCORD_USER_ID not configured');
    return false;
  }

  try {
    const timestamp = new Date().toISOString();
    const serviceList = failedServices.map(s => `• **${s.description}** (\`${s.container}\`)`).join('\n');
    
    // Create DM channel
    const channelId = await createDMChannel(DISCORD_USER_ID);
    if (!channelId) {
      throw new Error('Failed to create DM channel');
    }

    const embed: DiscordEmbed = {
      title: '🚨 Service Alert',
      description: `**${failedServices.length} service(s) are currently down or unhealthy**`,
      color: 15158332, // Red color
      fields: [
        {
          name: 'Failed Services',
          value: serviceList || 'Unknown services',
          inline: false
        },
        {
          name: 'Timestamp',
          value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
          inline: true
        },
        {
          name: 'Server',
          value: process.env.HOSTNAME || os.hostname() || 'Unknown',
          inline: true
        }
      ],
      footer: {
        text: '8 Ball Pool Rewards - Service Monitor'
      },
      timestamp: timestamp
    };

    await axios.post(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        embeds: [embed]
      },
      {
        headers: {
          'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Discord DM alert sent');
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Discord alert failed:', errorMessage);
    return false;
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  // Get failed services from command line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: send-service-alert.ts <service1:description1> [service2:description2] ...');
    process.exit(1);
  }

  const failedServices: FailedService[] = args.map(arg => {
    const parts = arg.split(':');
    const container = parts[0].trim();
    const description = parts.slice(1).join(':').trim() || container.trim();
    return { container, description };
  });

  console.log(`📧 Sending alerts for ${failedServices.length} failed service(s)...`);
  
  // Send both email and Discord alerts
  const emailSent = await sendEmailAlert(failedServices);
  const discordSent = await sendDiscordAlert(failedServices);

  if (emailSent || discordSent) {
    console.log('✅ Alerts sent successfully');
    process.exit(0);
  } else {
    console.error('❌ Failed to send alerts');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { sendEmailAlert, sendDiscordAlert, FailedService };

