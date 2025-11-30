import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

import { DatabaseService } from '../services/DatabaseService';
import { logger } from '../services/LoggerService';
import { getRandom8BPAvatar } from '../utils/avatarUtils';

/**
 * One-time script to assign random 8 Ball Pool avatars to users who don't have one
 * Run with: npx tsx backend/src/scripts/assign-random-avatars.ts
 */
async function assignRandomAvatars() {
  try {
    logger.info('🎲 Starting random avatar assignment script...');

    // Connect to database
    const dbService = DatabaseService.getInstance();
    const connected = await dbService.connect();
    
    if (!connected) {
      logger.error('❌ Failed to connect to database');
      process.exit(1);
    }

    logger.info('✅ Connected to database');

    // Get all registrations without an 8 Ball Pool avatar
    // Use direct SQL query to find users with NULL or empty avatar filename
    const pool = (dbService as any).postgresPool;
    if (!pool) {
      logger.error('❌ Database pool not available');
      process.exit(1);
    }

    const query = `
      SELECT 
        id,
        eight_ball_pool_id,
        username,
        discord_id,
        eight_ball_pool_avatar_filename
      FROM registrations
      WHERE eight_ball_pool_avatar_filename IS NULL 
         OR eight_ball_pool_avatar_filename = ''
      ORDER BY created_at ASC
    `;

    const result = await pool.query(query);
    const usersWithoutAvatars = result.rows;

    logger.info(`📊 Found ${usersWithoutAvatars.length} users without avatars`);

    if (usersWithoutAvatars.length === 0) {
      logger.info('✅ All users already have avatars assigned!');
      process.exit(0);
    }

    // Get a random avatar to use for all assignments (or get random for each)
    // Let's get random avatar for each user to have variety
    let assigned = 0;
    let failed = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    for (const user of usersWithoutAvatars) {
      try {
        // Get a random avatar
        const randomAvatar = getRandom8BPAvatar();
        
        if (!randomAvatar) {
          logger.warn(`⚠️  Could not get random avatar for user ${user.eight_ball_pool_id}`);
          failed++;
          errors.push({
            userId: user.eight_ball_pool_id,
            error: 'No random avatar available'
          });
          continue;
        }

        // Update the user's avatar
        await dbService.updateRegistration(user.eight_ball_pool_id, {
          eight_ball_pool_avatar_filename: randomAvatar
        });

        assigned++;
        
        if (assigned % 10 === 0) {
          logger.info(`📈 Progress: ${assigned}/${usersWithoutAvatars.length} avatars assigned...`);
        }

      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`❌ Failed to assign avatar to user ${user.eight_ball_pool_id}:`, {
          userId: user.eight_ball_pool_id,
          username: user.username,
          error: errorMessage
        });
        errors.push({
          userId: user.eight_ball_pool_id,
          error: errorMessage
        });
      }
    }

    // Summary
    logger.info('📊 Avatar Assignment Summary:', {
      total: usersWithoutAvatars.length,
      assigned,
      failed,
      errors: errors.length > 0 ? errors.slice(0, 10) : [] // Show first 10 errors
    });

    if (failed > 0 && errors.length > 10) {
      logger.warn(`⚠️  ${errors.length - 10} more errors occurred (showing first 10 above)`);
    }

    logger.info('✅ Random avatar assignment script completed!');
    
    // Close database connection
    await pool.end();
    process.exit(0);

  } catch (error) {
    logger.error('❌ Fatal error in avatar assignment script:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

// Run the script
assignRandomAvatars();




