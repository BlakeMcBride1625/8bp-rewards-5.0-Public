import { AttachmentBuilder, EmbedBuilder, TextChannel } from 'discord.js';
import { VerificationStatus } from '@prisma/client';
import { databaseService } from './database';
import { metricsService } from './metrics';
import { logger } from './logger';

type VerificationEventInput = {
  userId: string;
  username: string;
  status: VerificationStatus;
  confidence?: number | null;
  ocrUniqueId?: string | null;
  screenshotHash?: string | null;
  messageId?: string | null;
  attachmentUrl?: string | null;
  attachmentFile?: {
    data: Buffer;
    name: string;
    contentType?: string;
  } | null;
  processingTimeMs?: number;
  reason?: string;
  guildId?: string;
  channelId?: string;
  metadata?: Record<string, unknown>;
};

const STAFF_EVIDENCE_CHANNEL_ID = process.env.VERIFICATION_STAFF_EVIDENCE_CHANNEL_ID || process.env.STAFF_EVIDENCE_CHANNEL_ID;
if (!STAFF_EVIDENCE_CHANNEL_ID) {
  logger.warn('STAFF_EVIDENCE_CHANNEL_ID not set. Staff evidence logging will be skipped.');
}

class VerificationAuditService {
  async recordEvent(event: VerificationEventInput): Promise<void> {
    try {
      await databaseService.createVerificationEvent({
        discordUserId: event.userId,
        status: event.status,
        confidence: event.confidence ?? null,
        ocrUniqueId: event.ocrUniqueId ?? null,
        screenshotHash: event.screenshotHash ?? null,
        messageId: event.messageId ?? null,
        attachmentUrl: event.attachmentUrl ?? null,
        metadata: event.metadata,
      });

      metricsService.recordVerification(event.status, event.confidence ?? undefined);
    } catch (error) {
      logger.error('Failed to persist verification event', { error, event });
    }

    await this.sendEvidenceEmbed(event);
  }

  private buildEmbed(event: VerificationEventInput): EmbedBuilder {
    const statusEmoji =
      event.status === 'SUCCESS' ? '✅' : event.status === 'FAILURE' ? '❌' : '⚠️';

    const embed = new EmbedBuilder()
      .setTitle('Verification Event')
      .setColor(event.status === 'SUCCESS' ? 0x2ecc71 : event.status === 'FAILURE' ? 0xe74c3c : 0xf1c40f)
      .addFields(
        { name: 'User', value: `<@${event.userId}> (${event.userId})`, inline: false },
        {
          name: 'Status',
          value: `${statusEmoji} ${event.status.replace('_', ' ')}`,
          inline: true,
        },
      )
      .setTimestamp(new Date());

    if (event.ocrUniqueId) {
      embed.addFields({
        name: '8BP Unique ID',
        value: event.ocrUniqueId,
        inline: true,
      });
    }

    if (typeof event.confidence === 'number') {
      embed.addFields({
        name: 'Confidence',
        value: `${Math.round(event.confidence * 100)}%`,
        inline: true,
      });
    }

    if (event.processingTimeMs !== undefined) {
      embed.setFooter({
        text: `Processing time: ${event.processingTimeMs}ms${event.messageId ? ` • Message ${event.messageId}` : ''}`,
      });
    } else if (event.messageId) {
      embed.setFooter({ text: `Message ${event.messageId}` });
    }

    if (event.attachmentFile) {
      embed.setImage(`attachment://${event.attachmentFile.name}`);
    } else if (event.attachmentUrl) {
      embed.setImage(event.attachmentUrl);
    }

    if (event.reason) {
      embed.addFields({ name: 'Notes', value: event.reason, inline: false });
    }

    return embed;
  }

  private async sendEvidenceEmbed(event: VerificationEventInput): Promise<void> {
    try {
      const client = (global as any).client;
      if (!client) {
        logger.warn('Client not available for evidence logging');
        return;
      }

      const embed = this.buildEmbed(event);
      const files = event.attachmentFile
        ? [
            new AttachmentBuilder(event.attachmentFile.data, {
              name: event.attachmentFile.name,
              description: 'Uploaded verification screenshot',
            }),
          ]
        : undefined;

      // Always send to staff channel if configured
      if (STAFF_EVIDENCE_CHANNEL_ID) {
        logger.debug('Posting verification event to staff channel', {
          user_id: event.userId,
          channel_id: STAFF_EVIDENCE_CHANNEL_ID,
          status: event.status,
        });
        await this.sendToChannel(client, STAFF_EVIDENCE_CHANNEL_ID, embed, files, 'staff');
      }

      // Public logging disabled to ensure staff-only visibility.
    } catch (error) {
      logger.error('Failed to send verification evidence embed', { error });
    }
  }

  private async sendToChannel(
    client: any,
    channelId: string,
    embed: EmbedBuilder,
    files: AttachmentBuilder[] | undefined,
    label: 'public' | 'staff',
  ): Promise<void> {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        logger.warn('Evidence channel not found or not text based', { channelId, label });
        return;
      }

      await (channel as TextChannel).send({ embeds: [embed], files });
    } catch (error: any) {
      logger.warn('Failed to send evidence embed', {
        channelId,
        label,
        error: error?.message ?? error,
      });
    }
  }
}

export const verificationAuditService = new VerificationAuditService();


