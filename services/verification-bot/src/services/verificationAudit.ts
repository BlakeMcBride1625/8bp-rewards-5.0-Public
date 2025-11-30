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

    // Extract metadata
    const metadata = event.metadata || {};
    const levelDetected = metadata.level_detected as number | undefined;
    const rankName = metadata.rank_name as string | undefined;
    const accountUsername = metadata.account_username as string | undefined; // 8BP account username
    const username = event.username || 'Unknown'; // Discord username

    // Comprehensive debug logging
    logger.info('🔨 Building Discord embed with metadata', {
      user_id: event.userId,
      discord_username: username,
      levelDetected,
      levelDetected_type: typeof levelDetected,
      rankName,
      rankName_type: typeof rankName,
      accountUsername,
      accountUsername_type: typeof accountUsername,
      hasLevel: levelDetected !== undefined && levelDetected !== null,
      hasRank: !!rankName && rankName !== 'UNKNOWN',
      hasUsername: !!accountUsername && accountUsername !== 'UNKNOWN',
      full_metadata: metadata,
    });

    // Format unique ID for display (similar to DM format)
    const formatUniqueIdForDisplay = (uniqueId: string): string => {
      const digits = uniqueId.replace(/\D/g, '');
      if (digits.length <= 3) {
        return digits;
      }
      // Format as XXX-XXX-XXX-X
      const parts: string[] = [];
      for (let i = 0; i < digits.length; i += 3) {
        if (i + 3 < digits.length) {
          parts.push(digits.substring(i, i + 3));
        } else {
          parts.push(digits.substring(i));
        }
      }
      return parts.join('-');
    };

    const embed = new EmbedBuilder()
      .setTitle(`${statusEmoji} Verification ${event.status === 'SUCCESS' ? 'Successful' : event.status === 'FAILURE' ? 'Failed' : 'Pending Review'}`)
      .setColor(event.status === 'SUCCESS' ? 0x2ecc71 : event.status === 'FAILURE' ? 0xe74c3c : 0xf1c40f)
      .addFields(
        { name: 'User', value: `<@${event.userId}> (${username})`, inline: false },
        {
          name: 'Status',
          value: `${statusEmoji} ${event.status.replace('_', ' ')}`,
          inline: true,
        },
      )
      .setTimestamp(new Date());

    // Add 8BP account username if available
    if (accountUsername && accountUsername !== 'UNKNOWN' && accountUsername.trim() !== '') {
      embed.addFields({
        name: '8BP Account Username',
        value: accountUsername,
        inline: false,
      });
      logger.info('✅ Added 8BP Account Username field to embed', { username: accountUsername });
    } else {
      logger.warn('⚠️ 8BP Account Username NOT added to embed', {
        accountUsername,
        is_undefined: accountUsername === undefined,
        is_unknown: accountUsername === 'UNKNOWN',
        is_empty: accountUsername?.trim() === '',
      });
    }

    // Add unique ID field (formatted like DM)
    if (event.ocrUniqueId) {
      const displayUniqueId = formatUniqueIdForDisplay(event.ocrUniqueId);
      embed.addFields({
        name: '8BP Unique ID',
        value: `\`${displayUniqueId}\``,
        inline: false,
      });
    }

    // Add level field - always show if available
    if (levelDetected !== undefined && levelDetected !== null && typeof levelDetected === 'number') {
      embed.addFields({
        name: 'Level',
        value: `Level ${levelDetected}`,
        inline: true,
      });
      logger.info('✅ Added Level field to embed', { level: levelDetected });
    } else {
      logger.error('❌ Level NOT added to embed - value is invalid', { 
        levelDetected, 
        type: typeof levelDetected,
        is_undefined: levelDetected === undefined,
        is_null: levelDetected === null,
      });
    }

    // Add gamer rank field - always show if available
    if (rankName && rankName.trim() !== '' && rankName !== 'UNKNOWN') {
      embed.addFields({
        name: 'Gamer Rank',
        value: rankName,
        inline: true,
      });
      logger.info('✅ Added Gamer Rank field to embed', { rank: rankName });
    } else {
      logger.error('❌ Rank NOT added to embed - value is invalid', { 
        rankName, 
        type: typeof rankName,
        is_empty: !rankName,
        is_unknown: rankName === 'UNKNOWN',
        trimmed: rankName?.trim(),
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
        logger.error('❌ Discord client not available for evidence logging', {
          user_id: event.userId,
        });
        return;
      }

      logger.info('📤 Building embed for Discord channel', {
        user_id: event.userId,
        status: event.status,
        has_metadata: !!event.metadata,
        metadata_keys: event.metadata ? Object.keys(event.metadata) : [],
      });

      const embed = this.buildEmbed(event);
      
      // Log embed fields for debugging
      const embedFields = embed.data.fields || [];
      logger.info('📋 Embed fields prepared', {
        user_id: event.userId,
        field_count: embedFields.length,
        field_names: embedFields.map(f => f.name),
      });

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
        logger.info('📨 Posting verification event to staff channel', {
          user_id: event.userId,
          channel_id: STAFF_EVIDENCE_CHANNEL_ID,
          status: event.status,
          embed_field_count: embedFields.length,
          has_attachment: !!files,
        });
        await this.sendToChannel(client, STAFF_EVIDENCE_CHANNEL_ID, embed, files, 'staff');
        logger.info('✅ Verification embed sent to Discord channel', {
          user_id: event.userId,
          channel_id: STAFF_EVIDENCE_CHANNEL_ID,
        });
      } else {
        logger.warn('⚠️ STAFF_EVIDENCE_CHANNEL_ID not configured - embed not sent', {
          user_id: event.userId,
        });
      }

      // Public logging disabled to ensure staff-only visibility.
    } catch (error) {
      logger.error('❌ Failed to send verification evidence embed', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        user_id: event.userId,
      });
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
      logger.debug('Fetching Discord channel', { channelId, label });
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        logger.error('❌ Evidence channel not found or not text based', { 
          channelId, 
          label,
          channel_exists: !!channel,
          is_text_based: channel?.isTextBased?.() || false,
        });
        return;
      }

      logger.debug('Sending embed to Discord channel', {
        channelId,
        label,
        embed_field_count: embed.data.fields?.length || 0,
        has_files: !!files,
      });

      const sentMessage = await (channel as TextChannel).send({ embeds: [embed], files });
      
      logger.info('✅ Evidence embed sent successfully', {
        channelId,
        label,
        message_id: sentMessage.id,
        embed_field_count: embed.data.fields?.length || 0,
      });
    } catch (error: any) {
      logger.error('❌ Failed to send evidence embed to Discord', {
        channelId,
        label,
        error: error?.message ?? error,
        error_code: error?.code,
        error_stack: error?.stack,
      });
    }
  }
}

export const verificationAuditService = new VerificationAuditService();


