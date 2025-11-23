#!/usr/bin/env node

/**
 * Remove Failed Claims Script
 * 
 * This script removes all failed claim records from the PostgreSQL database.
 * Failed claims are identified by status: 'failed' in the claim_records table.
 */

const { Pool } = require('pg');
require('dotenv').config();

// Connect to PostgreSQL
async function connectToDatabase() {
  try {
    const pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || 5432,
      database: process.env.POSTGRES_DB || '8bp_rewards',
      user: process.env.POSTGRES_USER || 'admin',
      password: process.env.POSTGRES_PASSWORD || '',
      ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
    });

    // Test connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    console.log('✅ Connected to PostgreSQL');
    return pool;
  } catch (error) {
    console.error('❌ Failed to connect to PostgreSQL:', error.message);
    throw error;
  }
}

// Remove failed claims
async function removeFailedClaims(pool) {
  try {
    console.log('🔍 Checking for failed claims...');
    
    // First, count failed claims
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM claim_records WHERE status = $1',
      ['failed']
    );
    
    const failedCount = parseInt(countResult.rows[0].count);
    
    if (failedCount === 0) {
      console.log('ℹ️ No failed claim records found, continuing with log cleanup');
    }
    
    console.log(`📊 Found ${failedCount} failed claims to remove`);
    
    await pool.query('BEGIN');

    const deleteClaimsResult = await pool.query(
      `DELETE FROM claim_records WHERE status = $1`,
      ['failed']
    );

    const deleteLogsResult = await pool.query(
      `
        DELETE FROM log_entries
        WHERE metadata->>'action' IN ('claim_failed', 'failed_claim')
           OR (
             metadata->>'action' = 'claim'
             AND metadata->>'success' = 'false'
           )
      `
    );

    let deleteValidationLogsResult = { rowCount: 0 };
    try {
      deleteValidationLogsResult = await pool.query(
        `
          DELETE FROM validation_logs
          WHERE source_module IN ('claimer', 'scheduler', 'first-time-claim')
            AND (
              validation_result->>'isValid' = 'false'
              OR validation_result->>'status' = 'failed'
            )
        `
      );
    } catch (validationError) {
      console.warn('⚠️ Validation logs cleanup skipped:', validationError.message || validationError);
    }

    await pool.query('COMMIT');

    console.log(`🗑️ Removed ${deleteClaimsResult.rowCount} failed claim records`);
    console.log(`🧹 Removed ${deleteLogsResult.rowCount} related log entries`);
    console.log(`🧾 Removed ${deleteValidationLogsResult.rowCount} validation log entries`);
    
    // Verify removal
    const verifyClaimsResult = await pool.query(
      'SELECT COUNT(*) as count FROM claim_records WHERE status = $1',
      ['failed']
    );
    
    const remainingFailed = parseInt(verifyClaimsResult.rows[0].count);
    
    if (remainingFailed === 0) {
      console.log('✅ All failed claim records have been successfully removed');
    } else {
      console.log(`⚠️ ${remainingFailed} failed claim records still remain`);
    }
    
  } catch (error) {
    try {
      await pool.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('❌ Failed to rollback transaction:', rollbackError.message || rollbackError);
    }
    console.error('❌ Error removing failed claims:', error.message);
    throw error;
  }
}

// Main function
async function main() {
  let pool = null;
  
  try {
    console.log('🚀 Starting failed claims removal process...');
    
    // Connect to database
    pool = await connectToDatabase();
    
    // Remove failed claims
    await removeFailedClaims(pool);
    
    console.log('🎉 Failed claims removal process completed successfully!');
    
  } catch (error) {
    console.error('💥 Failed claims removal process failed:', error.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
      console.log('🔌 Disconnected from PostgreSQL');
    }
  }
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { connectToDatabase, removeFailedClaims };