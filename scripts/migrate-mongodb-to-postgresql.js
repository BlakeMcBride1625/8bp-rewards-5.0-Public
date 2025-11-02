#!/usr/bin/env node

/**
 * MongoDB to PostgreSQL Migration Script
 * 
 * This script migrates all data from MongoDB to PostgreSQL while preserving
 * all existing user data and claim records.
 * 
 * Usage: node scripts/migrate-mongodb-to-postgresql.js
 */

const mongoose = require('mongoose');
const { Pool } = require('pg');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// MongoDB Models (using existing compiled models)
const Registration = require('../models/Registration');
const { ClaimRecord } = require('../dist/backend/models/ClaimRecord');

// PostgreSQL connection
const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || '8bp_rewards',
  user: process.env.POSTGRES_USER || '8bp_user',
  password: process.env.POSTGRES_PASSWORD,
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function connectDatabases() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/8bp-rewards');
    console.log('✅ Connected to MongoDB');

    // Test PostgreSQL connection
    console.log('🔌 Testing PostgreSQL connection...');
    const client = await pgPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Connected to PostgreSQL');

  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    process.exit(1);
  }
}

async function migrateRegistrations() {
  console.log('\n📋 Migrating registrations...');
  
  try {
    const registrations = await Registration.find({});
    console.log(`📊 Found ${registrations.length} registrations to migrate`);

    for (const reg of registrations) {
      const query = `
        INSERT INTO registrations (eight_ball_pool_id, username, email, discord_id, created_at, updated_at, is_active, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (eight_ball_pool_id) DO UPDATE SET
          username = EXCLUDED.username,
          email = EXCLUDED.email,
          discord_id = EXCLUDED.discord_id,
          updated_at = EXCLUDED.updated_at,
          is_active = EXCLUDED.is_active,
          metadata = EXCLUDED.metadata
      `;
      
      const values = [
        reg.eightBallPoolId,
        reg.username,
        reg.email || null,
        reg.discordId || null,
        reg.createdAt,
        reg.updatedAt || reg.createdAt,
        true,
        JSON.stringify(reg.toObject())
      ];

      await pgPool.query(query, values);
    }

    console.log(`✅ Successfully migrated ${registrations.length} registrations`);

  } catch (error) {
    console.error('❌ Error migrating registrations:', error.message);
    throw error;
  }
}

async function migrateClaimRecords() {
  console.log('\n📋 Migrating claim records...');
  
  try {
    const claimRecords = await ClaimRecord.find({});
    console.log(`📊 Found ${claimRecords.length} claim records to migrate`);

    for (const claim of claimRecords) {
      const query = `
        INSERT INTO claim_records (eight_ball_pool_id, website_user_id, status, items_claimed, error_message, claimed_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO NOTHING
      `;
      
      const values = [
        claim.eightBallPoolId,
        claim.websiteUserId || null,
        claim.status,
        claim.itemsClaimed || [],
        claim.error || null,
        claim.claimedAt,
        JSON.stringify(claim.toObject())
      ];

      await pgPool.query(query, values);
    }

    console.log(`✅ Successfully migrated ${claimRecords.length} claim records`);

  } catch (error) {
    console.error('❌ Error migrating claim records:', error.message);
    throw error;
  }
}

async function verifyMigration() {
  console.log('\n🔍 Verifying migration...');
  
  try {
    // Count registrations
    const regCount = await pgPool.query('SELECT COUNT(*) FROM registrations');
    console.log(`📊 PostgreSQL registrations: ${regCount.rows[0].count}`);

    // Count claim records
    const claimCount = await pgPool.query('SELECT COUNT(*) FROM claim_records');
    console.log(`📊 PostgreSQL claim records: ${claimCount.rows[0].count}`);

    // Count by status
    const statusCount = await pgPool.query('SELECT status, COUNT(*) FROM claim_records GROUP BY status');
    console.log('📊 Claim records by status:');
    statusCount.rows.forEach(row => {
      console.log(`   ${row.status}: ${row.count}`);
    });

    // Show sample data
    const sampleReg = await pgPool.query('SELECT eight_ball_pool_id, username, created_at FROM registrations LIMIT 3');
    console.log('\n📋 Sample registrations:');
    sampleReg.rows.forEach(row => {
      console.log(`   ${row.eight_ball_pool_id}: ${row.username} (${row.created_at})`);
    });

  } catch (error) {
    console.error('❌ Error verifying migration:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting MongoDB to PostgreSQL Migration');
  console.log('==========================================\n');

  try {
    await connectDatabases();
    await migrateRegistrations();
    await migrateClaimRecords();
    await verifyMigration();

    console.log('\n✅ Migration completed successfully!');
    console.log('📝 Next steps:');
    console.log('   1. Update backend configuration to use PostgreSQL');
    console.log('   2. Test the application with PostgreSQL');
    console.log('   3. Once confirmed working, MongoDB can be removed');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    await pgPool.end();
    console.log('\n🔌 Database connections closed');
  }
}

// Run migration
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { migrateRegistrations, migrateClaimRecords, verifyMigration };
