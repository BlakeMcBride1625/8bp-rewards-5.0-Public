import axios from 'axios';
import { logger } from './LoggerService';

class DiscordNotificationService {
  private botToken: string;
  private registrationChannelId: string;

  constructor() {
    // Ensure dotenv is loaded
    if (typeof require !== 'undefined') {
      try {
        require('dotenv').config();
      } catch (e) {
        // dotenv already loaded
      }
    }
    this.botToken = process.env.DISCORD_TOKEN || '';
    this.registrationChannelId = process.env.REGISTRATION_CHANNEL_ID || '';
    
    if (!this.botToken) {
      logger.warn('DiscordNotificationService: DISCORD_TOKEN not found in environment');
    }
  }

  /**
   * Create a DM channel with a user
   */
  private async createDMChannel(userId: string): Promise<string | null> {
    if (!this.botToken) {
      logger.warn('Discord DM skipped - missing DISCORD_TOKEN');
      return null;
    }

    try {
      // Discord API expects recipient_id as a string in the request body
      const response = await axios.post(
        'https://discord.com/api/v10/users/@me/channels',
        {
          recipient_id: userId.toString()
        },
        {
          headers: {
            'Authorization': `Bot ${this.botToken}`,
            'Content-Type': 'application/json'
          },
          validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        }
      );

      if (response.status >= 400) {
        logger.error('Discord API returned error', {
          action: 'discord_dm_channel_api_error',
          status: response.status,
          statusText: response.statusText,
          data: response.data,
          userId
        });
        return null;
      }

      return response.data.id;
    } catch (error) {
      logger.error('Failed to create DM channel', {
        action: 'discord_dm_channel_error',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      return null;
    }
  }

  /**
   * Send a direct message to a user
   */
  async sendDirectMessage(userId: string, content: string): Promise<any> {
    if (!this.botToken) {
      logger.warn('Discord DM skipped - missing DISCORD_TOKEN');
      return null;
    }

    try {
      // Create or get DM channel
      const channelId = await this.createDMChannel(userId);
      if (!channelId) {
        throw new Error('Failed to create DM channel');
      }

      // Send message
      const response = await axios.post(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          content
        },
        {
          headers: {
            'Authorization': `Bot ${this.botToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Discord DM sent', {
        action: 'discord_dm_sent',
        userId,
        channelId
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to send Discord DM', {
        action: 'discord_dm_error',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      throw error;
    }
  }

  /**
   * Delete a message from a DM channel
   */
  async deleteMessage(userId: string, messageId: string): Promise<void> {
    if (!this.botToken) {
      logger.warn('Discord message deletion skipped - missing DISCORD_TOKEN');
      return;
    }

    try {
      // Create or get DM channel
      const channelId = await this.createDMChannel(userId);
      if (!channelId) {
        throw new Error('Failed to create DM channel');
      }

      // Delete message
      await axios.delete(
        `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
        {
          headers: {
            'Authorization': `Bot ${this.botToken}`
          }
        }
      );

      logger.info('Discord message deleted', {
        action: 'discord_message_deleted',
        userId,
        channelId,
        messageId
      });
    } catch (error) {
      logger.error('Failed to delete Discord message', {
        action: 'discord_message_delete_error',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        messageId
      });
      throw error;
    }
  }

  /**
   * Send a message to a specific Discord channel
   */
  async sendToChannel(channelId: string, content: string): Promise<any> {
    if (!this.botToken) {
      logger.warn('Discord channel message skipped - missing DISCORD_TOKEN');
      return null;
    }

    try {
      const response = await axios.post(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          content
        },
        {
          headers: {
            'Authorization': `Bot ${this.botToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Discord channel message sent', {
        action: 'discord_channel_message_sent',
        channelId
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to send Discord channel message', {
        action: 'discord_channel_message_error',
        error: error instanceof Error ? error.message : 'Unknown error',
        channelId
      });
      throw error;
    }
  }

  /**
   * Send a notification to Discord when a new user registers
   */
  async sendRegistrationNotification(eightBallPoolId: string, username: string, ip: string): Promise<void> {
    if (!this.botToken || !this.registrationChannelId) {
      logger.warn('Discord notification skipped - missing DISCORD_TOKEN or REGISTRATION_CHANNEL_ID', {
        action: 'discord_notification_skipped'
      });
      return;
    }

    try {
      const embed = {
        title: '🎉 New User Registration',
        description: `A new user has registered for the 8BP Rewards system!`,
        color: 0x00ff00, // Green color
        fields: [
          {
            name: '👤 Username',
            value: username,
            inline: true
          },
          {
            name: '🎱 8BP Account ID',
            value: eightBallPoolId,
            inline: true
          },
          {
            name: '📅 Registered At',
            value: new Date().toLocaleString(),
            inline: false
          }
        ],
        footer: {
          text: '8 Ball Pool Rewards System'
        },
        timestamp: new Date().toISOString()
      };

      await axios.post(
        `https://discord.com/api/v10/channels/${this.registrationChannelId}/messages`,
        {
          embeds: [embed]
        },
        {
          headers: {
            'Authorization': `Bot ${this.botToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Discord registration notification sent', {
        action: 'discord_registration_notification',
        username,
        eightBallPoolId,
        channelId: this.registrationChannelId
      });
    } catch (error) {
      logger.error('Failed to send Discord registration notification', {
        action: 'discord_notification_error',
        error: error instanceof Error ? error.message : 'Unknown error',
        username,
        eightBallPoolId
      });
    }
  }
}

export default DiscordNotificationService;

