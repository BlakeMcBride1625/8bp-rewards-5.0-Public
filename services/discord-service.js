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

      // Check if user is in allowed admins list
      const userId = interaction.user.id;
      const isAdmin = this.allowedAdmins.includes(userId);
      
      if (!isAdmin) {
        const errorMessage = '❌ Access denied! Only administrators can use bot commands.';
        
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
        await command.execute(interaction, this);
      } catch (error) {
        console.error(`❌ Error executing command ${interaction.commandName}:`, error);
        const errorMessage = '❌ There was an error while executing this command!';
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: interaction.inGuild() });
        } else {
          await interaction.reply({ 
            content: errorMessage, 
            ephemeral: interaction.inGuild()
          });
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
        .addIntegerOption(option =>
          option.setName('eightballpoolid')
            .setDescription('Your 8 Ball Pool User ID')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('username')
            .setDescription('Your username')
            .setRequired(true)),
      async execute(interaction, service) {
        const eightBallPoolId = interaction.options.getInteger('eightballpoolid').toString();
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
        .setDescription('List all registered accounts'),
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
        .setDescription('Check the status of all registered accounts'),
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

    // Deregister command
    const deregisterCommand = {
      data: new SlashCommandBuilder()
        .setName('deregister')
        .setDescription('Remove your account from the rewards system')
        .addIntegerOption(option =>
          option.setName('eightballpoolid')
            .setDescription('8 Ball Pool User ID to remove')
            .setRequired(true)),
      async execute(interaction, service) {
        const eightBallPoolId = interaction.options.getInteger('eightballpoolid').toString();

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
        .setDescription('Show help information and available commands'),
      async execute(interaction, service) {
        const embed = new EmbedBuilder()
          .setTitle('🤖 8BP Rewards Bot - Help')
          .setDescription('Available commands for administrators:')
          .addFields(
            { name: '/register', value: 'Register your 8 Ball Pool account for automated rewards', inline: false },
            { name: '/list-accounts', value: 'List all registered accounts', inline: false },
            { name: '/check-accounts', value: 'Check the status of all registered accounts', inline: false },
            { name: '/deregister', value: 'Remove your account from the rewards system', inline: false },
            { name: '/clear', value: 'Delete bot messages from current channel or user\'s DMs', inline: false },
            { name: '/help', value: 'Show this help message', inline: false },
            { name: '/md', value: 'Show markdown documentation', inline: false },
            { name: '/server-status', value: 'Check Discord bot server status', inline: false },
            { name: '/website-status', value: 'Check website and backend services status', inline: false },
            { name: '/ping-discord', value: 'Test Discord bot connectivity', inline: false },
            { name: '/ping-website', value: 'Test website connectivity', inline: false }
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
        .setDescription('Show markdown documentation'),
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
        .setDescription('Check the status of the Discord bot server'),
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
        .setDescription('Check the status of the website and backend services'),
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
        .setDescription('Test Discord bot connectivity'),
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
        .setDescription('Test website connectivity'),
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
        .setDescription('Delete bot messages from current channel or specified user\'s DMs')
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('Number of messages to delete (1-100)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100))
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User whose DMs to clear (optional - if not specified, clears current channel)')
            .setRequired(false)),
      async execute(interaction, service) {
        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('user');
        
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
              console.log(`🗑️ Clearing DMs for user: ${targetUser.tag}`);
              
              // Get the target user's DM channel
              const dmChannel = await targetUser.createDM();
              
              if (!dmChannel) {
                return interaction.followUp({
                  content: `❌ Unable to access ${targetUser.tag}'s DM channel.`,
                  flags: 64 // EPHEMERAL
                });
              }
              
              // Fetch messages from the target user's DM channel
              const messages = await dmChannel.messages.fetch({ limit: amount });
              const botMessages = messages.filter(msg => msg.author.id === service.client.user.id);
              
              if (botMessages.size === 0) {
                return interaction.followUp({
                  content: `❌ No bot messages found in ${targetUser.tag}'s DMs.`,
                  flags: 64 // EPHEMERAL
                });
              }
              
              let deletedCount = 0;
              for (const [id, message] of botMessages) {
                try {
                  await message.delete();
                  deletedCount++;
                  // Small delay to avoid rate limits
                  await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                  console.error(`Failed to delete message ${id}:`, error);
                }
              }
              
              await interaction.followUp({
                content: `✅ Deleted ${deletedCount} bot messages from ${targetUser.tag}'s DMs.`,
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
            console.log(`🗑️ Clearing current channel: ${channel.name}`);
            
            const messages = await channel.messages.fetch({ limit: amount });
            const botMessages = messages.filter(msg => msg.author.id === service.client.user.id);
            
            if (botMessages.size === 0) {
              return interaction.followUp({
                content: '❌ No bot messages found to delete in this channel.',
                flags: 64 // EPHEMERAL
              });
            }
            
            let deletedCount = 0;
            for (const [id, message] of botMessages) {
              try {
                await message.delete();
                deletedCount++;
                // Small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
              } catch (error) {
                console.error(`Failed to delete message ${id}:`, error);
              }
            }
            
            await interaction.followUp({
              content: `✅ Deleted ${deletedCount} bot messages in this channel.`,
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

    // Add all commands to collection
    this.commands.set('register', registerCommand);
    this.commands.set('list-accounts', listAccountsCommand);
    this.commands.set('check-accounts', checkAccountsCommand);
    this.commands.set('deregister', deregisterCommand);
    this.commands.set('clear', clearCommand);
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
      
      // Register commands globally
      await this.client.application.commands.set(commands);
      
      console.log(`✅ Registered ${commands.length} slash commands globally`);
    } catch (error) {
      console.error('❌ Failed to register slash commands:', error);
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

      // LAYER 1: Database duplicate check - check if user already claimed today
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      
      console.log(`🔍 Checking for existing claims - user: ${bpAccountId}, today: ${today.toISOString()}`);
      
      try {
        // Check if database service has findClaimRecords method
        if (this.dbService && typeof this.dbService.findClaimRecords === 'function') {
          const existingClaims = await this.dbService.findClaimRecords({
            eightBallPoolId: bpAccountId,
            status: 'success',
            claimedAt: { $gte: today }
          });

          console.log(`🔍 Found ${existingClaims.length} existing claims for user ${bpAccountId} today`);

          // If already claimed successfully today, skip sending Discord message
          if (existingClaims.length > 0) {
            console.log(`⏭️ Duplicate Discord message prevented (DB check) - user ${bpAccountId} already claimed today at ${existingClaims[0].claimedAt.toLocaleTimeString()}`);
            return false;
          }
        } else {
          console.log(`⚠️ Database service doesn't have findClaimRecords method, skipping DB duplicate check`);
        }
      } catch (dbError) {
        console.log(`⚠️ Database duplicate check failed: ${dbError.message}, continuing with in-memory check only`);
      }

      // LAYER 2: In-memory duplicate prevention (backup)
      const messageKey = `${bpAccountId}-${today.toISOString().split('T')[0]}`;
      
      if (this.sentMessages.has(messageKey)) {
        console.log(`⏭️ Duplicate message prevented (memory check) for user ${bpAccountId} on ${today.toISOString().split('T')[0]}`);
        return false;
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
