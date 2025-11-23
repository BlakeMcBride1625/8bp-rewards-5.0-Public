import { Client, GatewayIntentBits, Message, EmbedBuilder, AttachmentBuilder, Events, Interaction } from 'discord.js';
import dotenv from 'dotenv';
import { handleMessageCreate } from './events/messageCreate';
import { handleCommand } from './commands';
import { registerSlashCommands, handleSlashCommand } from './commands/slashCommands';
// OCR service archived - using Vision API instead
import { databaseService } from './services/database';
import { logger } from './services/logger';
import { dmCleanupService } from './services/dmCleanup';
import { roleConfigService } from './services/roleConfig';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['VERIFICATION_BOT_TOKEN', 'VERIFICATION_DATABASE_URL', 'RANK_CHANNEL_ID', 'STAFF_EVIDENCE_CHANNEL_ID'] as const;

function ensureEnvVar(name: (typeof requiredEnvVars)[number]): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

try {
  requiredEnvVars.forEach((varName) => {
    ensureEnvVar(varName);
  });
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown environment validation error';
  console.error(message);
  process.exit(1);
}

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Store client globally for use in other modules
(global as any).client = client;

// Initialize services
async function initializeServices(): Promise<void> {
  logger.info('Initializing services...');

  try {
    await roleConfigService.initialize();
    logger.info('Role configuration service initialised');
    
    // OCR service archived - using Vision API instead
    logger.info('Using OpenAI Vision API for profile extraction');

    // Initialize database connection
    await databaseService.initialize();

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services', { error });
    throw error;
  }
}

// Event: Bot ready
client.once('ready', async () => {
  logger.info(`Bot is ready! Logged in as ${client.user?.tag}`);
  logger.info(`Bot is in ${client.guilds.cache.size} guild(s)`);

  try {
    // Register slash commands
    const token = process.env.VERIFICATION_BOT_TOKEN;
      let guildId = process.env.VERIFICATION_GUILD_ID || process.env.GUILD_ID; // Optional: set for faster guild-specific command registration
    
    // If no GUILD_ID is set, use the first available guild for immediate registration
    if (!guildId && client.guilds.cache.size > 0) {
      const firstGuild = client.guilds.cache.first();
      if (firstGuild) {
        guildId = firstGuild.id;
        logger.info(`No GUILD_ID set, using first available guild: ${firstGuild.name} (${guildId})`);
      }
    }
    
    if (token && client.user) {
      // Register for specific guild if available (faster), otherwise global
      await registerSlashCommands(client.user.id, token, guildId);
      
      // Also register globally for all servers
      if (guildId) {
        logger.info('Also registering commands globally...');
        await registerSlashCommands(client.user.id, token, undefined);
      }
    }
    
    // Send verification channel instructions (will check for duplicates)
    await sendVerificationChannelInstructions();

  } catch (error) {
    logger.error('Failed to initialize services on ready', { error });
    process.exit(1);
  }
});

// Send instructions to verification channel
async function sendVerificationChannelInstructions(): Promise<void> {
  try {
    const channelId = ensureEnvVar('RANK_CHANNEL_ID');

    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      logger.warn('Verification channel not found or not a text channel');
      return;
    }

    // Check if instructions message already exists (to avoid duplicates on restart)
    if ('messages' in channel) {
      try {
        const messages = await channel.messages.fetch({ limit: 10 });
        const existingInstructions = messages.find((msg) => {
          if (msg.author.id !== client.user?.id) return false;
          if (!msg.embeds || msg.embeds.length === 0) return false;
          const embed = msg.embeds[0];
          return embed.title === '📸 8 Ball Pool Rank Verification';
        });

        if (existingInstructions) {
          logger.info('Instructions message already exists, skipping duplicate', {
            message_id: existingInstructions.id,
          });
          return;
        }
      } catch (error) {
        logger.warn('Failed to check for existing instructions message', { error });
        // Continue to send new message if check fails
      }
    }

    const exampleImageUrl = process.env.EXAMPLE_IMAGE_URL || ''; // Optional example image URL from env
    const assetsDir = path.join(process.cwd(), 'assets', 'images');
    const exampleImagePaths = [
      path.join(assetsDir, 'example-profile.png'),
      path.join(assetsDir, 'example-profile.jpg'),
      path.join(assetsDir, 'example-profile.jpeg'),
    ];

    // Check for local example image file
    let exampleImagePath: string | null = null;
    for (const imgPath of exampleImagePaths) {
      if (fs.existsSync(imgPath)) {
        exampleImagePath = imgPath;
        logger.info(`Found local example image: ${imgPath}`);
        break;
      }
    }

    // Check for reference images showing where level appears
    const levelIconPath = path.join(assetsDir, 'Level Icon.png');
    const levelProgressPath = path.join(assetsDir, 'Level Progress.png');
    const levelIconExists = fs.existsSync(levelIconPath);
    const levelProgressExists = fs.existsSync(levelProgressPath);

    if (levelIconExists) {
      logger.info(`Found level icon reference image: ${levelIconPath}`);
    }
    if (levelProgressExists) {
      logger.info(`Found level progress reference image: ${levelProgressPath}`);
    }

    const embed = new EmbedBuilder()
      .setTitle('📸 8 Ball Pool Rank Verification')
      .setDescription(
        '**Please add your profile here to receive your specific role!**\n\n' +
        '1. Click onto your **account profile** on 8 Ball Pool\n' +
        '2. Take a screenshot of your profile screen (showing your level, rank, and stats)\n' +
        '3. Upload the screenshot here\n' +
        '4. You will receive a DM confirming your verified rank and role assignment\n\n' +
        '**Important:**\n' +
        '• Only profile screenshots are accepted (not main menu or other screens)\n' +
        '• Make sure your screenshot clearly shows your **Level** and **Rank**\n' +
        '• The bot will automatically assign you the correct role based on your rank\n' +
        '• Your screenshot will be deleted after processing to keep the channel clean\n\n' +
        '**⚠️ Disclaimer:**\n' +
        '• If you misuse this system, you may be banned from the server\n' +
        '• If we detect that this is not your account (e.g., account dealing/trading), we may remove the account verification'
      )
      .setColor(0x00AE86)
      .setTimestamp();

    const attachments: AttachmentBuilder[] = [];

    // Use local file if available, otherwise use URL
    if (exampleImagePath) {
      const attachment = new AttachmentBuilder(exampleImagePath, { name: 'example-profile.png' });
      attachments.push(attachment);
      embed.setImage(`attachment://example-profile.png`);
      embed.setFooter({ text: 'Example profile screenshot above' });
    } else if (exampleImageUrl) {
      embed.setImage(exampleImageUrl);
      embed.setFooter({ text: 'Example profile screenshot above' });
    }

    // Add level reference images if they exist
    if (levelIconExists) {
      const attachment = new AttachmentBuilder(levelIconPath, { name: 'level-icon.png' });
      attachments.push(attachment);
      logger.info('Added level icon reference image to attachments');
    }
    if (levelProgressExists) {
      const attachment = new AttachmentBuilder(levelProgressPath, { name: 'level-progress.png' });
      attachments.push(attachment);
      logger.info('Added level progress reference image to attachments');
    }

    if ('send' in channel) {
      await channel.send({ embeds: [embed], files: attachments });
      logger.info('Verification channel instructions sent');
    }
  } catch (error) {
    logger.error('Failed to send verification channel instructions', { error });
  }
}

// Event: Interaction create (for slash commands)
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      const { handleAutocomplete } = await import('./commands/slashCommands');
      await handleAutocomplete(interaction);
    } else if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
    }
  } catch (error) {
    logger.error('Error handling interaction', { error, interaction_id: interaction.id });
  }
});

// Event: Message create
client.on('messageCreate', async (message: Message) => {
  try {
    // Debug: Log all messages (temporarily for debugging)
    if (message.channel.id === process.env.RANK_CHANNEL_ID) {
      logger.debug('MessageCreate event fired', {
        channel_id: message.channel.id,
        user_id: message.author.id,
        username: message.author.username,
        is_bot: message.author.bot,
        attachment_count: message.attachments.size,
      });
    }

    // Handle commands first
    await handleCommand(message);
    
    // Handle image processing (for rank verification channel)
    await handleMessageCreate(message);
  } catch (error) {
    logger.error('Error handling message', { error, message_id: message.id });
  }
});

// Event: Error handling
client.on('error', (error) => {
  logger.error('Discord client error', { error });
});

// Event: Warn
client.on('warn', (warning) => {
  logger.warn('Discord client warning', { warning });
});

// Event: Disconnect
client.on('disconnect', () => {
  logger.warn('Discord client disconnected');
});

// Event: Reconnecting
client.on('reconnecting', () => {
  logger.info('Discord client reconnecting...');
});

// Graceful shutdown
async function shutdown(): Promise<void> {
  logger.info('Shutting down bot...');

  try {
    roleConfigService.shutdown();
    logger.info('Role configuration service shut down');

    // Cleanup DM cleanup service
    dmCleanupService.cleanup();
    logger.info('DM cleanup service cleaned up');

    // OCR service archived - no termination needed

    // Disconnect from database
    await databaseService.disconnect();
    logger.info('Database disconnected');

    // Destroy Discord client
    client.destroy();
    logger.info('Discord client destroyed');

    logger.info('Bot shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
});

// Login to Discord
async function bootstrap(): Promise<void> {
  try {
    await initializeServices();

    const token = ensureEnvVar('VERIFICATION_BOT_TOKEN');

    await client.login(token);
  } catch (error) {
    logger.error('Failed to bootstrap bot', { error });
  process.exit(1);
  }
}

bootstrap();

