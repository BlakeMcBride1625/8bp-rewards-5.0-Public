#!/usr/bin/env node
/**
 * Check user count in PostgreSQL database
 */

const { Pool } = require('pg');
require('dotenv').config();

async function checkUserCount() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || '8bp_rewards',
    user: process.env.POSTGRES_USER || 'admin',
    password: process.env.POSTGRES_PASSWORD,
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔍 Checking user count in PostgreSQL...\n');

    // Count all users (active and inactive)
    const countResult = await pool.query('SELECT COUNT(*) as total FROM registrations');
    const totalUsers = parseInt(countResult.rows[0].total);

    // Count active users
    const activeResult = await pool.query(`
      SELECT COUNT(*) as total 
      FROM registrations 
      WHERE status = 'active' OR status IS NULL
    `);
    const activeUsers = parseInt(activeResult.rows[0].total);

    // Count inactive/deregistered users
    const inactiveResult = await pool.query(`
      SELECT COUNT(*) as total 
      FROM registrations 
      WHERE status != 'active' AND status IS NOT NULL
    `);
    const inactiveUsers = parseInt(inactiveResult.rows[0].total);

    // Count invalid users
    const invalidResult = await pool.query('SELECT COUNT(*) as total FROM invalid_users');
    const invalidUsers = parseInt(invalidResult.rows[0].total);

    console.log('📊 User Count Summary:');
    console.log(`   Total Users: ${totalUsers}`);
    console.log(`   Active Users: ${activeUsers}`);
    console.log(`   Inactive Users: ${inactiveUsers}`);
    console.log(`   Invalid Users: ${invalidUsers}`);
    console.log('');

    if (totalUsers === 63) {
      console.log('✅ Expected 63 users found!');
    } else {
      console.log(`⚠️  Expected 63 users, but found ${totalUsers}`);
      console.log(`   Difference: ${Math.abs(63 - totalUsers)}`);
    }

    // List all user IDs for verification
    const usersResult = await pool.query(`
      SELECT eight_ball_pool_id, username, status, created_at
      FROM registrations
      ORDER BY created_at ASC
    `);

    console.log(`\n📋 All ${totalUsers} Users:`);
    usersResult.rows.forEach((user, index) => {
      console.log(`   ${index + 1}. ID: ${user.eight_ball_pool_id}, Username: ${user.username || 'N/A'}, Status: ${user.status || 'active'}`);
    });

    await pool.end();
    process.exit(totalUsers === 63 ? 0 : 1);
  } catch (error) {
    console.error('❌ Error checking user count:', error);
    await pool.end();
    process.exit(1);
  }
}

checkUserCount();



