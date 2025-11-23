/**
 * Cleanup script for false failure claims
 * 
 * This script identifies and removes failed claim records that are actually duplicates
 * (where the user already has a successful claim on the same day).
 * 
 * These false failures were likely caused by:
 * - Module path resolution errors (before fix)
 * - Duplicate claim attempts that failed but user already claimed successfully
 * 
 * Usage: node scripts/cleanup-false-failure-claims.js
 */

const DatabaseService = require('../services/database-service');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const dbService = DatabaseService.getInstance();

async function cleanupFalseFailureClaims() {
  try {
    console.log('🔍 Connecting to database...');
    await dbService.connect();
    console.log('✅ Connected to database\n');

    const pool = dbService.pool;
    const client = await pool.connect();

    try {
      // Find failed claims where user has successful claim on same day
      const duplicateQuery = `
        SELECT 
          cr1.id,
          cr1.eight_ball_pool_id,
          cr1.claimed_at as failed_claim_time,
          cr2.claimed_at as success_claim_time,
          cr1.error_message
        FROM claim_records cr1
        INNER JOIN claim_records cr2 
          ON cr1.eight_ball_pool_id = cr2.eight_ball_pool_id
          AND DATE(cr1.claimed_at) = DATE(cr2.claimed_at)
          AND cr1.status = 'failed'
          AND cr2.status = 'success'
          AND cr2.claimed_at >= cr1.claimed_at - INTERVAL '1 day'
        ORDER BY cr1.claimed_at DESC
      `;

      const result = await client.query(duplicateQuery);
      const falseFailures = result.rows;

    if (falseFailures.length === 0) {
      console.log('✅ No false failure claims found - database is clean!\n');
      await dbService.disconnect();
      process.exit(0);
    }

    console.log(`📊 Found ${falseFailures.length} false failure claims to remove\n`);

    // Group by user for summary
    const byUser = {};
    falseFailures.forEach(record => {
      const userId = record.eight_ball_pool_id;
      if (!byUser[userId]) {
        byUser[userId] = 0;
      }
      byUser[userId]++;
    });

    console.log(`👥 Affected users: ${Object.keys(byUser).length}\n`);
    
    const topUsers = Object.entries(byUser)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
    
    console.log('📋 Top users with false failures:');
    topUsers.forEach(([userId, count]) => {
      console.log(`   - User ${userId}: ${count} false failure(s)`);
    });
    
    if (Object.keys(byUser).length > 10) {
      console.log(`   ... and ${Object.keys(byUser).length - 10} more users`);
    }

      console.log('\n🗑️  Removing false failure claims...');

      await client.query('BEGIN');

      // Delete false failure claims
      const deleteQuery = `
        DELETE FROM claim_records cr1
        WHERE cr1.status = 'failed'
          AND EXISTS (
            SELECT 1 FROM claim_records cr2 
            WHERE cr2.eight_ball_pool_id = cr1.eight_ball_pool_id 
            AND cr2.status = 'success' 
            AND DATE(cr2.claimed_at) = DATE(cr1.claimed_at)
            AND cr2.claimed_at >= cr1.claimed_at - INTERVAL '1 day'
          )
      `;

      const deleteResult = await client.query(deleteQuery);

      await client.query('COMMIT');

      console.log(`✅ Removed ${deleteResult.rowCount} false failure claim records\n`);

      // Verify removal
      const verifyResult = await client.query(duplicateQuery);
      if (verifyResult.rows.length === 0) {
        console.log('✅ Verification passed - all false failure claims removed');
      } else {
        console.log(`⚠️  Warning: ${verifyResult.rows.length} false failure claims still remain`);
      }

      // Get updated statistics
      const statsQuery = `
        SELECT 
          COUNT(*) FILTER (WHERE status = 'success') as successful_claims,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_claims,
          COUNT(*) as total_claims
        FROM claim_records
      `;
      const statsResult = await client.query(statsQuery);
      const stats = statsResult.rows[0];

      console.log('\n📊 Updated Database Statistics:');
      console.log(`   Total claims: ${stats.total_claims}`);
      console.log(`   Successful claims: ${stats.successful_claims}`);
      console.log(`   Failed claims: ${stats.failed_claims}`);
      
      if (parseInt(stats.total_claims) > 0) {
        const successRate = ((parseInt(stats.successful_claims) / parseInt(stats.total_claims)) * 100).toFixed(2);
        console.log(`   Success rate: ${successRate}%`);
      }

      console.log('\n🎯 Cleanup complete!');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await dbService.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await dbService.disconnect();
    process.exit(1);
  }
}

// Run cleanup
cleanupFalseFailureClaims();

