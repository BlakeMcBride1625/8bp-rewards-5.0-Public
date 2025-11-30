import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
  EmbedBuilder,
  Attachment,
  AttachmentBuilder,
} from 'discord.js';
import { logger } from '../services/logger';
import { isAdmin } from './index';
import { dmCleanupService } from '../services/dmCleanup';
import { processImage } from '../services/imageProcessor';
import { screenshotLockService, ScreenshotLockConflictError } from '../services/screenshotLock';
import { databaseService } from '../services/database';
import { roleManager } from '../services/roleManager';
import { verificationAuditService } from '../services/verificationAudit';
import { VerificationStatus } from '@prisma/client';
import { metricsService } from '../services/metrics';

const COMMAND_DEFINITIONS = [
  new SlashCommandBuilder()
    .setName('dm-rm-rf')
    .setDescription('Delete all bot messages from all DMs (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('cleanup-dms')
    .setDescription('Clean up recent bot DM messages')
    .addIntegerOption((option) =>
      option
        .setName('active_minutes')
        .setDescription('Only include users active within the last N minutes')
        .setRequired(false)
        .setMinValue(5)
        .setMaxValue(1440),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
      .setName('recheck')
    .setDescription('Re-run OCR on a screenshot and update verification')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to re-verify')
        .setRequired(true),
      )
    .addAttachmentOption((option) =>
      option
        .setName('attachment')
        .setDescription('Screenshot attachment to analyze')
        .setRequired(false),
      )
    .addStringOption((option) =>
      option
        .setName('url')
        .setDescription('Screenshot URL (use if no attachment)')
        .setRequired(false),
      )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    new SlashCommandBuilder()
    .setName('unlink-screenshot')
    .setDescription('Remove screenshot lock for an 8 Ball Pool ID')
    .addStringOption((option) =>
      option
        .setName('unique_id')
        .setDescription('8 Ball Pool Unique ID to unlink')
        .setRequired(true),
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show verification metrics')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
];

export async function registerSlashCommands(clientId: string, token: string, guildId?: string): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);
  const body = COMMAND_DEFINITIONS.map((command) => command.toJSON());

  try {
    if (guildId) {
      logger.info(`Started refreshing ${body.length} application (/) commands for guild ${guildId}...`);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
      logger.info(`Successfully reloaded ${body.length} application (/) commands for guild ${guildId}.`);
    } else {
      logger.info(`Started refreshing ${body.length} application (/) commands globally...`);
      await rest.put(Routes.applicationCommands(clientId), { body });
      logger.info(`Successfully reloaded ${body.length} application (/) commands globally.`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error registering slash commands', { error: errorMessage, guildId });
    throw error;
  }
}

export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  // No autocomplete requirements for current commands.
  await interaction.respond([]);
  }

export async function handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const handler = COMMAND_HANDLERS[interaction.commandName];
  if (!handler) {
    if (!interaction.replied && !interaction.deferred) {
    await interaction.reply({
      content: '❌ Unknown command.',
      ephemeral: true,
    });
    }
    return;
  }

  try {
    // Set a timeout for command execution (30 seconds for verification commands which may take longer)
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Command execution timeout')), 30000);
    });

    await Promise.race([
      handler(interaction),
      timeoutPromise
    ]);
  } catch (error) {
    logger.error('Error executing slash command', {
      command: interaction.commandName,
      userId: interaction.user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Try to send error response if interaction hasn't been handled
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: '❌ An error occurred while executing this command. Please try again.',
          ephemeral: true,
        });
      } catch (replyError) {
        logger.error('Failed to send error reply', { error: replyError });
      }
    } else if (interaction.deferred && !interaction.replied) {
      try {
        await interaction.editReply({
          content: '❌ An error occurred while executing this command. Please try again.',
        });
      } catch (editError) {
        logger.error('Failed to edit error reply', { error: editError });
      }
    }
  }
}

type CommandHandler = (interaction: ChatInputCommandInteraction) => Promise<void>;

const COMMAND_HANDLERS: Record<string, CommandHandler> = {
  'dm-rm-rf': handleDmRmRfCommand,
  'cleanup-dms': handleCleanupDmsCommand,
  recheck: handleRecheckCommand,
  'unlink-screenshot': handleUnlinkScreenshotCommand,
  status: handleStatusCommand,
};

async function handleDmRmRfCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const hasPermission = isAdmin(interaction.user.id);

  if (!hasPermission) {
    await interaction.reply({
      content: '❌ Only administrators can use this command.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    logger.info('DM rm -rf command executed', {
      userId: interaction.user.id,
      username: interaction.user.username,
    });

    // Get the client from global (set in bot.ts)
    const client = (global as any).client;
    if (!client) {
      await interaction.editReply({
        content: '❌ Bot client not available.',
      });
      return;
    }

    // Get all DM channels the bot has access to
    const dmChannels = client.channels.cache.filter((channel: any) => channel.isDMBased());

    if (dmChannels.size === 0) {
      await interaction.editReply({
        content: '✅ No DM channels found. All DMs are already clean.',
      });
      return;
    }

    let totalDeleted = 0;
    let totalChannels = 0;
    let errors = 0;

    // Process each DM channel
    for (const [channelId, channel] of dmChannels) {
      try {
        if (!(channel as any).isDMBased() || !(channel as any).messages) continue;

        totalChannels++;

        // Fetch all messages from this DM channel
        let hasMore = true;
        let lastMessageId: string | null = null;

        while (hasMore) {
          const fetchOptions: any = { limit: 100 };
          if (lastMessageId) {
            fetchOptions.before = lastMessageId;
          }

          const messages = await (channel as any).messages.fetch(fetchOptions);

          if (messages.size === 0) {
            hasMore = false;
            break;
          }

          // Filter to only bot messages
          const botMessages = messages.filter((msg: any) => msg.author.id === client.user.id);

          // Delete bot messages
          for (const [msgId, message] of botMessages) {
            try {
              await (message as any).delete();
              totalDeleted++;
              // Small delay to avoid rate limits
              await new Promise((resolve) => setTimeout(resolve, 100));
            } catch (deleteError) {
              logger.error('Failed to delete message', {
                messageId: msgId,
                error: deleteError instanceof Error ? deleteError.message : 'Unknown error',
              });
              errors++;
            }
          }

          // Update lastMessageId for next iteration
          if (messages.size > 0) {
            lastMessageId = messages.last()?.id || null;
          } else {
            hasMore = false;
          }

          // If we got less than 100 messages, we've reached the end
          if (messages.size < 100) {
            hasMore = false;
          }
        }
      } catch (channelError) {
        logger.error('Error processing DM channel', {
          channelId,
          error: channelError instanceof Error ? channelError.message : 'Unknown error',
        });
        errors++;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ DM Cleanup Complete')
      .setDescription(`Deleted all bot messages from all DM channels`)
      .addFields(
        { name: 'DM Channels Processed', value: `${totalChannels}`, inline: true },
        { name: 'Messages Deleted', value: `${totalDeleted}`, inline: true },
        { name: 'Errors', value: `${errors}`, inline: true },
      )
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error in dm-rm-rf command', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: interaction.user.id,
    });

    await interaction.editReply({
      content: '❌ An error occurred while deleting DM messages.',
    });
  }
}

async function handleCleanupDmsCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const hasPermission =
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || isAdmin(interaction.user.id);

  if (!hasPermission) {
    await interaction.reply({
      content: '❌ You need the Manage Server permission to use this command.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const activeMinutes = interaction.options.getInteger('active_minutes') ?? undefined;

  const result = await dmCleanupService.cleanupBotDMs({
    maxUsers: 10,
    activeWithinMinutes: activeMinutes,
  });

  const embed = new EmbedBuilder()
    .setTitle('DM Cleanup Summary')
    .setColor(0x3498db)
    .addFields(
      { name: 'Processed Users', value: `${result.processedUsers}`, inline: true },
      { name: 'Deleted Messages', value: `${result.deletedMessages}`, inline: true },
      { name: 'Skipped (Inactive)', value: `${result.skippedInactive}`, inline: true },
      { name: 'Rate Limit Hits', value: `${result.skippedRateLimit}`, inline: true },
      { name: 'Errors', value: `${result.errors}`, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleRecheckCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const hasPermission =
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) || isAdmin(interaction.user.id);

  if (!hasPermission) {
    await interaction.reply({
      content: '❌ You need the Manage Messages permission to use this command.',
      ephemeral: true,
    });
          return;
        }

  await interaction.deferReply({ ephemeral: true });

  const targetUser = interaction.options.getUser('user', true);
  const attachment = interaction.options.getAttachment('attachment');
  const urlOption = interaction.options.getString('url');

  if (!attachment && !urlOption) {
    await interaction.editReply({
      content: '❌ Provide an attachment or a URL for the screenshot.',
    });
    return;
  }

  const imageSource = buildImageSource(attachment, urlOption);
  if (!imageSource) {
    await interaction.editReply({
      content: '❌ Unable to process the provided input. Please supply a valid image attachment or URL.',
    });
          return;
        }

  const startedAt = Date.now();
  const processResult = await processImage(imageSource);

  if (!processResult.success || !processResult.rank || !processResult.screenshotHash) {
    await verificationAuditService.recordEvent({
      userId: targetUser.id,
      username: targetUser.username,
      status: VerificationStatus.FAILURE,
      ocrUniqueId: processResult.uniqueId ?? null,
      screenshotHash: processResult.screenshotHash,
      attachmentUrl: processResult.attachmentUrl,
      attachmentFile: processResult.attachmentFile,
      messageId: interaction.id,
      reason:
        processResult.isProfile === false
          ? 'Invalid image format (recheck command)'
          : 'OCR failed during recheck command',
    });

    await interaction.editReply({
      content:
        processResult.isProfile === false
          ? '❌ The screenshot does not appear to be a profile screenshot.'
          : '❌ OCR failed to extract rank information. Please try another image.',
    });
          return;
        }

  try {
    await screenshotLockService.verifyLock({
      userId: targetUser.id,
      screenshotHash: processResult.screenshotHash,
      uniqueId: processResult.uniqueId ?? null,
    });
  } catch (error) {
    if (error instanceof ScreenshotLockConflictError) {
      const reason =
        error.reason === 'HASH_CONFLICT'
          ? 'Screenshot hash already linked to another user'
          : 'OCR unique ID already linked to another user';

      await verificationAuditService.recordEvent({
        userId: targetUser.id,
        username: targetUser.username,
        status: VerificationStatus.FAILURE,
        ocrUniqueId: processResult.uniqueId ?? null,
        screenshotHash: processResult.screenshotHash,
        attachmentUrl: processResult.attachmentUrl,
        attachmentFile: processResult.attachmentFile,
        messageId: interaction.id,
        reason,
      });

      await interaction.editReply({
        content: '❌ This screenshot or 8 Ball Pool ID is already linked to another Discord user.',
      });
          return;
        }

    logger.error('Unexpected error during screenshot lock verification', { error });
    await interaction.editReply({
      content: '❌ An internal error occurred while processing the screenshot.',
    });
    return;
  }

  try {
    const guildMember = await interaction.guild?.members.fetch(targetUser.id);
    if (!guildMember) {
      await interaction.editReply({
        content: '❌ Target user is not in this guild.',
      });
          return;
        }

    await roleManager.assignRankRole(guildMember, processResult.rank);

    await databaseService.upsertVerification({
      discord_id: targetUser.id,
      username: targetUser.username,
      rank_name: processResult.rank.rank_name,
      level_detected: processResult.level ?? processResult.rank.level_min,
      role_id_assigned: processResult.rank.role_id,
    });

    await screenshotLockService.upsertLock({
      userId: targetUser.id,
      screenshotHash: processResult.screenshotHash,
      uniqueId: processResult.uniqueId ?? null,
    });

    const processingTimeMs = Date.now() - startedAt;

    await verificationAuditService.recordEvent({
      userId: targetUser.id,
      username: targetUser.username,
      status: VerificationStatus.SUCCESS,
      confidence: processResult.rank.confidence,
      ocrUniqueId: processResult.uniqueId ?? null,
      screenshotHash: processResult.screenshotHash,
      attachmentUrl: processResult.attachmentUrl,
      attachmentFile: processResult.attachmentFile,
      messageId: interaction.id,
      processingTimeMs,
      metadata: {
        rank_name: processResult.rank.rank_name,
        level_detected: processResult.level ?? processResult.rank.level_min,
        command: 'recheck',
        sendToPublicChannel: false,
      },
    });

    const embed = new EmbedBuilder()
      .setTitle('Recheck Completed')
      .setColor(0x2ecc71)
      .addFields(
        { name: 'User', value: `<@${targetUser.id}> (${targetUser.id})`, inline: false },
        { name: 'Rank', value: processResult.rank.rank_name, inline: true },
        {
          name: 'Confidence',
          value: `${Math.round((processResult.rank.confidence ?? 0) * 100)}%`,
          inline: true,
        },
        {
          name: '8BP Unique ID',
          value: processResult.uniqueId ?? 'Not detected',
          inline: true,
        },
      )
      .setTimestamp();

    let files: AttachmentBuilder[] | undefined;
    if (processResult.attachmentFile) {
      embed.setImage(`attachment://${processResult.attachmentFile.name}`);
      files = [
        new AttachmentBuilder(processResult.attachmentFile.data, {
          name: processResult.attachmentFile.name,
        }),
      ];
    } else if (processResult.attachmentUrl) {
      embed.setImage(processResult.attachmentUrl);
    }

    await interaction.editReply({ embeds: [embed], files });
  } catch (error) {
    logger.error('Error executing recheck command', { error });

    await verificationAuditService.recordEvent({
      userId: targetUser.id,
      username: targetUser.username,
      status: VerificationStatus.FAILURE,
      ocrUniqueId: processResult.uniqueId ?? null,
      screenshotHash: processResult.screenshotHash,
      attachmentUrl: processResult.attachmentUrl,
      attachmentFile: processResult.attachmentFile,
      messageId: interaction.id,
      processingTimeMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.message : 'Unknown error during recheck command',
    });

    await interaction.editReply({
      content: '❌ Failed to complete recheck. Please review the logs for more details.',
    });
              }
}

async function handleUnlinkScreenshotCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const hasPermission = isAdmin(interaction.user.id);

  if (!hasPermission) {
    await interaction.reply({
      content: '❌ Only administrators can use this command.',
      ephemeral: true,
    });
          return;
        }

  await interaction.deferReply({ ephemeral: true });

  const uniqueId = interaction.options.getString('unique_id', true).trim();
  if (!/^\d+$/.test(uniqueId)) {
    await interaction.editReply({
      content: '❌ Unique ID must be numeric.',
    });
          return;
        }

  const removed = await screenshotLockService.unlinkByUniqueId(uniqueId);

  if (removed === 0) {
    await interaction.editReply({
      content: `No screenshot lock found for unique ID \`${uniqueId}\`.`,
    });
  } else {
    await interaction.editReply({
      content: `✅ Removed ${removed} screenshot lock(s) associated with unique ID \`${uniqueId}\`.`,
    });
  }
}

async function handleStatusCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const hasPermission =
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || isAdmin(interaction.user.id);

  if (!hasPermission) {
    await interaction.reply({
      content: '❌ You need the Manage Server permission to view status metrics.',
      ephemeral: true,
    });
      return;
    }

  const snapshot = metricsService.getSnapshot();
  const successRate =
    snapshot.totalVerifications > 0
      ? ((snapshot.successCount / snapshot.totalVerifications) * 100).toFixed(2)
      : '0.00';
  const averageConfidence = snapshot.averageConfidence ? (snapshot.averageConfidence * 100).toFixed(2) : '0.00';

  const embed = new EmbedBuilder()
    .setTitle('Verification Status')
    .setColor(0x9b59b6)
    .addFields(
      { name: 'Total Verifications', value: `${snapshot.totalVerifications}`, inline: true },
      { name: 'Successes', value: `${snapshot.successCount}`, inline: true },
      { name: 'Failures', value: `${snapshot.failureCount}`, inline: true },
      { name: 'Manual Reviews', value: `${snapshot.manualReviewCount}`, inline: true },
      { name: 'Success Rate', value: `${successRate}%`, inline: true },
      { name: 'Avg Confidence', value: `${averageConfidence}% (${snapshot.ocrSampleCount} samples)`, inline: true },
      { name: 'DM Cleanup (users)', value: `${snapshot.dmCleanupCount}`, inline: true },
      { name: 'Rate Limit Hits', value: `${snapshot.rateLimitHits}`, inline: true },
    )
    .setFooter({ text: `Last updated ${snapshot.lastUpdated}` })
    .setTimestamp();

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}

function buildImageSource(attachment: Attachment | null, urlOption: string | null) {
  if (attachment) {
    return {
      url: attachment.url,
      size: attachment.size,
      contentType: attachment.contentType,
      filename: attachment.name ?? null,
    };
  }

  if (urlOption) {
    try {
      const parsed = new URL(urlOption);
      return {
        url: parsed.toString(),
        size: null,
        contentType: null,
        filename: null,
      };
    } catch {
      return null;
    }
  }

  return null;
}

