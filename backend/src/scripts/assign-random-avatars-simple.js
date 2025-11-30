const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

/**
 * One-time script to assign random 8 Ball Pool avatars to users who don't have one
 * This script only assigns avatars to users who don't already have one set
 */

async function assignRandomAvatars() {
  console.log('🎲 Starting random avatar assignment script...');

  // Connect to PostgreSQL
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || '8bp_rewards',
    user: process.env.POSTGRES_USER || '8bp_user',
    password: process.env.POSTGRES_PASSWORD,
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database');

    // Get avatars directory path
    const avatarsDir = path.join(process.cwd(), 'frontend', '8 Ball Pool Avatars');
    
    if (!fs.existsSync(avatarsDir)) {
      console.error(`❌ Avatars directory not found: ${avatarsDir}`);
      process.exit(1);
    }

    // Read all avatar files
    const files = fs.readdirSync(avatarsDir);
    const avatarFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    });

    if (avatarFiles.length === 0) {
      console.error('❌ No avatar files found in directory');
      process.exit(1);
    }

    console.log(`📊 Found ${avatarFiles.length} available avatars`);

    // Get all registrations without an 8 Ball Pool avatar
    const query = `
      SELECT 
        id,
        eight_ball_pool_id,
        username,
        discord_id,
        eight_ball_pool_avatar_filename
      FROM registrations
      WHERE (eight_ball_pool_avatar_filename IS NULL 
         OR eight_ball_pool_avatar_filename = '')
      ORDER BY created_at ASC
    `;

    const result = await pool.query(query);
    const usersWithoutAvatars = result.rows;

    console.log(`📊 Found ${usersWithoutAvatars.length} users without avatars`);

    if (usersWithoutAvatars.length === 0) {
      console.log('✅ All users already have avatars assigned!');
      await pool.end();
      process.exit(0);
    }

    let assigned = 0;
    let failed = 0;
    const errors = [];

    for (const user of usersWithoutAvatars) {
      try {
        // Get a random avatar
        const randomIndex = Math.floor(Math.random() * avatarFiles.length);
        const randomAvatar = avatarFiles[randomIndex];

        // Update the user's avatar
        const updateQuery = `
          UPDATE registrations
          SET eight_ball_pool_avatar_filename = $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE eight_ball_pool_id = $2
        `;
        
        await pool.query(updateQuery, [randomAvatar, user.eight_ball_pool_id]);

        assigned++;
        
        if (assigned % 10 === 0) {
          console.log(`📈 Progress: ${assigned}/${usersWithoutAvatars.length} avatars assigned...`);
        }

      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Failed to assign avatar to user ${user.eight_ball_pool_id}:`, errorMessage);
        errors.push({
          userId: user.eight_ball_pool_id,
          error: errorMessage
        });
      }
    }

    // Summary
    console.log('\n📊 Avatar Assignment Summary:');
    console.log(`  Total users checked: ${usersWithoutAvatars.length}`);
    console.log(`  ✅ Assigned: ${assigned}`);
    console.log(`  ❌ Failed: ${failed}`);
    
    if (errors.length > 0 && errors.length <= 10) {
      console.log('\n❌ Errors:');
      errors.forEach(err => {
        console.log(`  - ${err.userId}: ${err.error}`);
      });
    } else if (errors.length > 10) {
      console.log(`\n⚠️  ${errors.length} errors occurred (showing first 10 above)`);
    }

    console.log('\n✅ Random avatar assignment script completed!');
    
    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Fatal error in avatar assignment script:', error);
    await pool.end();
    process.exit(1);
  }
}

// Run the script
assignRandomAvatars();




