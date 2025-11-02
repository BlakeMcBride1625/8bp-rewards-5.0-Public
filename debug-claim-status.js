#!/usr/bin/env node

/**
 * Debug script to check claim status in database
 * Run with: node debug-claim-status.js
 */

const { Pool } = require('pg');
require('dotenv').config();

async function debugClaimStatus() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || '8bp_rewards',
    user: process.env.POSTGRES_USER || '8bp_user',
    password: process.env.POSTGRES_PASSWORD,
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔍 Debugging claim status in database...\n');

    // Get recent claims
    const recentClaims = await pool.query(`
      SELECT 
        id,
        eight_ball_pool_id,
        status,
        items_claimed,
        error_message,
        claimed_at
      FROM claim_records 
      ORDER BY claimed_at DESC 
      LIMIT 10
    `);

    console.log(`📊 Found ${recentClaims.rows.length} recent claims:\n`);

    recentClaims.rows.forEach((claim, index) => {
      console.log(`${index + 1}. User: ${claim.eight_ball_pool_id}`);
      console.log(`   Status: ${claim.status}`);
      console.log(`   Items: ${claim.items_claimed ? claim.items_claimed.length : 0} items`);
      console.log(`   Error: ${claim.error_message || 'None'}`);
      console.log(`   Time: ${claim.claimed_at}`);
      console.log('');
    });

    // Get status counts
    const statusCounts = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM claim_records 
      WHERE claimed_at >= NOW() - INTERVAL '7 days'
      GROUP BY status
      ORDER BY count DESC
    `);

    console.log('📈 Status counts (last 7 days):');
    statusCounts.rows.forEach(row => {
      console.log(`   ${row.status}: ${row.count} claims`);
    });

    // Check for any claims with empty items but success status
    const emptySuccessClaims = await pool.query(`
      SELECT 
        eight_ball_pool_id,
        status,
        items_claimed,
        claimed_at
      FROM claim_records 
      WHERE status = 'success' 
        AND (items_claimed IS NULL OR array_length(items_claimed, 1) IS NULL OR array_length(items_claimed, 1) = 0)
        AND claimed_at >= NOW() - INTERVAL '1 day'
      ORDER BY claimed_at DESC
      LIMIT 5
    `);

    if (emptySuccessClaims.rows.length > 0) {
      console.log('\n⚠️  Found successful claims with no items (last 24 hours):');
      emptySuccessClaims.rows.forEach(claim => {
        console.log(`   User: ${claim.eight_ball_pool_id}, Time: ${claim.claimed_at}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

debugClaimStatus();
