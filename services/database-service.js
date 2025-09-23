const mongoose = require('mongoose');
const UserMapping = require('../models/UserMapping');

class DatabaseService {
  constructor() {
    this.isConnected = false;
    this.connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/8bp-rewards';
  }

  async connect() {
    try {
      if (this.isConnected) {
        console.log('📊 Database already connected');
        return true;
      }

      console.log('🔗 Connecting to MongoDB...');
      
      await mongoose.connect(this.connectionString, {
        serverSelectionTimeoutMS: 5000
      });

      this.isConnected = true;
      console.log('✅ Connected to MongoDB successfully');
      
      // Handle connection events
      mongoose.connection.on('error', (error) => {
        console.error('❌ MongoDB connection error:', error);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        console.log('⚠️ MongoDB disconnected');
        this.isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        console.log('🔄 MongoDB reconnected');
        this.isConnected = true;
      });

      return true;
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.isConnected) {
        await mongoose.disconnect();
        this.isConnected = false;
        console.log('🔒 Disconnected from MongoDB');
      }
    } catch (error) {
      console.error('❌ Error disconnecting from MongoDB:', error.message);
    }
  }

  // Add or update a user mapping (override existing if same Discord ID or 8BP ID)
  async addOrUpdateUser(discordId, bpAccountId, username) {
    try {
      await this.ensureConnection();

      // Check for existing Discord user
      const existingDiscordUser = await UserMapping.findByDiscordId(discordId);
      
      // Check for existing 8BP account
      const existingBpAccount = await UserMapping.findByBpAccountId(bpAccountId);

      let overrideMessage = '';

      // Remove existing Discord user if different
      if (existingDiscordUser && existingDiscordUser.bpAccountId !== bpAccountId) {
        await UserMapping.findByIdAndDelete(existingDiscordUser._id);
        overrideMessage = `🔄 **Replaced your previous account** (${existingDiscordUser.bpAccountId})`;
      }

      // Remove existing 8BP account if different Discord user
      if (existingBpAccount && existingBpAccount.discordId !== discordId) {
        await UserMapping.findByIdAndDelete(existingBpAccount._id);
        if (overrideMessage) {
          overrideMessage += `\n🔄 **Overrode existing 8BP ID (${bpAccountId})** previously registered by ${existingBpAccount.username}`;
        } else {
          overrideMessage = `🔄 **Overrode existing 8BP ID (${bpAccountId})** previously registered by ${existingBpAccount.username}`;
        }
      }

      // Create new user mapping
      const userMapping = new UserMapping({
        discordId,
        bpAccountId,
        username
      });

      await userMapping.save();
      console.log(`✅ User mapping saved: ${username} (${bpAccountId}) -> ${discordId}`);

      return {
        success: true,
        user: userMapping,
        overrideMessage
      };

    } catch (error) {
      console.error('❌ Error adding/updating user:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get all user mappings
  async getAllUsers() {
    try {
      await this.ensureConnection();
      const users = await UserMapping.getAllUsers();
      console.log(`📋 Retrieved ${users.length} user mappings from database`);
      return users;
    } catch (error) {
      console.error('❌ Error getting all users:', error.message);
      return [];
    }
  }

  // Get user by Discord ID
  async getUserByDiscordId(discordId) {
    try {
      await this.ensureConnection();
      return await UserMapping.findByDiscordId(discordId);
    } catch (error) {
      console.error('❌ Error getting user by Discord ID:', error.message);
      return null;
    }
  }

  // Get user by 8BP Account ID
  async getUserByBpAccountId(bpAccountId) {
    try {
      await this.ensureConnection();
      return await UserMapping.findByBpAccountId(bpAccountId);
    } catch (error) {
      console.error('❌ Error getting user by 8BP Account ID:', error.message);
      return null;
    }
  }

  // Remove user by Discord ID
  async removeUserByDiscordId(discordId) {
    try {
      await this.ensureConnection();
      const result = await UserMapping.findOneAndDelete({ discordId });
      if (result) {
        console.log(`🗑️ Removed user mapping: ${result.username} (${result.bpAccountId})`);
        return { success: true, user: result };
      } else {
        return { success: false, error: 'User not found' };
      }
    } catch (error) {
      console.error('❌ Error removing user:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Remove user by 8BP Account ID
  async removeUserByBpAccountId(bpAccountId) {
    try {
      await this.ensureConnection();
      const result = await UserMapping.findOneAndDelete({ bpAccountId });
      if (result) {
        console.log(`🗑️ Removed user mapping: ${result.username} (${result.bpAccountId})`);
        return { success: true, user: result };
      } else {
        return { success: false, error: 'User not found' };
      }
    } catch (error) {
      console.error('❌ Error removing user:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Update claim statistics for a user
  async updateClaimStats(discordId) {
    try {
      await this.ensureConnection();
      const user = await UserMapping.findByDiscordId(discordId);
      if (user) {
        await user.updateClaimStats();
        console.log(`📊 Updated claim stats for ${user.username}: ${user.totalClaims} total claims`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Error updating claim stats:', error.message);
      return false;
    }
  }

  // Get user count
  async getUserCount() {
    try {
      await this.ensureConnection();
      const count = await UserMapping.countDocuments();
      return count;
    } catch (error) {
      console.error('❌ Error getting user count:', error.message);
      return 0;
    }
  }

  // Backup database to JSON file
  async backupToFile(filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`) {
    try {
      await this.ensureConnection();
      const users = await this.getAllUsers();
      
      const backupData = {
        timestamp: new Date().toISOString(),
        totalUsers: users.length,
        users: users.map(user => ({
          discordId: user.discordId,
          bpAccountId: user.bpAccountId,
          username: user.username,
          createdAt: user.createdAt,
          lastClaimed: user.lastClaimed,
          totalClaims: user.totalClaims
        }))
      };

      const fs = require('fs');
      fs.writeFileSync(filename, JSON.stringify(backupData, null, 2));
      console.log(`💾 Database backed up to ${filename}`);
      return { success: true, filename, userCount: users.length };
    } catch (error) {
      console.error('❌ Error creating backup:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Ensure database connection
  async ensureConnection() {
    if (!this.isConnected) {
      await this.connect();
    }
  }

  // Health check
  async healthCheck() {
    try {
      await this.ensureConnection();
      const count = await this.getUserCount();
      return {
        connected: this.isConnected,
        userCount: count,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = DatabaseService;
