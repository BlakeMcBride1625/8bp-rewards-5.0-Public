const { Client, GatewayIntentBits, AttachmentBuilder, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, Collection, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const DatabaseService = require('./database-service');
const axios = require('axios');

class DiscordService {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
      ]
    });
    
    this.isReady = false;
    this.dbService = new DatabaseService();
    this.allowedAdmins = this.getAllowedAdmins();
    this.commands = new Collection();
    
    // Rate limiting and duplicate prevention
    this.sentMessages = new Map(); // Track sent messages to prevent duplicates
    this.lastMessageTime = 0; // Rate limiting
    this.minMessageInterval = 2000; // Minimum 2 seconds between messages
    
    // Clean up old message records every hour to prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldMessages();
    }, 60 * 60 * 1000); // 1 hour
    
    this.setupEventHandlers();
    this.setupSlashCommands();
  }

  getAllowedAdmins() {
    const allowedAdminsEnv = process.env.ALLOWED_ADMINS;
    if (allowedAdminsEnv) {
      return allowedAdminsEnv.split(',').map(id => id.trim());
    }
    return [];
  }

  setupEventHandlers() {
    this.client.once('clientReady', async () => {
      console.log('🤖 Discord bot is ready!');
      console.log(`📋 Logged in as: ${this.client.user.tag}`);
      this.isReady = true;
      
      // Set bot status and activity (configurable via environment variable)
      const botStatus = process.env.DISCORD_BOT_STATUS || 'dnd'; // Default to 'dnd' if not set
      this.client.user.setPresence({
        status: botStatus,
        activities: [{
          name: 'https://8ballpool.website/8bp-rewards/home',
          type: ActivityType.Watching
        }]
      });
      console.log(`👁️ Bot status set to ${botStatus.toUpperCase()} - Watching https://8ballpool.website/8bp-rewards/home`);
      
      // Register slash commands
      await this.registerSlashCommands();
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      
      const command = this.commands.get(interaction.commandName);
      if (!command) return;

      // Commands that are available to all users (not just admins)
      // Public commands: Anyone can use these
      const publicCommands = [
        'register',      // Anyone can register their account
        'link-account',  // Anyone can link their Discord to existing account
        'my-accounts',   // Users can view their own linked accounts
        'help'           // Everyone should see help
      ];
      const isPublicCommand = publicCommands.includes(interaction.commandName);

      // Check if user is in allowed admins list (for admin-only commands)
      const userId = interaction.user.id;
      const isAdmin = this.allowedAdmins.includes(userId);
      
      // Only enforce admin check for non-public commands
      if (!isPublicCommand && !isAdmin) {
        const errorMessage = '❌ Access denied! Only administrators can use this command.';
        
        if (interaction.inGuild()) {
          return interaction.reply({
            content: errorMessage,
            flags: 64 // EPHEMERAL
          });
        } else {
          return interaction.reply({
            content: errorMessage
          });
        }
      }

      try {
        // Set a timeout for command execution (30 seconds for long-running commands)
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Command execution timeout')), 30000);
        });

        await Promise.race([
          command.execute(interaction, this),
          timeoutPromise
        ]);
      } catch (error) {
        console.error(`❌ Error executing command ${interaction.commandName}:`, error);
        console.error(`   User: ${interaction.user.tag} (${interaction.user.id})`);
        console.error(`   Guild: ${interaction.guild?.name || 'DM'} (${interaction.guildId || 'N/A'})`);
        console.error(`   Error details:`, error.stack || error.message);
        
        // Check interaction state and respond appropriately
        try {
          if (interaction.replied) {
            // Already replied, cannot send another message
            console.error('   Interaction already replied to, cannot send error message');
          } else if (interaction.deferred) {
            // Deferred but not replied, use editReply or followUp
            await interaction.followUp({ 
              content: '❌ There was an error while executing this command!', 
              ephemeral: true
            });
          } else {
            // Not yet replied or deferred, send initial reply
            await interaction.reply({ 
              content: '❌ There was an error while executing this command!', 
              ephemeral: true
            });
          }
        } catch (replyError) {
          console.error('Failed to send error response:', replyError.message);
        }
      }
    });

    this.client.on('error', (error) => {
      console.error('❌ Discord bot error:', error);
    });
  }

  async login() {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      console.log('⚠️ No Discord token provided, Discord features disabled');
      return false;
    }

    try {
      // Connect to database first
      console.log('📊 Connecting to database...');
      await this.dbService.connect();
      
      await this.client.login(token);
      // Wait for ready event
      await this.waitForReady();
      return true;
    } catch (error) {
      console.error('❌ Failed to login to Discord:', error.message);
      return false;
    }
  }

  waitForReady() {
    return new Promise((resolve) => {
      if (this.isReady) {
        resolve();
      } else {
        const checkReady = () => {
          if (this.isReady) {
            resolve();
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      }
    });
  }

  setupSlashCommands() {
    // Register command
    const registerCommand = {
      data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Register your 8 Ball Pool account for automated rewards')
        .setDefaultMemberPermissions(null) // Public command - no permissions required
        .addIntegerOption(option =>
          option.setName('id')
            .setDescription('Enter the 8 Ball Pool Unique ID here')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('username')
            .setDescription('Your username')
            .setRequired(true)),
      async execute(interaction, service) {
        const eightBallPoolId = interaction.options.getInteger('id').toString();
        const username = interaction.options.getString('username');

        try {
          // Use database service to add/update user (no Discord ID needed)
          const result = await service.dbService.addOrUpdateUser(eightBallPoolId, username);
          
          if (!result.success) {
            return interaction.reply({
              content: `❌ Failed to register account: ${result.error}`,
              ephemeral: interaction.inGuild()
            });
          }

          // Get total user count
          const totalUsers = await service.dbService.getUserCount();

          // Trigger first-time claim for new registrations
          if (result.isNew) {
            const { exec } = require('child_process');
            const path = require('path');
            const projectRoot = path.join(__dirname);
            const claimScript = path.join(projectRoot, 'first-time-claim.js');
            
            console.log(`🎁 Triggering first-time claim for ${username} (${eightBallPoolId})`);
            
            exec(`cd ${projectRoot} && node ${claimScript} ${eightBallPoolId} "${username}"`, (error, stdout, stderr) => {
              if (error) {
                console.error(`❌ First-time claim failed for ${username}:`, error.message);
              } else {
                console.log(`✅ First-time claim completed for ${username}`);
                console.log(stdout);
              }
            });
          }

          const embed = new EmbedBuilder()
            .setTitle(result.isNew ? '✅ Account Registered' : '✅ Account Updated')
            .setDescription(`Successfully ${result.isNew ? 'registered' : 'updated'} your 8 Ball Pool account!${result.isNew ? '\n\n🎁 **First claim triggered!** Your rewards are being claimed now...' : ''}`)
            .addFields(
              { name: '🎱 8BP Account ID', value: eightBallPoolId, inline: true },
              { name: '👤 Username', value: username, inline: true },
              { name: '📋 Total Registrations', value: `${totalUsers}`, inline: true }
            )
            .setColor(0x00FF00)
            .setTimestamp();

          await interaction.reply({ embeds: [embed], ephemeral: interaction.inGuild() });

          // Send notification to registration channel
          try {
            const channelId = '1422725910196518922'; // Registration channel ID
            if (service.client) {
              const channel = service.client.channels.cache.get(channelId);
              if (channel && channel.isTextBased()) {
                const notificationEmbed = new EmbedBuilder()
                  .setTitle('✅ Account Registered via Discord')
                  .setDescription(`A new account has been registered`)
                  .addFields(
                    { name: '🎱 8BP Account ID', value: eightBallPoolId, inline: true },
                    { name: '👤 Username', value: username, inline: true },
                    { name: '👤 Discord User', value: interaction.user.tag, inline: true },
                    { name: '📋 Total Registrations', value: `${totalUsers}`, inline: true },
                    { name: '🆕 Status', value: result.isNew ? 'New Registration' : 'Account Updated', inline: true }
                  )
                  .setColor(0x00FF00)
                  .setTimestamp();
                
                await channel.send({ embeds: [notificationEmbed] });
              }
            }
          } catch (notifError) {
            console.log('⚠️ Failed to send registration notification:', notifError.message);
          }

        } catch (error) {
          console.error('❌ Error in /register command:', error);
          await interaction.reply({
            content: '❌ An error occurred while registering your account. Please try again.',
            ephemeral: interaction.inGuild()
          });
        }
      }
    };

    // List accounts command
    const listAccountsCommand = {
      data: new SlashCommandBuilder()
        .setName('list-accounts')
        .setDescription('List all registered accounts (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Admin only
      async execute(interaction, service) {
        try {
          await interaction.deferReply({ ephemeral: interaction.inGuild() });
          
          console.log('📋 /list-accounts command executed');
          
          // Check database connection first
          const healthCheck = await service.dbService.healthCheck();
          console.log('📊 Database health check:', healthCheck);
          
          if (!healthCheck.connected) {
            console.log('❌ Database not connected, attempting to reconnect...');
            await service.dbService.connect();
          }
          
          const users = await service.dbService.getAllUsers();
          console.log(`📋 Retrieved ${users.length} users from database`);
          
          if (users.length === 0) {
            return interaction.followUp({
              content: '📋 No registered accounts found.',
              ephemeral: interaction.inGuild()
            });
          }

          const embed = new EmbedBuilder()
            .setTitle('📋 Registered Accounts')
            .setDescription(`Total registrations: **${users.length}**`)
            .setColor(0x0099FF)
            .setTimestamp();

          // Limit to first 25 users to avoid embed limits
          const displayUsers = users.slice(0, 25);
          displayUsers.forEach((user, index) => {
            embed.addFields({
              name: `${index + 1}. ${user.username}`,
              value: `🎱 **8BP ID:** ${user.eightBallPoolId}\n📅 **Registered:** ${new Date(user.createdAt).toLocaleDateString()}`,
              inline: true
            });
          });

          if (users.length > 25) {
            embed.setFooter({ text: `Showing first 25 of ${users.length} accounts` });
          }

          await interaction.followUp({ embeds: [embed] });

        } catch (error) {
          console.error('❌ Error in /list-accounts command:', error);
          const errorMessage = interaction.replied || interaction.deferred 
            ? { content: '❌ An error occurred while fetching accounts. Please try again.', ephemeral: interaction.inGuild() }
            : { content: '❌ An error occurred while fetching accounts. Please try again.', ephemeral: interaction.inGuild() };
          
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
          } else {
            await interaction.reply(errorMessage);
          }
        }
      }
    };

    // Check accounts command
    const checkAccountsCommand = {
      data: new SlashCommandBuilder()
        .setName('check-accounts')
        .setDescription('Check the status of all registered accounts (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Admin only
      async execute(interaction, service) {
        try {
          await interaction.deferReply({ ephemeral: interaction.inGuild() });

          const users = await service.dbService.getAllUsers();
          
          if (users.length === 0) {
            return interaction.followUp({
              content: '📋 No registered accounts found.',
              ephemeral: interaction.inGuild()
            });
          }

          const embed = new EmbedBuilder()
            .setTitle('🔍 Account Status Check')
            .setDescription(`Checking status of **${users.length}** accounts...`)
            .setColor(0x0099FF)
            .setTimestamp();

          let statusText = '';
          users.forEach((user, index) => {
            const lastClaimed = user.lastClaimed 
              ? new Date(user.lastClaimed).toLocaleDateString()
              : 'Never';
            
            statusText += `${index + 1}. **${user.username}** (${user.eightBallPoolId})\n`;
            statusText += `   📅 Registered: ${new Date(user.createdAt).toLocaleDateString()}\n\n`;
          });

          embed.setDescription(statusText);

          await interaction.followUp({ embeds: [embed] });

        } catch (error) {
          console.error('❌ Error in /check-accounts command:', error);
          await interaction.followUp({
            content: '❌ An error occurred while checking accounts. Please try again.',
            ephemeral: interaction.inGuild()
          });
        }
      }
    };

    // Link account command - Links Discord user to existing 8BP account
    const linkAccountCommand = {
      data: new SlashCommandBuilder()
        .setName('link-account')
        .setDescription('Link your Discord account to an existing 8 Ball Pool account')
        .setDefaultMemberPermissions(null) // Public command - no permissions required
        .addIntegerOption(option =>
          option.setName('id')
            .setDescription('Enter the 8 Ball Pool Unique ID here')
            .setRequired(true)),
      async execute(interaction, service) {
        const eightBallPoolId = interaction.options.getInteger('id').toString();
        const discordId = interaction.user.id;

        try {
          await interaction.deferReply({ ephemeral: interaction.inGuild() });

          // Check if 8BP account exists in database
          const client = await service.dbService.pool.connect();
          let existingRegistration = null;
          
          try {
            const existingResult = await client.query(
              'SELECT * FROM registrations WHERE eight_ball_pool_id = $1',
              [eightBallPoolId]
            );
            
            if (existingResult.rows.length > 0) {
              existingRegistration = existingResult.rows[0];
            }
          } finally {
            client.release();
          }

          // If account doesn't exist, return error with registration options
          if (!existingRegistration) {
            return interaction.followUp({
              content: `❌ **Account not found**\n\nThe 8 Ball Pool account ID **${eightBallPoolId}** is not registered in our system.\n\n**Please register your account first:**\n• Use \`/register\` command in Discord\n• Or register via website: https://8ballpool.website/8bp-rewards/register\n\nOnce registered, you can use \`/link-account\` to link your Discord account.`,
              ephemeral: interaction.inGuild()
            });
          }

          // Check if account is already linked to a different Discord account
          if (existingRegistration.discord_id && existingRegistration.discord_id !== discordId) {
            return interaction.followUp({
              content: `❌ **Account already linked**\n\nThis 8 Ball Pool account is already linked to a different Discord account.\n\nIf this is your account, please contact an administrator.`,
              ephemeral: interaction.inGuild()
            });
          }

          // Check if already linked to this Discord account
          if (existingRegistration.discord_id === discordId) {
            return interaction.followUp({
              content: `✅ **Already linked**\n\nYour Discord account is already linked to this 8 Ball Pool account!`,
              ephemeral: interaction.inGuild()
            });
          }

          // Link Discord ID to existing registration
          const updateClient = await service.dbService.pool.connect();
          try {
            await updateClient.query(
              'UPDATE registrations SET discord_id = $1, updated_at = CURRENT_TIMESTAMP WHERE eight_ball_pool_id = $2',
              [discordId, eightBallPoolId]
            );
          } finally {
            updateClient.release();
          }

          const embed = new EmbedBuilder()
            .setTitle('✅ Account Linked')
            .setDescription(`Successfully linked your Discord account to your 8 Ball Pool account!`)
            .addFields(
              { name: '🎱 8BP Account ID', value: eightBallPoolId, inline: true },
              { name: '👤 Username', value: existingRegistration.username || 'Unknown', inline: true }
            )
            .setColor(0x00FF00)
            .setTimestamp();

          // If in a guild, send ephemeral reply and also send DM
          // If in DMs, only send the followUp (already in DMs)
          if (interaction.inGuild()) {
            await interaction.followUp({ embeds: [embed], ephemeral: true });
            
            // Send notification to user's DMs
            try {
              const dmChannel = await interaction.user.createDM();
              if (dmChannel) {
                await dmChannel.send({ embeds: [embed] });
              }
            } catch (dmError) {
              console.log('⚠️ Failed to send DM notification (user may have DMs disabled):', dmError.message);
            }
          } else {
            // Already in DMs, just send the followUp
            await interaction.followUp({ embeds: [embed] });
          }

        } catch (error) {
          console.error('❌ Error in /link-account command:', error);
          const errorMessage = interaction.replied || interaction.deferred 
            ? { content: '❌ An error occurred while linking your account. Please try again.', ephemeral: interaction.inGuild() }
            : { content: '❌ An error occurred while linking your account. Please try again.', ephemeral: interaction.inGuild() };
          
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
          } else {
            await interaction.reply(errorMessage);
          }
        }
      }
    };

    // My accounts command - Shows all 8BP accounts linked to user's Discord ID
    const myAccountsCommand = {
      data: new SlashCommandBuilder()
        .setName('my-accounts')
        .setDescription('View all 8 Ball Pool accounts linked to your Discord account')
        .setDefaultMemberPermissions(null), // Public command - no permissions required
      async execute(interaction, service) {
        const discordId = interaction.user.id;

        try {
          await interaction.deferReply({ ephemeral: interaction.inGuild() });

          // Get all accounts linked to this Discord ID
          const client = await service.dbService.pool.connect();
          let linkedAccounts = [];
          
          try {
            const result = await client.query(
              'SELECT * FROM registrations WHERE discord_id = $1 ORDER BY created_at DESC',
              [discordId]
            );
            
            linkedAccounts = result.rows;
          } finally {
            client.release();
          }

          if (linkedAccounts.length === 0) {
            return interaction.followUp({
              content: `❌ **No accounts linked**\n\nYou don't have any 8 Ball Pool accounts linked to your Discord account yet.\n\nUse \`/link-account\` to link an existing account, or \`/register\` to register a new one.`,
              ephemeral: interaction.inGuild()
            });
          }

          // Create embed with all linked accounts
          const embed = new EmbedBuilder()
            .setTitle('📋 Your Linked Accounts')
            .setDescription(`You have **${linkedAccounts.length}** account(s) linked to your Discord account`)
            .setColor(0x0099FF)
            .setTimestamp();

          // Add each account as a field
          linkedAccounts.forEach((account, index) => {
            const linkedDate = account.created_at 
              ? new Date(account.created_at).toLocaleDateString()
              : 'Unknown';
            
            embed.addFields({
              name: `${index + 1}. ${account.username || 'Unknown'}`,
              value: `🎱 **8BP ID:** ${account.eight_ball_pool_id}\n📅 **Linked:** ${linkedDate}\n✅ **Status:** ${account.is_active ? 'Active' : 'Inactive'}`,
              inline: false
            });
          });

          // Add footer if there are many accounts
          if (linkedAccounts.length > 10) {
            embed.setFooter({ text: `Showing ${linkedAccounts.length} linked accounts` });
          }

          await interaction.followUp({ embeds: [embed] });

        } catch (error) {
          console.error('❌ Error in /my-accounts command:', error);
          const errorMessage = interaction.replied || interaction.deferred 
            ? { content: '❌ An error occurred while fetching your accounts. Please try again.', ephemeral: interaction.inGuild() }
            : { content: '❌ An error occurred while fetching your accounts. Please try again.', ephemeral: interaction.inGuild() };
          
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
          } else {
            await interaction.reply(errorMessage);
          }
        }
      }
    };

    // Deregister command
    const deregisterCommand = {
      data: new SlashCommandBuilder()
        .setName('deregister')
        .setDescription('Remove your account from the rewards system (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Admin only
        .addIntegerOption(option =>
          option.setName('id')
            .setDescription('Enter the 8 Ball Pool Unique ID here')
            .setRequired(true)),
      async execute(interaction, service) {
        const eightBallPoolId = interaction.options.getInteger('id').toString();

        try {
          // Remove the registration by 8BP ID
          const result = await service.dbService.removeUserByEightBallPoolId(eightBallPoolId);
          
          if (!result.success) {
            return interaction.reply({
              content: `❌ Failed to remove registration: ${result.error || 'Registration not found'}`,
              ephemeral: interaction.inGuild()
            });
          }

          const embed = new EmbedBuilder()
            .setTitle('🗑️ Registration Removed')
            .setDescription(`Successfully removed the registration`)
            .addFields(
              { name: '🎱 8BP Account ID', value: result.user.eightBallPoolId, inline: true },
              { name: '👤 Username', value: result.user.username, inline: true }
            )
            .setColor(0xFF0000)
            .setTimestamp();

          await interaction.reply({ embeds: [embed], ephemeral: interaction.inGuild() });

        } catch (error) {
          console.error('❌ Error in /deregister command:', error);
          await interaction.reply({
            content: '❌ An error occurred while removing the registration. Please try again.',
            ephemeral: interaction.inGuild()
          });
        }
      }
    };

    // Help command
    const helpCommand = {
      data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show help information and available commands')
        .setDefaultMemberPermissions(null), // Public command - no permissions required
      async execute(interaction, service) {
        const embed = new EmbedBuilder()
          .setTitle('🤖 8BP Rewards Bot - Help')
          .setDescription('Available commands:')
          .addFields(
            { name: '📝 Public Commands (Everyone)', value: 'These commands are available to all users:', inline: false },
            { name: '/register', value: 'Register your 8 Ball Pool account for automated rewards', inline: false },
            { name: '/link-account', value: 'Link your Discord account to an existing 8 Ball Pool account', inline: false },
            { name: '/my-accounts', value: 'View all 8 Ball Pool accounts linked to your Discord account', inline: false },
            { name: '/help', value: 'Show this help message', inline: false },
            { name: '🔧 Admin Commands', value: 'These commands require administrator privileges:', inline: false },
            { name: '/deregister', value: 'Remove an account from the rewards system (Admin only)', inline: false },
            { name: '/list-accounts', value: 'List all registered accounts (Admin only)', inline: false },
            { name: '/check-accounts', value: 'Check the status of all registered accounts (Admin only)', inline: false },
            { name: '/clear', value: 'Delete bot messages from current channel or user\'s DMs (Admin only)', inline: false },
            { name: '/md', value: 'Show markdown documentation (Admin only)', inline: false },
            { name: '/server-status', value: 'Check Discord bot server status (Admin only)', inline: false },
            { name: '/website-status', value: 'Check website and backend services status (Admin only)', inline: false },
            { name: '/ping-discord', value: 'Test Discord bot connectivity (Admin only)', inline: false },
            { name: '/ping-website', value: 'Test website connectivity (Admin only)', inline: false }
          )
          .setColor(0x0099FF)
          .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: interaction.inGuild() });
      }
    };

    // Markdown documentation command
    const mdCommand = {
      data: new SlashCommandBuilder()
        .setName('md')
        .setDescription('Show markdown documentation (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Admin only
      async execute(interaction, service) {
        const embed = new EmbedBuilder()
          .setTitle('📚 8BP Rewards System Documentation')
          .setDescription('## Overview\n\nThe 8 Ball Pool Rewards System automatically claims daily rewards for registered users.\n\n## Features\n\n- 🎯 **Automated Claiming**: Claims rewards every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)\n- 🆔 **Multiple User Support**: Supports multiple registered accounts\n- 📝 **Comprehensive Logging**: All activities are logged\n- 🤖 **Discord Integration**: Notifications and admin commands\n- 🌐 **Web Interface**: Full admin dashboard and user registration\n\n## Registration\n\n1. Visit the website: https://8ballpool.website/8bp-rewards/register\n2. Enter your 8 Ball Pool User ID and username\n3. Your account will be automatically included in the reward claiming schedule\n\n## Admin Commands\n\nAll commands require administrator privileges.\n\n- `/register` - Register a new account\n- `/list-accounts` - List all registered accounts\n- `/check-accounts` - Check account statuses\n- `/deregister` - Remove an account\n- `/help` - Show help information\n- `/server-status` - Check bot server status\n- `/website-status` - Check website status\n\n## Support\n\nFor support, visit: https://8ballpool.website/8bp-rewards/contact')
          .setColor(0x0099FF)
          .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: interaction.inGuild() });
      }
    };

    // Server status command
    const serverStatusCommand = {
      data: new SlashCommandBuilder()
        .setName('server-status')
        .setDescription('Check the status of the Discord bot server (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Admin only
      async execute(interaction, service) {
        try {
          const uptime = process.uptime();
          const memoryUsage = process.memoryUsage();
          
          const embed = new EmbedBuilder()
            .setTitle('🖥️ Discord Bot Server Status')
            .addFields(
              { name: '🟢 Status', value: 'Online', inline: true },
              { name: '⏱️ Uptime', value: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`, inline: true },
              { name: '💾 Memory', value: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`, inline: true },
              { name: '📊 Node.js', value: process.version, inline: true },
              { name: '🖥️ Platform', value: process.platform, inline: true },
              { name: '🆔 Bot ID', value: service.client.user.id, inline: true }
            )
            .setColor(0x00FF00)
            .setTimestamp();

          await interaction.reply({ embeds: [embed], ephemeral: interaction.inGuild() });

        } catch (error) {
          console.error('❌ Error in /server-status command:', error);
          await interaction.reply({
            content: '❌ An error occurred while checking server status.',
            ephemeral: interaction.inGuild()
          });
        }
      }
    };

    // Website status command
    const websiteStatusCommand = {
      data: new SlashCommandBuilder()
        .setName('website-status')
        .setDescription('Check the status of the website and backend services (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Admin only
      async execute(interaction, service) {
        try {
          await interaction.deferReply({ ephemeral: interaction.inGuild() });

          const baseUrl = process.env.PUBLIC_URL || 'https://8ballpool.website/8bp-rewards';
          
          // Check backend health
          let backendStatus = '❌ Unknown';
          let backendResponseTime = 'N/A';
          
          try {
            const startTime = Date.now();
            const response = await axios.get(`${baseUrl}/api/status`, { timeout: 5000 });
            const responseTime = Date.now() - startTime;
            
            if (response.status === 200) {
              backendStatus = '✅ Online';
              backendResponseTime = `${responseTime}ms`;
            }
          } catch (error) {
            backendStatus = '❌ Offline';
          }

          // Check database
          const dbHealth = await service.dbService.healthCheck();
          const dbStatus = dbHealth.connected ? '✅ Connected' : '❌ Disconnected';

          const embed = new EmbedBuilder()
            .setTitle('🌐 Website & Backend Status')
            .addFields(
              { name: '🌐 Website', value: '✅ Online', inline: true },
              { name: '🔧 Backend API', value: backendStatus, inline: true },
              { name: '📊 Database', value: dbStatus, inline: true },
              { name: '⏱️ Response Time', value: backendResponseTime, inline: true },
              { name: '👥 Registered Users', value: `${dbHealth.userCount || 0}`, inline: true },
              { name: '🔗 Website URL', value: baseUrl, inline: false }
            )
            .setColor(backendStatus.includes('✅') ? 0x00FF00 : 0xFF0000)
            .setTimestamp();

          await interaction.followUp({ embeds: [embed] });

        } catch (error) {
          console.error('❌ Error in /website-status command:', error);
          await interaction.followUp({
            content: '❌ An error occurred while checking website status.',
            ephemeral: interaction.inGuild()
          });
        }
      }
    };

    // Ping Discord command
    const pingDiscordCommand = {
      data: new SlashCommandBuilder()
        .setName('ping-discord')
        .setDescription('Test Discord bot connectivity (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Admin only
      async execute(interaction, service) {
        const sent = await interaction.reply({ 
          content: '🏓 Pinging...', 
          fetchReply: true,
          ephemeral: interaction.inGuild()
        });
        
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(service.client.ws.ping);

        const embed = new EmbedBuilder()
          .setTitle('🏓 Discord Bot Ping')
          .addFields(
            { name: '📡 Bot Latency', value: `${latency}ms`, inline: true },
            { name: '🌐 API Latency', value: `${apiLatency}ms`, inline: true }
          )
          .setColor(0x00FF00)
          .setTimestamp();

        await interaction.editReply({ content: '', embeds: [embed] });
      }
    };

    // Ping website command
    const pingWebsiteCommand = {
      data: new SlashCommandBuilder()
        .setName('ping-website')
        .setDescription('Test website connectivity (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Admin only
      async execute(interaction, service) {
        try {
          await interaction.deferReply({ ephemeral: interaction.inGuild() });

          const baseUrl = process.env.PUBLIC_URL || 'https://8ballpool.website/8bp-rewards';
          const startTime = Date.now();
          
          const response = await axios.get(`${baseUrl}/api/status`, { timeout: 10000 });
          const responseTime = Date.now() - startTime;

          const embed = new EmbedBuilder()
            .setTitle('🏓 Website Ping')
            .addFields(
              { name: '🌐 Website', value: baseUrl, inline: false },
              { name: '⏱️ Response Time', value: `${responseTime}ms`, inline: true },
              { name: '📊 Status Code', value: `${response.status}`, inline: true },
              { name: '🟢 Status', value: 'Online', inline: true }
            )
            .setColor(0x00FF00)
            .setTimestamp();

          await interaction.followUp({ embeds: [embed] });

        } catch (error) {
          const embed = new EmbedBuilder()
            .setTitle('🏓 Website Ping')
            .addFields(
              { name: '🌐 Website', value: process.env.PUBLIC_URL || 'https://8ballpool.website/8bp-rewards', inline: false },
              { name: '⏱️ Response Time', value: 'Timeout', inline: true },
              { name: '📊 Status', value: '❌ Offline', inline: true }
            )
            .setColor(0xFF0000)
            .setTimestamp();

          await interaction.followUp({ embeds: [embed] });
        }
      }
    };


    // Clear messages command
    const clearCommand = {
      data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Delete bot messages from current channel or specified user\'s DMs (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Admin only
        .addStringOption(option =>
          option.setName('amount')
            .setDescription('Messages to delete (1-100) or "all"/"ALL" for all. Default: 100.')
            .setRequired(false))
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User whose DMs to clear (optional - if not specified, clears current channel)')
            .setRequired(false)),
      async execute(interaction, service) {
        const amountInput = interaction.options.getString('amount');
        const targetUser = interaction.options.getUser('user');
        
        // Parse amount - support "all", "ALL", or numeric values
        let amount = 100; // Default to 100 if not specified
        let clearAll = false;
        
        if (amountInput) {
          const lowerInput = amountInput.toLowerCase();
          if (lowerInput === 'all') {
            clearAll = true;
            amount = 100; // Start with 100, will loop if needed
          } else {
            const parsed = parseInt(amountInput, 10);
            if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
              amount = parsed;
            }
          }
        }
        
        try {
          console.log(`🗑️ /clear command executed by ${interaction.user.tag} in ${interaction.inGuild() ? 'guild' : 'DM'}`);
          
          // Defer reply first to prevent timeout
          await interaction.deferReply({ 
            flags: interaction.inGuild() ? 64 : undefined // 64 = EPHEMERAL flag
          });
          
          // If executed in DMs, show limitation message
          if (!interaction.inGuild()) {
            return interaction.followUp({
              content: `❌ **Discord Bot Limitation**\n\n` +
                      `Bots cannot delete messages in Direct Messages due to Discord's API restrictions.\n\n` +
                      `**Solutions:**\n` +
                      `• Use \`/clear\` in a server channel (requires "Manage Messages" permission)\n` +
                      `• Manually delete bot messages in this DM\n` +
                      `• Use \`/clear user:@username\` in a server channel to clear someone's DMs\n\n` +
                      `*This is a Discord platform limitation, not a bot issue.*`,
              flags: 64 // EPHEMERAL
            });
          }
          
          // Check permissions for server channels
          if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.followUp({
              content: '❌ You need the "Manage Messages" permission to use this command.',
              flags: 64 // EPHEMERAL
            });
          }
          
          // Check channel access
          const channel = interaction.channel;
          if (!channel) {
            return interaction.followUp({
              content: '❌ Unable to access channel. Please try again.',
              flags: 64 // EPHEMERAL
            });
          }
          
          if (!channel.messages) {
            return interaction.followUp({
              content: '❌ Unable to access message history in this channel.',
              flags: 64 // EPHEMERAL
            });
          }
          
          if (targetUser) {
            // Clear specified user's DMs
            try {
              console.log(`🗑️ Clearing DMs for user: ${targetUser.tag}${clearAll ? ' (ALL messages)' : ` (${amount} messages)`}`);
              
              // Get the target user's DM channel
              const dmChannel = await targetUser.createDM();
              
              if (!dmChannel) {
                return interaction.followUp({
                  content: `❌ Unable to access ${targetUser.tag}'s DM channel.`,
                  flags: 64 // EPHEMERAL
                });
              }
              
              let totalDeleted = 0;
              let hasMore = true;
              let lastMessageId = null;
              
              // Loop to delete all messages if clearAll is true
              while (hasMore) {
                const fetchOptions = { limit: Math.min(amount, 100) };
                if (lastMessageId) {
                  fetchOptions.before = lastMessageId;
                }
                
                const messages = await dmChannel.messages.fetch(fetchOptions);
                const botMessages = messages.filter(msg => msg.author.id === service.client.user.id);
                
                if (botMessages.size === 0) {
                  hasMore = false;
                  break;
                }
                
                // Store last message ID for next iteration
                const sortedMessages = Array.from(botMessages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
                if (sortedMessages.length > 0) {
                  lastMessageId = sortedMessages[0].id;
                }
                
                let batchDeleted = 0;
                for (const [id, message] of botMessages) {
                  try {
                    await message.delete();
                    batchDeleted++;
                    totalDeleted++;
                    // Small delay to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 100));
                  } catch (error) {
                    console.error(`Failed to delete message ${id}:`, error);
                  }
                }
                
                // If not clearing all, or if we got fewer messages than requested, we're done
                if (!clearAll || messages.size < amount || batchDeleted === 0) {
                  hasMore = false;
                }
                
                // Rate limit protection - small delay between batches
                if (hasMore) {
                  await new Promise(resolve => setTimeout(resolve, 500));
                }
              }
              
              if (totalDeleted === 0) {
                return interaction.followUp({
                  content: `❌ No bot messages found in ${targetUser.tag}'s DMs.`,
                  flags: 64 // EPHEMERAL
                });
              }
              
              await interaction.followUp({
                content: `✅ Deleted ${totalDeleted} bot message${totalDeleted !== 1 ? 's' : ''} from ${targetUser.tag}'s DMs.`,
                flags: 64 // EPHEMERAL
              });
              
            } catch (dmError) {
              console.error('DM clearing error:', dmError);
              return interaction.followUp({
                content: `❌ Unable to clear ${targetUser.tag}'s DMs. Please try again later.`,
                flags: 64 // EPHEMERAL
              });
            }
          } else {
            // Clear current channel
            console.log(`🗑️ Clearing current channel: ${channel.name}${clearAll ? ' (ALL messages)' : ` (${amount} messages)`}`);
            
            let totalDeleted = 0;
            let hasMore = true;
            let lastMessageId = null;
            
            // Loop to delete all messages if clearAll is true
            while (hasMore) {
              const fetchOptions = { limit: Math.min(amount, 100) };
              if (lastMessageId) {
                fetchOptions.before = lastMessageId;
              }
              
              const messages = await channel.messages.fetch(fetchOptions);
              const botMessages = messages.filter(msg => msg.author.id === service.client.user.id);
              
              if (botMessages.size === 0) {
                hasMore = false;
                break;
              }
              
              // Store last message ID for next iteration
              const sortedMessages = Array.from(botMessages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
              if (sortedMessages.length > 0) {
                lastMessageId = sortedMessages[0].id;
              }
              
              let batchDeleted = 0;
              for (const [id, message] of botMessages) {
                try {
                  await message.delete();
                  batchDeleted++;
                  totalDeleted++;
                  // Small delay to avoid rate limits
                  await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                  console.error(`Failed to delete message ${id}:`, error);
                }
              }
              
              // If not clearing all, or if we got fewer messages than requested, we're done
              if (!clearAll || messages.size < amount || batchDeleted === 0) {
                hasMore = false;
              }
              
              // Rate limit protection - small delay between batches
              if (hasMore) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }
            
            if (totalDeleted === 0) {
              return interaction.followUp({
                content: '❌ No bot messages found to delete in this channel.',
                flags: 64 // EPHEMERAL
              });
            }
            
            await interaction.followUp({
              content: `✅ Deleted ${totalDeleted} bot message${totalDeleted !== 1 ? 's' : ''} in this channel.`,
              flags: 64 // EPHEMERAL
            });
          }
          
        } catch (error) {
          console.error('❌ Error in /clear command:', error);
          
          try {
            if (interaction.replied || interaction.deferred) {
              await interaction.followUp({
                content: '❌ An error occurred while deleting messages.',
                flags: 64 // EPHEMERAL
              });
            } else {
              await interaction.reply({
                content: '❌ An error occurred while deleting messages.',
                ephemeral: interaction.inGuild()
              });
            }
          } catch (replyError) {
            console.error('❌ Failed to send error message:', replyError);
          }
        }
      }
    };

    // DM rm -rf command - Delete all bot DM messages (Admin only)
    const dmRmRfCommand = {
      data: new SlashCommandBuilder()
        .setName('dm-rm-rf')
        .setDescription('Delete all bot messages from all DMs (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Admin only
      async execute(interaction, service) {
        const userId = interaction.user.id;
        const isAdmin = service.allowedAdmins.includes(userId);
        
        if (!isAdmin) {
          return interaction.reply({
            content: '❌ Only administrators can use this command.',
            ephemeral: interaction.inGuild()
          });
        }
        
        try {
          await interaction.deferReply({ ephemeral: interaction.inGuild() });
          
          console.log(`🗑️ /dm-rm-rf command executed by ${interaction.user.tag}`);
          
          // Get all DM channels the bot has access to
          const dmChannels = service.client.channels.cache.filter(channel => channel.isDMBased());
          
          if (dmChannels.size === 0) {
            return interaction.followUp({
              content: '✅ No DM channels found. All DMs are already clean.',
              ephemeral: interaction.inGuild()
            });
          }
          
          let totalDeleted = 0;
          let totalChannels = 0;
          let errors = 0;
          
          // Process each DM channel
          for (const [channelId, channel] of dmChannels) {
            try {
              if (!channel.isDMBased() || !channel.messages) continue;
              
              totalChannels++;
              
              // Fetch all messages from this DM channel
              let hasMore = true;
              let lastMessageId = null;
              
              while (hasMore) {
                const fetchOptions = { limit: 100 };
                if (lastMessageId) {
                  fetchOptions.before = lastMessageId;
                }
                
                const messages = await channel.messages.fetch(fetchOptions);
                
                if (messages.size === 0) {
                  hasMore = false;
                  break;
                }
                
                // Filter to only bot messages
                const botMessages = messages.filter(msg => msg.author.id === service.client.user.id);
                
                // Delete bot messages
                for (const [msgId, message] of botMessages) {
                  try {
                    await message.delete();
                    totalDeleted++;
                    // Small delay to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 100));
                  } catch (deleteError) {
                    console.error(`Failed to delete message ${msgId}:`, deleteError);
                    errors++;
                  }
                }
                
                // Update lastMessageId for next iteration
                if (messages.size > 0) {
                  lastMessageId = messages.last()?.id;
                } else {
                  hasMore = false;
                }
                
                // If we got less than 100 messages, we've reached the end
                if (messages.size < 100) {
                  hasMore = false;
                }
              }
            } catch (channelError) {
              console.error(`Error processing DM channel ${channelId}:`, channelError);
              errors++;
            }
          }
          
          const embed = new EmbedBuilder()
            .setTitle('✅ DM Cleanup Complete')
            .setDescription(`Deleted all bot messages from all DM channels`)
            .addFields(
              { name: 'DM Channels Processed', value: `${totalChannels}`, inline: true },
              { name: 'Messages Deleted', value: `${totalDeleted}`, inline: true },
              { name: 'Errors', value: `${errors}`, inline: true }
            )
            .setColor(0x00FF00)
            .setTimestamp();
          
          await interaction.followUp({ embeds: [embed], ephemeral: interaction.inGuild() });
          
        } catch (error) {
          console.error('❌ Error in /dm-rm-rf command:', error);
          
          try {
            if (interaction.replied || interaction.deferred) {
              await interaction.followUp({
                content: '❌ An error occurred while deleting DM messages.',
                ephemeral: interaction.inGuild()
              });
            } else {
              await interaction.reply({
                content: '❌ An error occurred while deleting DM messages.',
                ephemeral: interaction.inGuild()
              });
            }
          } catch (replyError) {
            console.error('❌ Failed to send error message:', replyError);
          }
        }
      }
    };

    // Add all commands to collection
    this.commands.set('register', registerCommand);
    this.commands.set('link-account', linkAccountCommand);
    this.commands.set('my-accounts', myAccountsCommand);
    this.commands.set('list-accounts', listAccountsCommand);
    this.commands.set('check-accounts', checkAccountsCommand);
    this.commands.set('deregister', deregisterCommand);
    this.commands.set('clear', clearCommand);
    this.commands.set('dm-rm-rf', dmRmRfCommand);
    this.commands.set('help', helpCommand);
    this.commands.set('md', mdCommand);
    this.commands.set('server-status', serverStatusCommand);
    this.commands.set('website-status', websiteStatusCommand);
    this.commands.set('ping-discord', pingDiscordCommand);
    this.commands.set('ping-website', pingWebsiteCommand);
  }

  async registerSlashCommands() {
    try {
      const commands = Array.from(this.commands.values()).map(cmd => cmd.data.toJSON());
      
      console.log(`📝 Registering ${commands.length} slash commands...`);
      console.log(`   Commands: ${commands.map(c => c.name).join(', ')}`);
      
      // Register to specific guild if DISCORD_GUILD_ID is set (appears immediately)
      const guildId = process.env.DISCORD_GUILD_ID;
      if (guildId) {
        try {
          // Wait a bit for guilds to be available
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Try to get guild from cache first
          let guild = this.client.guilds.cache.get(guildId);
          
          if (!guild) {
            console.log(`🔍 Guild ${guildId} not in cache, fetching...`);
            // Try fetching the guild
            try {
              guild = await this.client.guilds.fetch(guildId);
            } catch (fetchError) {
              console.log(`⚠️ Could not fetch guild ${guildId}: ${fetchError.message}`);
              guild = null;
            }
          }
          
          if (guild) {
            // Use set() which intelligently updates commands without full deletion
            console.log(`🔄 Updating guild commands for: ${guild.name} (${guildId})`);
            await guild.commands.set(commands);
            console.log(`✅ Registered ${commands.length} slash commands to guild instantly`);
          } else {
            console.log(`⚠️ Guild ${guildId} not found or bot is not a member`);
            const availableGuilds = Array.from(this.client.guilds.cache.values());
            if (availableGuilds.length > 0) {
              console.log(`📋 Bot is a member of these guilds:`);
              availableGuilds.forEach(g => {
                console.log(`   - ${g.name} (${g.id})`);
              });
            } else {
              console.log(`📋 Bot is not a member of any guilds`);
            }
            console.log(`💡 Tip: Make sure the bot is invited to the guild with ID ${guildId}`);
          }
        } catch (guildError) {
          console.error(`❌ Failed to register commands to guild: ${guildError.message}`);
          const availableGuilds = Array.from(this.client.guilds.cache.values());
          if (availableGuilds.length > 0) {
            console.log(`📋 Bot is a member of these guilds:`);
            availableGuilds.forEach(g => {
              console.log(`   - ${g.name} (${g.id})`);
            });
          }
        }
      }
      
      // Register commands globally (takes up to 1 hour to appear)
      // Use set() which intelligently updates commands
      console.log(`🌐 Registering commands globally (may take up to 1 hour to propagate)...`);
      await this.client.application.commands.set(commands);
      console.log(`✅ Registered ${commands.length} slash commands globally`);
      
      if (!guildId) {
        console.log(`⚠️ DISCORD_GUILD_ID not set, commands will only be registered globally (may take up to 1 hour to appear)`);
      }
      
      console.log(`✅ Command registration complete!`);
    } catch (error) {
      console.error('❌ Failed to register slash commands:', error);
      throw error;
    }
  }

  // Change bot status (called from website API)
  async changeBotStatus(status) {
    if (!this.isReady) {
      console.log('⚠️ Discord bot not ready, cannot change status');
      return { success: false, error: 'Bot not ready' };
    }

    try {
      // Validate status
      const validStatuses = ['online', 'idle', 'dnd', 'invisible'];
      if (!validStatuses.includes(status)) {
        return { success: false, error: 'Invalid status. Must be: online, idle, dnd, or invisible' };
      }

      // Convert invisible to dnd since Discord doesn't allow invisible for bots
      const actualStatus = status === 'invisible' ? 'dnd' : status;
      
      console.log(`🔄 Changing bot status to: ${actualStatus} (requested: ${status})`);
      
      // Update environment variable
      process.env.DISCORD_BOT_STATUS = actualStatus;
      
      // Set the bot's presence
      await this.client.user.setPresence({
        status: actualStatus,
        activities: [{
          name: 'https://8ballpool.website/8bp-rewards/home',
          type: ActivityType.Watching
        }]
      });
      
      console.log(`✅ Bot status changed to: ${actualStatus}`);
      
      return { 
        success: true, 
        status: actualStatus,
        requestedStatus: status,
        message: `Bot status changed to ${actualStatus.toUpperCase()}`
      };
      
    } catch (error) {
      console.error('❌ Error changing bot status:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  // Toggle bot on/off (called from website API)
  async toggleBot(enabled) {
    try {
      if (enabled) {
        // Enable bot - try to login if not already connected
        if (!this.isReady) {
          console.log('🔄 Bot is disabled, attempting to enable...');
          const loginResult = await this.login();
          if (loginResult) {
            console.log('✅ Bot enabled successfully');
            return { 
              success: true, 
              enabled: true,
              message: 'Bot enabled successfully'
            };
          } else {
            console.log('⚠️ Discord login failed - likely rate limited');
            return { 
              success: false, 
              error: 'Discord API rate limit reached. Bot will auto-retry when limit resets.',
              retryAfter: '2025-10-19T00:00:00.000Z'
            };
          }
        } else {
          console.log('✅ Bot is already enabled');
          return { 
            success: true, 
            enabled: true,
            message: 'Bot is already enabled'
          };
        }
      } else {
        // Disable bot - logout from Discord
        if (this.isReady) {
          console.log('🔄 Disabling bot...');
          await this.logout();
          console.log('✅ Bot disabled successfully');
          return { 
            success: true, 
            enabled: false,
            message: 'Bot disabled successfully'
          };
        } else {
          console.log('✅ Bot is already disabled');
          return { 
            success: true, 
            enabled: false,
            message: 'Bot is already disabled'
          };
        }
      }
    } catch (error) {
      console.error('❌ Error toggling bot:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  // Get current bot status
  async getBotStatus() {
    try {
      const environmentStatus = process.env.DISCORD_BOT_STATUS || 'dnd';
      
      if (!this.isReady) {
        return { 
          success: true, 
          currentStatus: 'offline',
          environmentStatus: environmentStatus,
          botReady: false,
          botTag: null,
          message: 'Bot is offline - Discord connection failed'
        };
      }

      const currentStatus = this.client.user.presence?.status || 'unknown';
      
      return {
        success: true,
        currentStatus: currentStatus,
        environmentStatus: environmentStatus,
        botReady: this.isReady,
        botTag: this.client.user.tag,
        message: 'Bot is online and ready'
      };
    } catch (error) {
      console.error('❌ Error getting bot status:', error);
      return { 
        success: true, 
        currentStatus: 'offline',
        environmentStatus: process.env.DISCORD_BOT_STATUS || 'dnd',
        botReady: false,
        botTag: null,
        message: 'Bot status unknown - error occurred'
      };
    }
  }

  async cleanupUserDMScreenshots(userObj, bpAccountId) {
    if (!this.client || !this.client.user) {
      return 0;
    }

    try {
      const dmChannel = await userObj.createDM();
      if (!dmChannel || !dmChannel.messages) {
        return 0;
      }

      const messages = await dmChannel.messages.fetch({ limit: 50 });
      let deletedCount = 0;

      for (const message of messages.values()) {
        if (message.author.id !== this.client.user.id) {
          continue;
        }

        const hasMatchingAttachment = Array.from(message.attachments.values()).some(attachment => {
          return attachment.name && attachment.name.includes(`8bp-claim-${bpAccountId}`);
        });

        const hasMatchingEmbed = (message.embeds || []).some(embed => {
          const titleMatch = embed.title && embed.title.includes('8 BALL POOL REWARD');
          const fieldMatch = Array.isArray(embed.fields)
            ? embed.fields.some(field => field.value && field.value.includes(bpAccountId))
            : false;
          return titleMatch || fieldMatch;
        });

        if (hasMatchingAttachment || hasMatchingEmbed) {
          try {
            await message.delete();
            deletedCount++;
            // Tiny delay to avoid hitting rate limits
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (deleteError) {
            console.log(`⚠️ Failed to delete old DM message for ${bpAccountId}: ${deleteError.message}`);
          }
        }
      }

      if (deletedCount > 0) {
        console.log(`🧹 Tidied ${deletedCount} old DM screenshot message(s) for account ${bpAccountId}`);
      }

      return deletedCount;
    } catch (error) {
      console.log(`⚠️ Could not tidy DM screenshots for ${bpAccountId}: ${error.message}`);
      return 0;
    }
  }

  // Send confirmation message with screenshot to Discord
  async sendConfirmation(bpAccountId, imagePath, claimedItems = []) {
    if (!this.isReady) {
      console.log('⚠️ Discord bot not ready, skipping confirmation');
      return false;
    }

    try {
      // Rate limiting check
      const now = Date.now();
      if (now - this.lastMessageTime < this.minMessageInterval) {
        console.log(`⏳ Rate limiting: waiting ${this.minMessageInterval - (now - this.lastMessageTime)}ms before sending next message`);
        await new Promise(resolve => setTimeout(resolve, this.minMessageInterval - (now - this.lastMessageTime)));
      }

      // LAYER 1: In-memory duplicate prevention - only check if we've already sent a Discord message
      // We don't check database records here because:
      // 1. The claim record may have just been saved (causing false positives)
      // 2. Database records track claims, not Discord messages sent
      // 3. We want to allow multiple claims per day and send Discord for each
      // Use a shorter window (2 minutes) to prevent duplicate messages from the same claim attempt
      const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const messageKey = `${bpAccountId}-${today.toISOString().split('T')[0]}`;
      
      // Only check in-memory cache if we've sent a message recently (within 2 minutes)
      // This prevents duplicate messages from the same claim attempt, but allows new claims later
      if (this.sentMessages.has(messageKey)) {
        const lastSentTime = this.sentMessages.get(messageKey);
        if (lastSentTime > twoMinutesAgo) {
          const secondsAgo = Math.floor((Date.now() - lastSentTime) / 1000);
          console.log(`⏭️ Duplicate message prevented (memory check) for user ${bpAccountId} - message sent ${secondsAgo}s ago`);
          return false;
        } else {
          // Clear old entry if it's been more than 2 minutes (allow new claims)
          this.sentMessages.delete(messageKey);
        }
      }

      // Find user in database by 8BP account ID
      const users = await this.dbService.getAllUsers();
      const user = users.find(u => u.eightBallPoolId === bpAccountId);
      
      if (!user) {
        console.log(`⚠️ No user found for 8BP account: ${bpAccountId}`);
        return false;
      }

      const username = user.username || 'Unknown User';
      
      // Create image attachment if path exists
      let imageAttachment = null;
      if (imagePath && require('fs').existsSync(imagePath)) {
        imageAttachment = new AttachmentBuilder(imagePath, {
          name: `8bp-claim-${bpAccountId}.png`,
          description: `8 Ball Pool claim confirmation for account ${bpAccountId}`
        });
      }
      
      // Create confirmation message with embedded image
      const embed = new EmbedBuilder()
        .setTitle('🎱 8 BALL POOL REWARD CLAIMED')
        .setDescription(`**${username}** has successfully claimed their rewards!`)
        .addFields(
          { name: '🎱 Account ID', value: bpAccountId, inline: true },
          { name: '👤 User', value: username, inline: true },
          { name: '📦 Items Claimed', value: claimedItems.length > 0 ? claimedItems.join(', ') : 'Various rewards', inline: false },
          { name: '⏰ Claimed At', value: new Date().toLocaleString(), inline: true },
          { name: '📊 Status', value: 'Successfully claimed', inline: true }
        )
        .setColor(0xFFD700) // Gold color to match the banner
        .setTimestamp();

      // Set image at the bottom of the embed if screenshot exists
      if (imageAttachment) {
        embed.setImage(`attachment://8bp-claim-${bpAccountId}.png`);
      }

      // Send to rewards channel if configured
      const channelId = process.env.REWARDS_CHANNEL_ID;
      if (channelId) {
        const channel = this.client.channels.cache.get(channelId);
        if (channel && channel.isTextBased()) {
          const messageOptions = { embeds: [embed] };
          if (imageAttachment) {
            messageOptions.files = [imageAttachment];
          }
          
          await channel.send(messageOptions);
          console.log(`✅ Confirmation sent to rewards channel for ${username} (${bpAccountId})`);
          
          // Mark message as sent and update timestamp
          this.sentMessages.set(messageKey, now);
          this.lastMessageTime = now;
          console.log(`✅ Discord message sent and marked as sent for user ${bpAccountId}`);
        }
      }

      // Send DM to admins if user is in allowed admins
      const userId = user.discordId || user.eightBallPoolId; // Fallback to 8BP ID if no Discord ID
      if (this.allowedAdmins.includes(userId)) {
        try {
          const userObj = await this.client.users.fetch(userId);
          if (userObj) {
            const dmOptions = { embeds: [embed] };
            if (imageAttachment) {
              dmOptions.files = [imageAttachment];
            }

            if (imageAttachment) {
              await this.cleanupUserDMScreenshots(userObj, bpAccountId);
            }
            
            await userObj.send(dmOptions);
            console.log(`📩 DM sent to admin: ${username}`);
          }
        } catch (dmError) {
          console.log(`⚠️ Could not send DM to ${username}: ${dmError.message}`);
        }
      }

      // Keep screenshots for website display - don't clean up automatically
      if (imagePath && require('fs').existsSync(imagePath)) {
        console.log(`📸 Screenshot saved for website: ${imagePath}`);
      }

      return true;

    } catch (error) {
      console.error('❌ Error sending Discord confirmation:', error.message);
      return false;
    }
  }

  // Clean up old message records to prevent memory leaks
  cleanupOldMessages() {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000); // 24 hours ago
    
    let cleanedCount = 0;
    for (const [key, timestamp] of this.sentMessages.entries()) {
      if (timestamp < oneDayAgo) {
        this.sentMessages.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old Discord message records`);
    }
  }

  // Clear all sent message records (useful for testing or manual reset)
  clearSentMessages() {
    const count = this.sentMessages.size;
    this.sentMessages.clear();
    console.log(`🧹 Cleared ${count} Discord message records`);
  }

  /**
   * Delete old bot messages from the rewards channel
   * This is called 2 minutes before scheduled claims to tidy up the channel
   */
  async clearOldRewardsChannelMessages() {
    try {
      // Use REWARDS_CHANNEL_ID from environment variables
      const channelId = process.env.REWARDS_CHANNEL_ID;
      if (!channelId) {
        console.log('⚠️ REWARDS_CHANNEL_ID not configured in .env, skipping message cleanup');
        return;
      }

      const channel = this.client.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) {
        console.log(`⚠️ Channel ${channelId} not found or not a text channel`);
        return;
      }

      console.log(`🧹 Starting cleanup of old bot messages in rewards channel...`);
      
      // Get the bot's user ID
      const botUserId = this.client.user.id;
      let deletedCount = 0;
      let lastMessageId = null;
      const batchSize = 100; // Discord API limit per request
      const maxMessagesToCheck = 1000; // Limit to prevent excessive API calls
      let messagesChecked = 0;

      // Fetch and delete messages in batches
      while (messagesChecked < maxMessagesToCheck) {
        const options = { limit: batchSize };
        if (lastMessageId) {
          options.before = lastMessageId;
        }

        const messages = await channel.messages.fetch(options);
        
        if (messages.size === 0) {
          break; // No more messages
        }

        // Filter to only bot messages
        const botMessages = messages.filter(msg => msg.author.id === botUserId);
        
        // Delete bot messages in batches (Discord allows bulk delete of messages up to 14 days old)
        const messagesToDelete = Array.from(botMessages.values());
        
        if (messagesToDelete.length > 0) {
          // Discord bulk delete requires messages to be less than 14 days old
          // For older messages, delete individually
          const now = Date.now();
          const fourteenDaysAgo = now - (14 * 24 * 60 * 60 * 1000);
          
          const recentMessages = messagesToDelete.filter(msg => msg.createdTimestamp > fourteenDaysAgo);
          const oldMessages = messagesToDelete.filter(msg => msg.createdTimestamp <= fourteenDaysAgo);

          // Bulk delete recent messages (if 2 or more)
          if (recentMessages.length >= 2) {
            try {
              await channel.bulkDelete(recentMessages.map(msg => msg.id));
              deletedCount += recentMessages.length;
              console.log(`✅ Bulk deleted ${recentMessages.length} recent bot messages`);
            } catch (bulkError) {
              console.log(`⚠️ Bulk delete failed, trying individual deletes: ${bulkError.message}`);
              // Fall back to individual deletes
              for (const msg of recentMessages) {
                try {
                  await msg.delete();
                  deletedCount++;
                } catch (deleteError) {
                  console.log(`⚠️ Failed to delete message ${msg.id}: ${deleteError.message}`);
                }
              }
            }
          } else if (recentMessages.length === 1) {
            // Single message, delete individually
            try {
              await recentMessages[0].delete();
              deletedCount++;
            } catch (deleteError) {
              console.log(`⚠️ Failed to delete message ${recentMessages[0].id}: ${deleteError.message}`);
            }
          }

          // Delete old messages individually
          for (const msg of oldMessages) {
            try {
              await msg.delete();
              deletedCount++;
            } catch (deleteError) {
              console.log(`⚠️ Failed to delete old message ${msg.id}: ${deleteError.message}`);
            }
          }
        }

        // Update for next iteration
        lastMessageId = messages.last()?.id;
        messagesChecked += messages.size;

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`✅ Cleaned up ${deletedCount} old bot messages from rewards channel`);
      return deletedCount;
    } catch (error) {
      console.error('❌ Error clearing old rewards channel messages:', error.message);
      return 0;
    }
  }

  // Get duplicate protection status for debugging
  getDuplicateProtectionStatus() {
    return {
      totalTrackedMessages: this.sentMessages.size,
      lastMessageTime: this.lastMessageTime,
      minMessageInterval: this.minMessageInterval,
      cleanupInterval: this.cleanupInterval ? 'active' : 'inactive'
    };
  }

  async logout() {
    if (this.client) {
      await this.client.destroy();
      console.log('🔒 Discord bot logged out');
    }
    
    if (this.dbService) {
      await this.dbService.disconnect();
    }
    
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // Send notification to rewards channel
  async sendRewardsNotification(eightBallPoolId, websiteUserId, timestampUTC) {
    try {
      const channelId = process.env.REWARDS_CHANNEL_ID;
      if (!channelId) return false;

      const channel = this.client.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) return false;

      const embed = new EmbedBuilder()
        .setTitle('🎁 New Registration')
        .setDescription('A new user has registered for automated rewards!')
        .addFields(
          { name: '🎱 8BP Account ID', value: eightBallPoolId, inline: true },
          { name: '👤 Website User ID', value: websiteUserId, inline: true },
          { name: '⏰ Registered At', value: timestampUTC, inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp();

      await channel.send({ embeds: [embed] });
      return true;
    } catch (error) {
      console.error('❌ Failed to send rewards notification:', error);
      return false;
    }
  }

  // Send scheduler summary to scheduler channel
  async sendSchedulerSummary(summary) {
    try {
      const channelId = process.env.SCHEDULER_CHANNEL_ID;
      if (!channelId) return false;

      const channel = this.client.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) return false;

      const embed = new EmbedBuilder()
        .setTitle('⏰ Scheduler Run Summary')
        .setDescription(`Automated reward claiming completed`)
        .addFields(
          { name: '📊 Total Attempted', value: summary.totalAttempted.toString(), inline: true },
          { name: '✅ Successful', value: summary.totalSucceeded.toString(), inline: true },
          { name: '❌ Failed', value: summary.totalFailed.toString(), inline: true },
          { name: '⏰ UTC Timestamp', value: summary.timestampUTC, inline: false }
        )
        .setColor(summary.totalFailed > 0 ? 0xFFA500 : 0x00FF00)
        .setTimestamp();

      // Add per-user details if provided
      if (summary.perUser && summary.perUser.length > 0) {
        let userDetails = '';
        summary.perUser.forEach((user, index) => {
          if (index < 10) { // Limit to first 10 users to avoid embed limits
            const status = user.status === 'success' ? '✅' : '❌';
            const items = user.itemsClaimed ? user.itemsClaimed.join(', ') : user.error || 'No items';
            userDetails += `${status} **${user.eightBallPoolId}** (${user.websiteUserId}): ${items}\n`;
          }
        });
        
        if (summary.perUser.length > 10) {
          userDetails += `... and ${summary.perUser.length - 10} more users`;
        }
        
        embed.addFields({ name: '👥 Per-User Results', value: userDetails, inline: false });
      }

      await channel.send({ embeds: [embed] });
      return true;
    } catch (error) {
      console.error('❌ Failed to send scheduler summary:', error);
      return false;
    }
  }

  // Send failure notification to all admins
  async sendFailureNotification(errorMessage) {
    try {
      for (const adminId of this.allowedAdmins) {
        try {
          const user = await this.client.users.fetch(adminId);
          if (user) {
            const embed = new EmbedBuilder()
              .setTitle('🚨 System Failure Alert')
              .setDescription('A critical error has occurred in the 8BP Rewards system')
              .addFields(
                { name: '❌ Error', value: errorMessage, inline: false },
                { name: '⏰ Timestamp', value: new Date().toISOString(), inline: false }
              )
              .setColor(0xFF0000)
              .setTimestamp();

            await user.send({ embeds: [embed] });
          }
        } catch (userError) {
          console.error(`❌ Failed to send DM to admin ${adminId}:`, userError);
        }
      }
      return true;
    } catch (error) {
      console.error('❌ Failed to send failure notifications:', error);
      return false;
    }
  }
}

module.exports = DiscordService;
