import { Message, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { rankMatcher } from '../services/rankMatcher';
import { roleManager } from '../services/roleManager';
import { databaseService } from '../services/database';
import { logger } from '../services/logger';
import { dmCleanupService } from '../services/dmCleanup';
import path from 'path';
import { VerificationStatus } from '@prisma/client';
import { verificationAuditService } from '../services/verificationAudit';
import { processImage } from '../services/imageProcessor';
import { screenshotLockService, ScreenshotLockConflictError } from '../services/screenshotLock';
import { accountPortalSync } from '../services/accountPortalSync';

const envRankChannelId = process.env.VERIFICATION_RANK_CHANNEL_ID || process.env.RANK_CHANNEL_ID;
if (!envRankChannelId) {
  throw new Error('RANK_CHANNEL_ID environment variable is required');
}
const RANK_CHANNEL_ID = envRankChannelId;
const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

/**
 * Send DM to user with verification confirmation
 */
type VerificationDMOptions = {
  rankName: string;
  levelMin: number;
  uniqueId?: string | null;
  attachmentUrl?: string | null;
  attachmentFile?: {
    data: Buffer;
    name: string;
    contentType: string;
  } | null;
  profileUrl?: string;
};

async function sendVerificationDM(
  userId: string,
  options: VerificationDMOptions & { levelDetected: number },
): Promise<void> {
  try {
    const client = (global as any).client;
    if (!client) {
      logger.warn('Discord client not available for DM', { user_id: userId });
      return;
    }
    const user = await client.users.fetch(userId);
    if (!user) {
      logger.warn('User not found for DM', { user_id: userId });
      return;
    }

    const { rankName, levelDetected, uniqueId, attachmentUrl, attachmentFile } = options;
    const displayUniqueId =
      uniqueId && uniqueId.length > 0 ? formatUniqueIdForDisplay(uniqueId) : null;

    const embed = new EmbedBuilder()
      .setTitle('✅ Rank Verification Successful')
      .setDescription(
        [
          `Your 8 Ball Pool rank has been verified as **${rankName}** (Level ${levelDetected}).`,
          'Your Discord role has been updated successfully.',
        ].join('\n\n'),
      )
      .setColor(0x00AE86)
      .setTimestamp();

    if (uniqueId) {
      embed.addFields({
        name: '8BP Unique ID',
        value: `\`${displayUniqueId ?? uniqueId}\``,
        inline: false,
      });
    }

    // Get public URL for user-facing links (not internal Docker URLs)
    // PUBLIC_URL already includes /8bp-rewards path, so don't append it again
    const publicUrl = process.env.PUBLIC_URL || process.env.APP_URL || 'https://8ballpool.website';
    const baseUrl = publicUrl.endsWith('/8bp-rewards') ? publicUrl : `${publicUrl}/8bp-rewards`;
    const registrationUrl = `${baseUrl}/register`;
    
    const fields = [
      {
        name: '🎁 Auto-Claim Rewards',
        value:
          [
            'Register for automatic rewards claiming for free if you haven\'t already.',
            '',
            '**8BP Rewards Registration:**',
            registrationUrl,
          ].join('\n'),
        inline: false,
      },
    ];

    // Add profile URL if available
    if (options.profileUrl) {
      fields.push({
        name: '👤 View Your Profile',
        value: `[View your accounts profile](${options.profileUrl})`,
        inline: false,
      });
    }

    fields.push({
      name: '🔗 Link Your Account',
      value: [
        'Link your Discord to your 8 Ball Pool Unique ID with the slash command:',
        '',
        '`/link-account`',
      ].join('\n'),
      inline: false,
    });

    embed.addFields(fields);

    let files: AttachmentBuilder[] | undefined;
    if (attachmentFile) {
      embed.setImage(`attachment://${attachmentFile.name}`);
      files = [
        new AttachmentBuilder(attachmentFile.data, {
          name: attachmentFile.name,
          description: 'Verified screenshot',
        }),
      ];
    } else if (attachmentUrl) {
      embed.setImage(attachmentUrl);
    }

    const sentMessage = await user.send({ embeds: [embed], files });
    logger.info('Verification DM sent', { user_id: userId, rank_name: rankName });
    
    // Schedule message for deletion after 30 minutes
    if (sentMessage) {
      dmCleanupService.scheduleDeletion(sentMessage);
    }
  } catch (error) {
    // User may have DMs disabled
    logger.warn('Failed to send verification DM', { error, user_id: userId });
  }
}

function formatUniqueIdForDisplay(uniqueId: string): string {
  const digits = uniqueId.replace(/\D/g, '');
  if (digits.length <= 3) {
    return digits;
  }

  const groups: string[] = [];
  let index = 0;

  while (digits.length - index > 4) {
    groups.push(digits.slice(index, index + 3));
    index += 3;
  }

  const remaining = digits.length - index;
  if (remaining === 4) {
    groups.push(digits.slice(index, index + 3));
    groups.push(digits.slice(index + 3));
  } else {
    groups.push(digits.slice(index));
  }

  return groups.join('-');
}

/**
 * Send error DM to user
 */
async function sendErrorDM(userId: string, message: string): Promise<void> {
  try {
    const client = (global as any).client;
    if (!client) {
      return;
    }
    const user = await client.users.fetch(userId);
    if (!user) {
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('❌ Verification Failed')
      .setDescription(message)
      .setColor(0xe74c3c)
      .setTimestamp()
      .addFields({
        name: 'Need help?',
        value: 'Double-check the pinned instructions in the verification channel or ping a staff member for assistance.',
      });

    const sentMessage = await user.send({ embeds: [embed] });
    
    // Schedule message for deletion after 30 minutes
    if (sentMessage) {
      dmCleanupService.scheduleDeletion(sentMessage);
    }
  } catch (error) {
    // User may have DMs disabled - that's okay for error messages
    logger.debug('Failed to send error DM', { error, user_id: userId });
  }
}

/**
 * Handle message create event
 */
export async function handleMessageCreate(message: Message): Promise<void> {
  // Ignore bot messages
  if (message.author.bot) {
    return;
  }

  // Debug: Log all messages in the rank channel
  if (message.channel.id === RANK_CHANNEL_ID) {
    logger.debug('Message received in rank channel', {
      channel_id: message.channel.id,
      user_id: message.author.id,
      username: message.author.username,
      has_attachments: message.attachments.size > 0,
      attachment_count: message.attachments.size,
    });
  }

  // Only process messages in the rank verification channel
  if (message.channel.id !== RANK_CHANNEL_ID) {
    return;
  }

  const startedAt = Date.now();

  // Only process messages with image attachments
  const imageAttachments = message.attachments.filter(attachment => {
    const ext = path.extname(attachment.url).toLowerCase();
    const contentType = attachment.contentType || '';
    const isImage = ALLOWED_IMAGE_EXTENSIONS.includes(ext) || contentType.startsWith('image/');
    
    logger.debug('Checking attachment', {
      url: attachment.url,
      extension: ext,
      content_type: contentType,
      is_image: isImage,
      filename: attachment.name,
    });
    
    return isImage;
  });

  logger.debug('Image attachment filter result', {
    total_attachments: message.attachments.size,
    image_attachments: imageAttachments.size,
  });

  if (imageAttachments.size === 0) {
    logger.debug('No image attachments found, skipping message');
    return;
  }

  logger.info('Processing image(s) from user', {
    user_id: message.author.id,
    username: message.author.username,
    attachment_count: imageAttachments.size,
  });

  // Process all images and find the best match
  const results: Array<{
    success: boolean;
    rank?: any;
    level?: number;
    confidence?: number;
    isProfile?: boolean;
    ocrText?: string;
    screenshotHash?: string;
    uniqueId?: string | null;
    attachmentUrl: string;
    attachmentFile?: {
      data: Buffer;
      name: string;
      contentType: string;
    };
  }> = [];

  for (const attachment of imageAttachments.values()) {
    const result = await processImage({
      url: attachment.url,
      size: attachment.size,
      contentType: attachment.contentType,
      filename: attachment.name ?? null,
    });
    if (result.success && result.rank) {
      results.push({
        success: true,
        rank: result.rank,
        level: result.level,
        confidence: result.rank.confidence,
        isProfile: result.isProfile,
        ocrText: result.ocrText,
        screenshotHash: result.screenshotHash,
        uniqueId: result.uniqueId ?? null,
        attachmentUrl: result.attachmentUrl,
        attachmentFile: result.attachmentFile,
      });
    } else if (result.isProfile === false) {
      // Image was processed but is not a profile screenshot
      results.push({
        success: false,
        isProfile: false,
        screenshotHash: result.screenshotHash,
        attachmentUrl: result.attachmentUrl,
        attachmentFile: result.attachmentFile,
      });
    }
  }

  // Check if any images were invalid (not profile screenshots)
  const invalidImages = results.filter(r => r.isProfile === false);
  if (invalidImages.length > 0) {
    const firstInvalid = invalidImages[0];

    await sendErrorDM(
      message.author.id,
      "❌ Invalid format. Please upload a screenshot of your 8 Ball Pool **Profile** screen (showing your level, rank, and stats), not the main menu or other screens."
    );

    await logger.logAction({
      timestamp: new Date(),
      action_type: 'ocr_processed',
      user_id: message.author.id,
      username: message.author.username,
      success: false,
      error_message: 'Invalid image format - not a profile screenshot',
    });

    await verificationAuditService.recordEvent({
      userId: message.author.id,
      username: message.author.username,
      status: VerificationStatus.FAILURE,
      ocrUniqueId: firstInvalid?.uniqueId ?? null,
      screenshotHash: firstInvalid?.screenshotHash,
      attachmentUrl: firstInvalid?.attachmentUrl,
      attachmentFile: firstInvalid?.attachmentFile,
      messageId: message.id,
      reason: 'Invalid image format - not a profile screenshot',
    });

    // Delete the message
    try {
      await message.delete();
    } catch (error) {
      logger.warn('Failed to delete message after invalid format', { error });
    }

    return;
  }

  // If no successful matches, send error DM
  if (results.length === 0 || !results.some(r => r.success && r.rank)) {
    await sendErrorDM(
      message.author.id,
      "I couldn't read your screenshot clearly. Please upload a clearer image of your 8 Ball Pool profile showing your level and rank."
    );

    await logger.logAction({
      timestamp: new Date(),
      action_type: 'ocr_processed',
      user_id: message.author.id,
      username: message.author.username,
      success: false,
      error_message: 'OCR failed to extract rank information',
    });

    const firstAttempt = results[0];
    await verificationAuditService.recordEvent({
      userId: message.author.id,
      username: message.author.username,
      status: VerificationStatus.FAILURE,
      ocrUniqueId: firstAttempt?.uniqueId ?? null,
      screenshotHash: firstAttempt?.screenshotHash,
      attachmentUrl: firstAttempt?.attachmentUrl,
      attachmentFile: firstAttempt?.attachmentFile,
      messageId: message.id,
      reason: 'OCR failed to extract rank information',
    });

    // Delete the message
    try {
      await message.delete();
    } catch (error) {
      logger.warn('Failed to delete message after OCR failure', { error });
    }

    return;
  }

  // Find the best match (highest confidence)
  const bestMatch = results.reduce((best, current) => {
    if (!best || (current.confidence && current.confidence > (best.confidence || 0))) {
      return current;
    }
    return best;
  });

  if (!bestMatch.rank) {
    return;
  }

  const matchedRank = bestMatch.rank;
  let levelDetected = bestMatch.level ?? matchedRank.level_min;
  if (bestMatch.rank.level_extracted_from_image !== undefined && bestMatch.rank.level_extracted_from_image !== null) {
    levelDetected = bestMatch.rank.level_extracted_from_image;
  }

  const levelOrigin =
    bestMatch.rank.level_extracted_from_image !== undefined && bestMatch.rank.level_extracted_from_image !== null
      ? 'vision-api'
      : bestMatch.level !== undefined && bestMatch.level !== null
      ? 'vision-api'
      : 'rank-fallback';

  logger.info('Level selection summary', {
    user_id: message.author.id,
    level_detected: levelDetected,
    level_origin: levelOrigin,
    level_from_image: bestMatch.rank.level_extracted_from_image ?? null,
    level_from_text: bestMatch.level ?? null,
    rank_bounds: { min: matchedRank.level_min, max: matchedRank.level_max },
  });
  if (levelDetected < matchedRank.level_min) {
    logger.debug('Adjusted detected level up to minimum bound', {
      original_level: levelDetected,
      level_min: matchedRank.level_min,
    });
    levelDetected = matchedRank.level_min;
  } else if (matchedRank.level_max && levelDetected > matchedRank.level_max) {
    logger.debug('Adjusted detected level down to maximum bound', {
      original_level: levelDetected,
      level_max: matchedRank.level_max,
    });
    levelDetected = matchedRank.level_max;
  }
  const screenshotHash = bestMatch.screenshotHash;
  const uniqueId = bestMatch.uniqueId ?? null;
  if (!screenshotHash) {
    logger.error('Screenshot hash missing for processed image', { user_id: message.author.id });
    return;
  }

  try {
    await screenshotLockService.verifyLock({
      userId: message.author.id,
      screenshotHash,
      uniqueId,
    });
  } catch (conflictError) {
    if (conflictError instanceof ScreenshotLockConflictError) {
      logger.warn('Screenshot lock conflict detected', {
        reason: conflictError.reason,
        conflicting_user_id: conflictError.conflictUserId,
        current_user: message.author.id,
      });

      await sendErrorDM(
        message.author.id,
        '❌ This screenshot or 8 Ball Pool ID is already linked to another Discord user.'
      );

      const reasonText =
        conflictError.reason === 'HASH_CONFLICT'
          ? 'Screenshot hash already linked to another user'
          : 'OCR unique ID already linked to another user';

      await logger.logAction({
        timestamp: new Date(),
        action_type: 'ocr_processed',
        user_id: message.author.id,
        username: message.author.username,
        success: false,
        error_message: reasonText,
      });

      await verificationAuditService.recordEvent({
        userId: message.author.id,
        username: message.author.username,
        status: VerificationStatus.FAILURE,
        ocrUniqueId: uniqueId,
        screenshotHash,
        attachmentUrl: bestMatch.attachmentUrl,
      attachmentFile: bestMatch.attachmentFile,
        messageId: message.id,
        reason: reasonText,
      });

      try {
        await message.delete();
      } catch (error) {
        logger.warn('Failed to delete message after screenshot lock conflict', { error });
      }

      return;
    }

    logger.error('Error during screenshot conflict checks', { conflictError });
    await sendErrorDM(
      message.author.id,
      '❌ An internal error occurred while verifying your screenshot. Please try again later.'
    );
    return;
  }

  try {
    // Get guild member
    const member = await message.guild?.members.fetch(message.author.id);
    if (!member) {
      logger.error('Member not found in guild', { user_id: message.author.id, guild_id: message.guild?.id });
      return;
    }

    // Check if user already has a higher rank
    const existingVerification = await databaseService.getVerification(message.author.id);
    if (existingVerification) {
      const existingRank = rankMatcher.getRankByName(existingVerification.rank_name);
      if (existingRank && existingRank.level_min > matchedRank.level_min) {
        // User already has a higher rank, ignore this verification
        logger.info('User already has higher rank, ignoring', {
          user_id: message.author.id,
          existing_rank: existingVerification.rank_name,
          new_rank: matchedRank.rank_name,
        });

        // Delete the message
        try {
          await message.delete();
        } catch (error) {
          logger.warn('Failed to delete message', { error });
        }

        return;
      }
    }

    // Assign role
    await roleManager.assignRankRole(member, {
      role_id: matchedRank.role_id,
      rank_name: matchedRank.rank_name,
      level_min: matchedRank.level_min,
      level_max: matchedRank.level_max,
    });

    // Update database
    await databaseService.upsertVerification({
      discord_id: message.author.id,
      username: message.author.username,
      rank_name: matchedRank.rank_name,
      level_detected: levelDetected,
      role_id_assigned: matchedRank.role_id,
    });

    await screenshotLockService.upsertLock({
      userId: message.author.id,
      screenshotHash,
      uniqueId,
    });

    // Log action
    await logger.logAction({
      timestamp: new Date(),
      action_type: 'verification_updated',
      user_id: message.author.id,
      username: message.author.username,
      rank_name: matchedRank.rank_name,
      level_detected: levelDetected,
      role_id_assigned: matchedRank.role_id,
      success: true,
    });

    await verificationAuditService.recordEvent({
      userId: message.author.id,
      username: message.author.username,
      status: VerificationStatus.SUCCESS,
      confidence: matchedRank.confidence,
      ocrUniqueId: uniqueId,
      screenshotHash,
      attachmentUrl: bestMatch.attachmentUrl,
      attachmentFile: bestMatch.attachmentFile,
      messageId: message.id,
      processingTimeMs: Date.now() - startedAt,
      metadata: {
        rank_name: matchedRank.rank_name,
        level_detected: levelDetected,
        sendToPublicChannel: false,
      },
    });

    // Sync to accounts portal
    if (uniqueId) {
      await accountPortalSync.syncAccount({
        discord_id: message.author.id,
        username: message.author.username,
        unique_id: uniqueId,
        level: levelDetected,
        rank_name: matchedRank.rank_name,
        avatar_url: message.author.avatarURL(),
        metadata: {
          rank_min: matchedRank.level_min,
          rank_max: matchedRank.level_max,
          confidence: matchedRank.confidence,
        },
      });
    }

    // Generate profile URL
    const profileUrl = accountPortalSync.generateProfileUrl(message.author.id, uniqueId || undefined);

    // Send DM confirmation
    await sendVerificationDM(message.author.id, {
      rankName: matchedRank.rank_name,
      levelMin: matchedRank.level_min,
      levelDetected,
      uniqueId,
      attachmentUrl: bestMatch.attachmentUrl,
      attachmentFile: bestMatch.attachmentFile ?? null,
      profileUrl,
    });

    // Delete the processed screenshot
    try {
      await message.delete();
      logger.info('Message deleted after successful processing', { message_id: message.id });
    } catch (error) {
      logger.warn('Failed to delete message after processing', { error, message_id: message.id });
    }
  } catch (error) {
    logger.error('Error in verification process', {
      error,
      user_id: message.author.id,
      username: message.author.username,
      rank_name: matchedRank.rank_name,
    });

    // Send error DM to user
    await sendErrorDM(
      message.author.id,
      "An error occurred while processing your verification. Please try again or contact an administrator."
    );

    // Log error
    await logger.logAction({
      timestamp: new Date(),
      action_type: 'error',
      user_id: message.author.id,
      username: message.author.username,
      success: false,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });

    await verificationAuditService.recordEvent({
      userId: message.author.id,
      username: message.author.username,
      status: VerificationStatus.FAILURE,
      confidence: matchedRank.confidence,
      ocrUniqueId: uniqueId,
      screenshotHash,
      attachmentUrl: bestMatch.attachmentUrl,
      attachmentFile: bestMatch.attachmentFile,
      messageId: message.id,
      processingTimeMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.message : 'Unexpected verification error',
    });
  }
}

