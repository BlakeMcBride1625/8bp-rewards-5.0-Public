#!/usr/bin/env node

/**
 * Remove Duplicate Failed Claims Script
 * 
 * Removes failed claims where users have successful claims on the same day.
 * These are duplicate attempts, not real failures.
 */

const DatabaseService = require('../services/database-service');
const dbService = DatabaseService.getInstance();

(async () => {
  try {
    await dbService.connect();
    
    console.log('🔍 Finding duplicate failed claims...\n');
    
    const pool = dbService.pool;
    const client = await pool.connect();
    
    try {
      // Find failed claims where user has successful claim on same day
      const duplicateQuery = `
        SELECT 
          cr1.id,
          cr1.eight_ball_pool_id,
          cr1.claimed_at,
          cr1.status
        FROM claim_records cr1
        INNER JOIN claim_records cr2 
          ON cr1.eight_ball_pool_id = cr2.eight_ball_pool_id
          AND DATE(cr1.claimed_at) = DATE(cr2.claimed_at)
          AND cr2.status = 'success'
        WHERE cr1.status = 'failed'
        ORDER BY cr1.claimed_at DESC
      `;
      
      const duplicateResult = await client.query(duplicateQuery);
      const duplicateCount = duplicateResult.rows.length;
      
      console.log(`📊 Found ${duplicateCount} duplicate failed claims to remove\n`);
      
      if (duplicateCount === 0) {
        console.log('✅ No duplicate failed claims found');
        await dbService.disconnect();
        process.exit(0);
      }
      
      // Show breakdown by user
      const byUser = {};
      duplicateResult.rows.forEach(row => {
        const userId = row.eight_ball_pool_id;
        if (!byUser[userId]) {
          byUser[userId] = 0;
        }
        byUser[userId]++;
      });
      
      console.log(`   Affected users: ${Object.keys(byUser).length}`);
      const topUsers = Object.entries(byUser)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
      
      topUsers.forEach(([userId, count]) => {
        console.log(`   - User ${userId}: ${count} duplicate failed claims`);
      });
      
      if (Object.keys(byUser).length > 10) {
        console.log(`   ... and ${Object.keys(byUser).length - 10} more users`);
      }
      
      console.log('\n🗑️  Removing duplicate failed claims...');
      
      await client.query('BEGIN');
      
      const deleteResult = await client.query(`
        DELETE FROM claim_records cr1
        WHERE cr1.status = 'failed'
          AND EXISTS (
            SELECT 1 FROM claim_records cr2 
            WHERE cr2.eight_ball_pool_id = cr1.eight_ball_pool_id 
            AND cr2.status = 'success' 
            AND DATE(cr2.claimed_at) = DATE(cr1.claimed_at)
          )
      `);
      
      await client.query('COMMIT');
      
      console.log(`✅ Removed ${deleteResult.rowCount} duplicate failed claims\n`);
      
      // Verify
      const verifyResult = await client.query(duplicateQuery);
      if (verifyResult.rows.length === 0) {
        console.log('✅ Verification passed - all duplicate failed claims removed');
      } else {
        console.log(`⚠️  Warning: ${verifyResult.rows.length} duplicate failed claims still remain`);
      }
      
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
    process.exit(1);
  }
})();



