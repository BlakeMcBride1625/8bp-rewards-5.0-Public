import { Message, User } from 'discord.js';
import { logger } from './logger';
import { metricsService } from './metrics';

interface ScheduledDeletion {
  messageId: string;
  channelId: string;
  deleteAt: number;
  timeout: NodeJS.Timeout;
}

class DMCleanupService {
  private scheduledDeletions: Map<string, ScheduledDeletion> = new Map();
  private readonly DELETE_AFTER_MS = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_USERS_PER_MINUTE = 10;
  private rateLimitWindowStart = 0;
  private processedThisWindow = 0;

  /**
   * Schedule a DM message for deletion after 30 minutes
   */
  scheduleDeletion(message: Message): void {
    if (!message.channel.isDMBased()) {
      return; // Only schedule DMs
    }

    const messageId = message.id;
    const channelId = message.channel.id;
    const deleteAt = Date.now() + this.DELETE_AFTER_MS;

    // Cancel existing deletion if any
    this.cancelDeletion(messageId);

    const timeout = setTimeout(async () => {
      try {
        await message.delete();
        logger.info('Scheduled DM message deleted', {
          message_id: messageId,
          channel_id: channelId,
        });
        this.scheduledDeletions.delete(messageId);
      } catch (error) {
        logger.warn('Failed to delete scheduled DM message', {
          error,
          message_id: messageId,
          channel_id: channelId,
        });
        this.scheduledDeletions.delete(messageId);
      }
    }, this.DELETE_AFTER_MS);

    this.scheduledDeletions.set(messageId, {
      messageId,
      channelId,
      deleteAt,
      timeout,
    });

    logger.debug('DM message scheduled for deletion', {
      message_id: messageId,
      channel_id: channelId,
      delete_at: new Date(deleteAt).toISOString(),
    });
  }

  /**
   * Cancel a scheduled deletion
   */
  cancelDeletion(messageId: string): void {
    const scheduled = this.scheduledDeletions.get(messageId);
    if (scheduled) {
      clearTimeout(scheduled.timeout);
      this.scheduledDeletions.delete(messageId);
    }
  }

  /**
   * Attempt to consume a rate limit token for DM cleanup operations.
   */
  private tryConsumeRateToken(): boolean {
    const now = Date.now();

    if (now - this.rateLimitWindowStart >= 60_000) {
      this.rateLimitWindowStart = now;
      this.processedThisWindow = 0;
    }

    if (this.processedThisWindow >= this.MAX_USERS_PER_MINUTE) {
      return false;
    }

    this.processedThisWindow += 1;
    return true;
  }

  /**
   * Delete bot DM messages for a subset of users.
   * Throttled to avoid rate limits (approximately 10 users per minute).
   */
  async cleanupBotDMs(options: {
    maxUsers?: number;
    activeWithinMinutes?: number;
  } = {}): Promise<{
    processedUsers: number;
    deletedMessages: number;
    skippedInactive: number;
    skippedRateLimit: number;
    errors: number;
  }> {
    try {
      const client = (global as any).client;
      if (!client || !client.user) {
        logger.warn('Client not available for DM cleanup');
        return {
          processedUsers: 0,
          deletedMessages: 0,
          skippedInactive: 0,
          skippedRateLimit: 0,
          errors: 0,
        };
      }

      const maxUsers = options.maxUsers ?? this.MAX_USERS_PER_MINUTE;
      const activeWithinMinutes = options.activeWithinMinutes;
      const activeSince =
        typeof activeWithinMinutes === 'number'
          ? Date.now() - activeWithinMinutes * 60_000
          : null;

      logger.info('Starting targeted DM cleanup', {
        max_users: maxUsers,
        active_within_minutes: activeWithinMinutes ?? 'all',
      });

      const users = client.users.cache.filter((user: User) => !user.bot);

      let processedUsers = 0;
      let deletedMessages = 0;
      let skippedInactive = 0;
      let skippedRateLimit = 0;
      let errors = 0;
      
      for (const [userId, user] of users) {
        if (processedUsers >= maxUsers) {
          break;
        }

        // Respect rate limit window
        if (!this.tryConsumeRateToken()) {
          skippedRateLimit += 1;
          logger.warn('DM cleanup rate limit reached', {
            processed_this_window: this.processedThisWindow,
          });
          metricsService.incrementRateLimitHits(1);
          break;
        }

        try {
          // Try to get or create DM channel
          const dmChannel = await user.createDM();
          
          // Fetch messages from the DM channel
          const messages = await dmChannel.messages.fetch({ limit: 50 });

          if (messages.size === 0) {
            skippedInactive += 1;
            continue;
          }

          // Optionally skip users without recent activity
          if (activeSince !== null) {
            let mostRecent = 0;
            for (const message of messages.values()) {
              const timestamp = message.createdTimestamp ?? 0;
              if (timestamp > mostRecent) {
                mostRecent = timestamp;
              }
            }
            if (!mostRecent || mostRecent < activeSince) {
              skippedInactive += 1;
              continue;
            }
          }

          processedUsers += 1;
          
          // Filter for bot messages
          const botMessages = messages.filter(
            (msg: Message) => msg.author.id === client.user.id,
          );

          for (const [messageId, message] of botMessages) {
            try {
              await message.delete();
              deletedMessages += 1;
              logger.debug('Deleted bot DM message', {
                message_id: messageId,
                channel_id: dmChannel.id,
                user_id: userId,
              });
              // Small delay to avoid hitting hard rate limits
              await new Promise((resolve) => setTimeout(resolve, 200));
            } catch (error: any) {
              if (error.code !== 10008) {
                errors += 1;
                logger.debug('Failed to delete bot DM message', {
                  error: error.message,
                  message_id: messageId,
                  channel_id: dmChannel.id,
                });
              }
            }
          }
        } catch (error: any) {
          errors += 1;
          if (error.code === 50007) {
            logger.debug('Cannot send messages to user (potentially disabled DMs)', {
              user_id: userId,
            });
          } else {
            logger.debug('Failed to access DM channel for user', {
              error: error.message ?? error,
              user_id: userId,
            });
          }
        }
      }

      logger.info('DM cleanup completed', {
        processed_users: processedUsers,
        deleted_messages: deletedMessages,
        skipped_inactive: skippedInactive,
        skipped_rate_limit: skippedRateLimit,
        errors,
      });

      if (processedUsers > 0) {
        metricsService.incrementDmCleanup(processedUsers);
      }

      return {
        processedUsers,
        deletedMessages,
        skippedInactive,
        skippedRateLimit,
        errors,
      };
    } catch (error) {
      logger.error('Error during DM cleanup', { error });
      throw error;
    }
  }

  /**
   * Cleanup scheduled deletions on shutdown
   */
  cleanup(): void {
    for (const [, scheduled] of this.scheduledDeletions) {
      clearTimeout(scheduled.timeout);
    }
    this.scheduledDeletions.clear();
    logger.info('DM cleanup service cleaned up');
  }
}

export const dmCleanupService = new DMCleanupService();

