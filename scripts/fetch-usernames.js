#!/usr/bin/env node
/**
 * Fetch usernames from 8ball pool API and update database
 * This script will fetch usernames for all users in the database
 */

const { Pool } = require('pg');
const axios = require('axios');
require('dotenv').config();

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'admin',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB || '8bp_rewards',
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT || 5432,
});

/**
 * Fetch username from 8ball pool website
 * The profile page is: https://www.8ballpool.com/en/profile/{userId}
 */
async function fetchUsernameFrom8BallPool(userId) {
  try {
    // Try to fetch the profile page
    // Note: This might require scraping or using an API if available
    // For now, we'll try a common approach
    
    // Option 1: Try direct profile URL
    const profileUrl = `https://www.8ballpool.com/en/profile/${userId}`;
    
    // Option 2: Try API endpoint if it exists
    // This is a placeholder - you may need to inspect the actual API
    
    // Since we can't easily scrape without browser automation,
    // we'll check if there's existing username data somewhere
    // or if users need to re-register with their usernames
    
    return null; // Placeholder - implement based on available API
  } catch (error) {
    console.error(`Error fetching username for ${userId}:`, error.message);
    return null;
  }
}

/**
 * Update username in database
 */
async function updateUsername(eightBallPoolId, username) {
  try {
    await pool.query(
      `UPDATE registrations 
       SET username = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE eight_ball_pool_id = $2 AND username = $2`,
      [username, eightBallPoolId]
    );
    return true;
  } catch (error) {
    console.error(`Error updating username for ${eightBallPoolId}:`, error.message);
    return false;
  }
}

async function fetchUsernames() {
  try {
    console.log('📋 Fetching users with missing usernames...');
    
    // Get all users where username equals eight_ball_pool_id (meaning it wasn't set)
    const result = await pool.query(
      `SELECT eight_ball_pool_id, username 
       FROM registrations 
       WHERE username = eight_ball_pool_id::text
       ORDER BY created_at DESC`
    );
    
    const users = result.rows;
    console.log(`📊 Found ${users.length} users with missing usernames\n`);
    
    if (users.length === 0) {
      console.log('✅ All users already have proper usernames!');
      await pool.end();
      return;
    }
    
    console.log('⚠️  Note: This script needs to be updated with the actual 8ball pool API endpoint.');
    console.log('    Currently, usernames are not being fetched automatically.\n');
    console.log('📝 Options to fix usernames:');
    console.log('   1. Users re-register with their usernames');
    console.log('   2. Manually update usernames in the database');
    console.log('   3. Implement 8ball pool API integration to fetch usernames\n');
    
    console.log('👥 Users that need username updates:');
    users.slice(0, 10).forEach((user, index) => {
      console.log(`   ${index + 1}. ID: ${user.eight_ball_pool_id}, Current username: ${user.username}`);
    });
    if (users.length > 10) {
      console.log(`   ... and ${users.length - 10} more`);
    }
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

fetchUsernames();



