#!/usr/bin/env node
/**
 * Delete all existing users and restore with correct usernames
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'admin',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB || '8bp_rewards',
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT || 5432,
});

const users = [
  { username: 'Yusef', eightBallPoolId: '1343603058' },
  { username: 'Vx & Blake', eightBallPoolId: '1632750779' },
  { username: 'Kolbi', eightBallPoolId: '3323504033' },
  { username: 'Anthony', eightBallPoolId: '4070842330' },
  { username: 'AK Tiktok', eightBallPoolId: '4931685486' },
  { username: '8bp.ryan 2nd', eightBallPoolId: '3213334533' },
  { username: "AT'nerb", eightBallPoolId: '4069824470' },
  { username: 'GBR (Olly)', eightBallPoolId: '3132133520' },
  { username: 'Lewisblive0 TT', eightBallPoolId: '1543016560' },
  { username: 'GBR (Karol)', eightBallPoolId: '2357661125' },
  { username: 'GBR (NATH)', eightBallPoolId: '2133913807' },
  { username: 'dan666 TT', eightBallPoolId: '574047' },
  { username: 'GBR (Harry Lee)', eightBallPoolId: '2130294000' },
  { username: 'queen x Qman', eightBallPoolId: '1028645630' },
  { username: 'GBR (Chris)', eightBallPoolId: '4014680882' },
  { username: 'Ems TT', eightBallPoolId: '3247684699' },
  { username: 'GBR (King Luke)', eightBallPoolId: '3411766218' },
  { username: 'tango', eightBallPoolId: '3417777776' },
  { username: 'tao', eightBallPoolId: '9984415' },
  { username: 'tao', eightBallPoolId: '2811111711' },
  { username: 'DΔяēDє∇!ʟ', eightBallPoolId: '4074000337' },
  { username: 'Polar', eightBallPoolId: '4361367039' },
  { username: 'TT Meg', eightBallPoolId: '2813420254' },
  { username: 'TT Elise', eightBallPoolId: '1852427833' },
  { username: 'Ash', eightBallPoolId: '1937295559' },
  { username: 'MÅSIAH 8BP', eightBallPoolId: '4175261019' },
  { username: 'XT OTILIA 🦋', eightBallPoolId: '2222430702' },
  { username: 'Mr8ballking', eightBallPoolId: '2184547630' },
  { username: 'Ethan', eightBallPoolId: '3411092263' },
  { username: 'RM', eightBallPoolId: '4143936427' },
  { username: 'Dan666__tt', eightBallPoolId: '2409322815' },
  { username: 'ROSS 8BP TIKTOK', eightBallPoolId: '4714098502' },
  { username: 'Lei eds', eightBallPoolId: '1195368689' },
  { username: 'Osman', eightBallPoolId: '31597069' },
  { username: 'FVJA 8BP TIKTOK', eightBallPoolId: '1085827502' },
  { username: 'XT OTYBLOOM', eightBallPoolId: '2686894134' },
  { username: 'Antonio', eightBallPoolId: '4097217556' },
  { username: 'BATMAN', eightBallPoolId: '4673161248' },
  { username: 'JJ8BP:TT LIVE', eightBallPoolId: '3329876494' },
  { username: 'TT:EvilPro8BP', eightBallPoolId: '4154083336' },
  { username: 'AK SUCKZ TIKTOK', eightBallPoolId: '1637173455' },
  { username: 'JVHK.7', eightBallPoolId: '1624513715' },
  { username: 'KINGWILL19', eightBallPoolId: '2684440456' },
  { username: 'polar', eightBallPoolId: '4930469421' },
  { username: 'Rohan', eightBallPoolId: '2985394421' },
  { username: 'Exotic', eightBallPoolId: '4665757426' },
  { username: 'Zaza', eightBallPoolId: '4146271461' },
  { username: '𝔚𝔢𝔰𝔱𝔓𝔬𝔦𝔫𝔱', eightBallPoolId: '9009991' },
  { username: 'NHA SLOY', eightBallPoolId: '3332956756' }
];

async function restoreUsers() {
  try {
    console.log('🗑️  Deleting all existing users...');
    
    // Delete all users
    const deleteResult = await pool.query('DELETE FROM registrations');
    console.log(`   ✅ Deleted ${deleteResult.rowCount} users`);
    
    console.log(`\n📋 Inserting ${users.length} users with correct usernames...\n`);
    
    let inserted = 0;
    let skipped = 0;
    const errors = [];
    
    for (const user of users) {
      try {
        await pool.query(
          `INSERT INTO registrations (eight_ball_pool_id, username, created_at, updated_at, is_active) 
           VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true)
           ON CONFLICT (eight_ball_pool_id) DO UPDATE SET
             username = EXCLUDED.username,
             updated_at = CURRENT_TIMESTAMP`,
          [user.eightBallPoolId, user.username]
        );
        inserted++;
        if (inserted % 10 === 0) {
          process.stdout.write(`\r✅ Inserted ${inserted}/${users.length} users...`);
        }
      } catch (error) {
        console.error(`\n❌ Failed to insert user ${user.username} (${user.eightBallPoolId}):`, error.message);
        errors.push({ user, error: error.message });
        skipped++;
      }
    }
    
    console.log(`\n\n🎉 Restoration complete!`);
    console.log(`   ✅ Inserted: ${inserted} users`);
    if (skipped > 0) {
      console.log(`   ⏭️  Skipped: ${skipped} users`);
    }
    
    // Verify
    const result = await pool.query('SELECT COUNT(*) FROM registrations');
    console.log(`\n📊 Total users in database: ${result.rows[0].count}`);
    
    // Show sample
    const sample = await pool.query('SELECT eight_ball_pool_id, username FROM registrations ORDER BY created_at LIMIT 5');
    console.log(`\n📝 Sample users:`);
    sample.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.username} (${row.eight_ball_pool_id})`);
    });
    
    if (errors.length > 0) {
      console.log(`\n⚠️  Errors encountered:`);
      errors.forEach(({ user, error }) => {
        console.log(`   - ${user.username} (${user.eightBallPoolId}): ${error}`);
      });
    }
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

restoreUsers();



