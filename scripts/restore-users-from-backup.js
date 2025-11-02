#!/usr/bin/env node
/**
 * Restore users from claim records backup to PostgreSQL
 */

const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'admin',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB || '8bp_rewards',
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT || 5432,
});

async function restoreUsers() {
  try {
    console.log('📂 Reading claim records backup...');
    const backupFile = '/home/blake/8bp-rewards/backups/pre-dedup-backup-2025-10-08T09:46:28.894Z.json';
    const claimRecords = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    
    console.log(`📊 Found ${claimRecords.length} claim records`);
    
    // Extract unique users
    const usersMap = new Map();
    for (const record of claimRecords) {
      if (record.eightBallPoolId && !usersMap.has(record.eightBallPoolId)) {
        usersMap.set(record.eightBallPoolId, {
          eightBallPoolId: record.eightBallPoolId,
          username: record.eightBallPoolId, // Default to ID if no username
          createdAt: record.claimedAt || record.schedulerRun || new Date().toISOString()
        });
      }
    }
    
    console.log(`👥 Found ${usersMap.size} unique users`);
    
    // Insert into PostgreSQL
    let inserted = 0;
    let skipped = 0;
    
    for (const [id, user] of usersMap) {
      try {
        await pool.query(
          `INSERT INTO registrations (eight_ball_pool_id, username, created_at, is_active) 
           VALUES ($1, $2, $3, true)
           ON CONFLICT (eight_ball_pool_id) DO NOTHING`,
          [user.eightBallPoolId, user.username, user.createdAt]
        );
        inserted++;
        if (inserted % 10 === 0) {
          process.stdout.write(`\r✅ Inserted ${inserted}/${usersMap.size} users...`);
        }
      } catch (error) {
        console.error(`\n❌ Failed to insert user ${id}:`, error.message);
        skipped++;
      }
    }
    
    console.log(`\n\n🎉 Migration complete!`);
    console.log(`   ✅ Inserted: ${inserted} users`);
    console.log(`   ⏭️  Skipped: ${skipped} users`);
    
    // Verify
    const result = await pool.query('SELECT COUNT(*) FROM registrations');
    console.log(`\n📊 Total users in database: ${result.rows[0].count}`);
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

restoreUsers();



