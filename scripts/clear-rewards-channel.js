#!/usr/bin/env node

/**
 * Script to clear old bot messages from the rewards channel
 * This can be run manually to clean up the channel
 */

const dotenv = require('dotenv');
const DiscordService = require('../services/discord-service');

// Load environment variables
dotenv.config();

async function clearRewardsChannel() {
  console.log('🧹 Starting manual cleanup of rewards channel...');
  
  const discordService = new DiscordService();
  
  try {
    // Login to Discord
    console.log('🤖 Logging into Discord...');
    const loggedIn = await discordService.login();
    
    if (!loggedIn) {
      console.error('❌ Failed to login to Discord');
      process.exit(1);
    }
    
    // Wait a moment for the client to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Clear old messages
    console.log('🧹 Clearing old bot messages...');
    const deletedCount = await discordService.clearOldRewardsChannelMessages();
    
    console.log(`✅ Cleanup complete! Deleted ${deletedCount} messages.`);
    
    // Logout
    await discordService.logout();
    console.log('🔒 Logged out from Discord');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    await discordService.logout().catch(() => {});
    process.exit(1);
  }
}

// Run the cleanup
clearRewardsChannel();


