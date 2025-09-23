#!/usr/bin/env node

/**
 * Migration Script: JSON to MongoDB
 * 
 * This script migrates existing user mappings from user-mapping.json to MongoDB.
 * It preserves all existing data and creates a backup before migration.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DatabaseService = require('../services/database-service');

class MigrationService {
  constructor() {
    this.dbService = new DatabaseService();
    this.jsonFilePath = path.join(__dirname, '..', 'user-mapping.json');
    this.backupPath = path.join(__dirname, '..', `user-mapping-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  }

  async run() {
    try {
      console.log('🚀 Starting migration from JSON to MongoDB...');
      
      // Step 1: Connect to MongoDB
      console.log('📊 Connecting to MongoDB...');
      const connected = await this.dbService.connect();
      if (!connected) {
        throw new Error('Failed to connect to MongoDB');
      }

      // Step 2: Check if JSON file exists
      if (!fs.existsSync(this.jsonFilePath)) {
        console.log('⚠️ No user-mapping.json file found. Migration not needed.');
        return { success: true, message: 'No data to migrate' };
      }

      // Step 3: Create backup of JSON file
      console.log('💾 Creating backup of JSON file...');
      fs.copyFileSync(this.jsonFilePath, this.backupPath);
      console.log(`✅ Backup created: ${this.backupPath}`);

      // Step 4: Read JSON data
      console.log('📖 Reading JSON data...');
      const jsonData = JSON.parse(fs.readFileSync(this.jsonFilePath, 'utf8'));
      const users = jsonData.userMappings || [];
      
      if (users.length === 0) {
        console.log('⚠️ No users found in JSON file. Migration not needed.');
        return { success: true, message: 'No users to migrate' };
      }

      console.log(`📋 Found ${users.length} users to migrate`);

      // Step 5: Check for existing data in MongoDB
      const existingUsers = await this.dbService.getAllUsers();
      if (existingUsers.length > 0) {
        console.log(`⚠️ Found ${existingUsers.length} existing users in MongoDB`);
        console.log('🔄 Existing users will be updated/overridden if conflicts exist');
      }

      // Step 6: Migrate users
      console.log('🔄 Migrating users to MongoDB...');
      let migrated = 0;
      let errors = 0;

      for (const user of users) {
        try {
          const result = await this.dbService.addOrUpdateUser(
            user.discordId,
            user.bpAccountId,
            user.username
          );

          if (result.success) {
            migrated++;
            if (result.overrideMessage) {
              console.log(`✅ Migrated: ${user.username} (${user.bpAccountId}) - ${result.overrideMessage}`);
            } else {
              console.log(`✅ Migrated: ${user.username} (${user.bpAccountId})`);
            }
          } else {
            errors++;
            console.error(`❌ Failed to migrate ${user.username}: ${result.error}`);
          }
        } catch (error) {
          errors++;
          console.error(`❌ Error migrating ${user.username}: ${error.message}`);
        }
      }

      // Step 7: Verify migration
      console.log('🔍 Verifying migration...');
      const finalUserCount = await this.dbService.getUserCount();
      
      // Step 8: Create final backup
      console.log('💾 Creating final database backup...');
      const backupResult = await this.dbService.backupToFile();
      if (backupResult.success) {
        console.log(`✅ Database backup created: ${backupResult.filename}`);
      }

      // Step 9: Summary
      console.log('\n📊 Migration Summary:');
      console.log(`✅ Successfully migrated: ${migrated} users`);
      console.log(`❌ Failed migrations: ${errors} users`);
      console.log(`📋 Total users in database: ${finalUserCount}`);
      console.log(`💾 JSON backup: ${this.backupPath}`);
      if (backupResult.success) {
        console.log(`💾 Database backup: ${backupResult.filename}`);
      }

      // Step 10: Disconnect
      await this.dbService.disconnect();

      if (errors === 0) {
        console.log('\n🎉 Migration completed successfully!');
        return { 
          success: true, 
          migrated, 
          errors, 
          totalUsers: finalUserCount,
          backupPath: this.backupPath,
          dbBackup: backupResult.filename
        };
      } else {
        console.log('\n⚠️ Migration completed with some errors. Check the logs above.');
        return { 
          success: false, 
          migrated, 
          errors, 
          totalUsers: finalUserCount,
          backupPath: this.backupPath,
          dbBackup: backupResult.filename
        };
      }

    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      await this.dbService.disconnect();
      return { success: false, error: error.message };
    }
  }

  async rollback() {
    try {
      console.log('🔄 Starting rollback from MongoDB to JSON...');
      
      // Connect to database
      const connected = await this.dbService.connect();
      if (!connected) {
        throw new Error('Failed to connect to MongoDB');
      }

      // Get all users from MongoDB
      const users = await this.dbService.getAllUsers();
      
      // Create JSON structure
      const jsonData = {
        userMappings: users.map(user => ({
          discordId: user.discordId,
          bpAccountId: user.bpAccountId,
          username: user.username
        }))
      };

      // Write to JSON file
      fs.writeFileSync(this.jsonFilePath, JSON.stringify(jsonData, null, 2));
      console.log(`✅ Rolled back ${users.length} users to ${this.jsonFilePath}`);

      await this.dbService.disconnect();
      return { success: true, userCount: users.length };

    } catch (error) {
      console.error('❌ Rollback failed:', error.message);
      await this.dbService.disconnect();
      return { success: false, error: error.message };
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const migration = new MigrationService();

  if (command === 'rollback') {
    const result = await migration.rollback();
    process.exit(result.success ? 0 : 1);
  } else if (command === 'migrate' || !command) {
    const result = await migration.run();
    process.exit(result.success ? 0 : 1);
  } else {
    console.log('Usage:');
    console.log('  node scripts/migrate-to-mongodb.js migrate  # Run migration');
    console.log('  node scripts/migrate-to-mongodb.js rollback # Rollback to JSON');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = MigrationService;
