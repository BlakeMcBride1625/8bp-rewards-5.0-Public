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

  /**
   * Send a notification to Discord when an account is verified via verification bot
   */
  async sendVerificationConfirmation(
    eightBallPoolId: string,
    username: string,
    level: number,
    rankName: string,
    discordId: string,
    discordUsername: string
  ): Promise<void> {
    if (!this.botToken || !this.registrationChannelId) {
      logger.warn('Discord verification notification skipped - missing DISCORD_TOKEN or REGISTRATION_CHANNEL_ID', {
        action: 'discord_verification_notification_skipped'
      });
      return;
    }

    try {
      const embed = {
        title: '✅ Account Verified via Discord',
        description: `An account has been verified through the Discord verification bot`,
        color: 0x00ff00, // Green color
        fields: [
          {
            name: '👤 Account Username',
            value: username,
            inline: true
          },
          {
            name: '🎱 8BP Account ID',
            value: eightBallPoolId,
            inline: true
          },
          {
            name: '👤 Discord User',
            value: `<@${discordId}> (${discordUsername})`,
            inline: true
          },
          {
            name: '📊 Level',
            value: String(level),
            inline: true
          },
          {
            name: '🏆 Rank',
            value: rankName,
            inline: true
          },
          {
            name: '📅 Verified At',
            value: new Date().toLocaleString(),
            inline: false
          }
        ],
        footer: {
          text: '8 Ball Pool Rewards System - Verification Bot'
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

      logger.info('Discord verification confirmation notification sent', {
        action: 'discord_verification_notification',
        username,
        eightBallPoolId,
        level,
        rankName,
        discordId,
        channelId: this.registrationChannelId
      });
    } catch (error) {
      logger.error('Failed to send Discord verification confirmation notification', {
        action: 'discord_verification_notification_error',
        error: error instanceof Error ? error.message : 'Unknown error',
        username,
        eightBallPoolId,
        discordId
      });
    }
  }

  /**
   * Send an embed message to a Discord channel
   */
  async sendEmbed(channelId: string, embed: any): Promise<any> {
    if (!this.botToken) {
      logger.warn('Discord embed skipped - missing DISCORD_TOKEN');
      return null;
    }

    try {
      const response = await axios.post(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
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

      logger.info('Discord embed sent', {
        action: 'discord_embed_sent',
        channelId
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to send Discord embed', {
        action: 'discord_embed_error',
        error: error instanceof Error ? error.message : 'Unknown error',
        channelId
      });
      throw error;
    }
  }

  /**
   * Send an embed message via DM to a user
   */
  async sendEmbedDM(userId: string, embed: any): Promise<any> {
    if (!this.botToken) {
      logger.warn('Discord embed DM skipped - missing DISCORD_TOKEN');
      return null;
    }

    try {
      // Create or get DM channel
      const channelId = await this.createDMChannel(userId);
      if (!channelId) {
        throw new Error('Failed to create DM channel');
      }

      // Send embed message
      const response = await axios.post(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
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

      logger.info('Discord embed DM sent', {
        action: 'discord_embed_dm_sent',
        userId,
        channelId
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to send Discord embed DM', {
        action: 'discord_embed_dm_error',
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      throw error;
    }
  }

  /**
   * Send a deregistration request embed via DM to the user
   */
  async sendDeregistrationRequestEmbed(
    discordId: string,
    discordTag: string,
    eightBallPoolId: string,
    username: string,
    ipAddress: string,
    screenshotUrl?: string
  ): Promise<void> {
    if (!this.botToken) {
      logger.warn('Discord embed DM skipped - missing DISCORD_TOKEN');
      return;
    }

    try {
      const embed: any = {
        title: '📝 Deregistration Request',
        description: `Your request to unlink your 8 Ball Pool account has been received and is pending admin review.`,
        color: 0xffa500, // Orange color
        fields: [
          {
            name: '🎱 8BP Account ID',
            value: eightBallPoolId,
            inline: true
          },
          {
            name: '📛 Username',
            value: username,
            inline: true
          },
          {
            name: '📅 Requested At',
            value: new Date().toLocaleString(),
            inline: true
          }
        ],
        footer: {
          text: '8 Ball Pool Rewards System'
        },
        timestamp: new Date().toISOString()
      };

      // Add screenshot if available
      if (screenshotUrl) {
        embed.image = { url: screenshotUrl };
      }

      // Send via DM instead of public channel
      await this.sendEmbedDM(discordId, embed);
    } catch (error) {
      logger.error('Failed to send deregistration request embed', {
        action: 'deregistration_request_embed_error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Send a deregistration approval/denial embed via DM to the user
   */
  async sendDeregistrationReviewEmbed(
    action: 'approved' | 'denied',
    discordId: string,
    discordTag: string,
    eightBallPoolId: string,
    reviewedBy: string,
    reviewNotes?: string
  ): Promise<void> {
    if (!this.botToken) {
      logger.warn('Discord embed DM skipped - missing DISCORD_TOKEN');
      return;
    }

    try {
      const embed = {
        title: action === 'approved' ? '✅ Deregistration Approved' : '❌ Deregistration Denied',
        description: action === 'approved' 
          ? `Your deregistration request has been approved. Your 8 Ball Pool account has been unlinked from your Discord account.`
          : `Your deregistration request has been denied.`,
        color: action === 'approved' ? 0x00ff00 : 0xff0000,
        fields: [
          {
            name: '🎱 8BP Account ID',
            value: eightBallPoolId,
            inline: true
          },
          {
            name: '👨‍💼 Reviewed By',
            value: reviewedBy,
            inline: true
          },
          {
            name: '📅 Reviewed At',
            value: new Date().toLocaleString(),
            inline: true
          }
        ],
        footer: {
          text: '8 Ball Pool Rewards System'
        },
        timestamp: new Date().toISOString()
      };

      if (reviewNotes) {
        embed.fields.push({
          name: '📝 Notes',
          value: reviewNotes,
          inline: false
        });
      }

      // Send via DM instead of public channel
      await this.sendEmbedDM(discordId, embed);
    } catch (error) {
      logger.error('Failed to send deregistration review embed', {
        action: 'deregistration_review_embed_error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Send a notification to Discord when a new support ticket is created
   */
  async sendTicketNotification(
    ticketNumber: string,
    ticketType: 'email' | 'website',
    subject: string,
    category?: string,
    userName?: string,
    userEmail?: string,
    discordId?: string,
    hasAttachments: boolean = false
  ): Promise<void> {
    const channelId = process.env.SUPPORT_CHANNEL_ID;
    
    if (!this.botToken || !channelId) {
      logger.warn('Discord ticket notification skipped - missing DISCORD_TOKEN or SUPPORT_CHANNEL_ID', {
        action: 'discord_ticket_notification_skipped',
        hasToken: !!this.botToken,
        hasChannel: !!channelId,
        supportChannelId: process.env.SUPPORT_CHANNEL_ID,
        registrationChannelId: process.env.REGISTRATION_CHANNEL_ID
      });
      return;
    }

    try {
      const embed = {
        title: `🎫 New Support Ticket: ${ticketNumber}`,
        description: `A new ${ticketType === 'email' ? 'email' : 'website'} support ticket has been created.`,
        color: ticketType === 'email' ? 0x3498db : 0xf97316, // Blue for email, orange for website
        fields: [
          {
            name: '🎫 Ticket Number',
            value: `\`${ticketNumber}\``,
            inline: true
          },
          {
            name: '📋 Type',
            value: ticketType === 'email' ? '📧 Email' : '🌐 Website',
            inline: true
          },
          {
            name: '📝 Subject',
            value: subject || 'No subject',
            inline: false
          }
        ],
        footer: {
          text: '8 Ball Pool Rewards System'
        },
        timestamp: new Date().toISOString()
      };

      if (category) {
        embed.fields.push({
          name: '🏷️ Category',
          value: category,
          inline: true
        });
      }

      if (userName) {
        embed.fields.push({
          name: '👤 User',
          value: userName,
          inline: true
        });
      }

      if (userEmail) {
        embed.fields.push({
          name: '📧 Email',
          value: userEmail,
          inline: true
        });
      }

      if (discordId) {
        embed.fields.push({
          name: '🆔 Discord ID',
          value: `<@${discordId}>`,
          inline: true
        });
      }

      if (hasAttachments) {
        embed.fields.push({
          name: '📎 Attachments',
          value: 'Yes',
          inline: true
        });
      }

      await this.sendEmbed(channelId, embed);

      logger.info('Discord ticket notification sent', {
        action: 'discord_ticket_notification',
        ticketNumber,
        ticketType,
        channelId
      });
    } catch (error) {
      logger.error('Failed to send Discord ticket notification', {
        action: 'discord_ticket_notification_error',
        error: error instanceof Error ? error.message : 'Unknown error',
        ticketNumber,
        ticketType
      });
    }
  }
}

export default DiscordNotificationService;

