import axios from 'axios';
import { logger } from './LoggerService';

export interface TelegramMessage {
  id?: string;
  chatId: string;
  text: string;
  timestamp?: Date;
}

export interface TelegramUser {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

interface TelegramApiResponse {
  ok: boolean;
  result?: {
    message_id?: number;
    username?: string;
    id?: number;
  };
  description?: string;
}

export default class TelegramNotificationService {
  private botToken: string;
  private apiUrl: string;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
    
    if (!this.botToken) {
      logger.warn('Telegram bot token not configured', {
        action: 'telegram_service_init',
        error: 'TELEGRAM_BOT_TOKEN not set'
      });
    }
  }

  /**
   * Send a direct message to a user via Telegram
   */
  async sendDirectMessage(userId: string, message: string): Promise<TelegramMessage | null> {
    try {
      if (!this.botToken) {
        throw new Error('Telegram bot token not configured');
      }

      const response = await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: userId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });

      const result = response.data as TelegramApiResponse;
      
      if (!result.ok) {
        throw new Error(`Telegram API error: ${result.description || 'Unknown error'}`);
      }
      
      logger.info('Telegram message sent successfully', {
        action: 'telegram_dm_sent',
        userId,
        messageId: result.result?.message_id,
        timestamp: new Date().toISOString()
      });

      return {
        id: result.result?.message_id?.toString(),
        chatId: userId,
        text: message,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to send Telegram message', {
        action: 'telegram_dm_error',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      return null;
    }
  }

  /**
   * Send a message to a Telegram channel
   */
  async sendToChannel(channelId: string, message: string): Promise<TelegramMessage | null> {
    try {
      if (!this.botToken) {
        throw new Error('Telegram bot token not configured');
      }

      const response = await fetch(`${this.apiUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: channelId,
          text: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as TelegramApiResponse;
        throw new Error(`Telegram API error: ${errorData.description || response.statusText}`);
      }

      const result = await response.json() as TelegramApiResponse;
      
      logger.info('Telegram channel message sent successfully', {
        action: 'telegram_channel_sent',
        channelId,
        messageId: result.result?.message_id,
        timestamp: new Date().toISOString()
      });

      return {
        id: result.result?.message_id?.toString(),
        chatId: channelId,
        text: message,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to send Telegram channel message', {
        action: 'telegram_channel_error',
        channelId,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      return null;
    }
  }

  /**
   * Delete a message from Telegram
   */
  async deleteMessage(chatId: string, messageId: string): Promise<boolean> {
    try {
      if (!this.botToken) {
        throw new Error('Telegram bot token not configured');
      }

      const response = await axios.post(`${this.apiUrl}/deleteMessage`, {
        chat_id: chatId,
        message_id: parseInt(messageId)
      });

      const result = response.data as TelegramApiResponse;
      
      if (!result.ok) {
        // Don't throw error for message deletion failures (message might already be deleted)
        logger.warn('Failed to delete Telegram message', {
          action: 'telegram_delete_message_error',
          chatId,
          messageId,
          error: result.description || 'Unknown error'
        });
        return false;
      }

      logger.info('Telegram message deleted successfully', {
        action: 'telegram_message_deleted',
        chatId,
        messageId,
        timestamp: new Date().toISOString()
      });

      return true;

    } catch (error) {
      logger.warn('Failed to delete Telegram message', {
        action: 'telegram_delete_error',
        chatId,
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Get bot information
   */
  async getBotInfo(): Promise<any> {
    try {
      if (!this.botToken) {
        throw new Error('Telegram bot token not configured');
      }

      const response = await fetch(`${this.apiUrl}/getMe`);
      
      if (!response.ok) {
        const errorData = await response.json() as TelegramApiResponse;
        throw new Error(`Telegram API error: ${errorData.description || response.statusText}`);
      }

      const result = await response.json() as TelegramApiResponse;
      
      logger.info('Telegram bot info retrieved', {
        action: 'telegram_bot_info',
        botUsername: result.result?.username,
        botId: result.result?.id,
        timestamp: new Date().toISOString()
      });

      return result.result;

    } catch (error) {
      logger.error('Failed to get Telegram bot info', {
        action: 'telegram_bot_info_error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Test Telegram connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      const botInfo = await this.getBotInfo();
      return botInfo !== null;
    } catch (error) {
      logger.error('Telegram connection test failed', {
        action: 'telegram_connection_test_error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
}