import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../services/LoggerService';

/**
 * Get a random 8 Ball Pool avatar filename from the available avatars
 * @returns A random avatar filename or null if no avatars found
 */
export function getRandom8BPAvatar(): string | null {
  try {
    const avatarsDir = path.join(process.cwd(), 'frontend', '8 Ball Pool Avatars');
    
    // Check if directory exists
    if (!fs.existsSync(avatarsDir)) {
      logger.warn('8 Ball Pool Avatars directory not found', {
        action: 'get_random_avatar',
        path: avatarsDir
      });
      return null;
    }

    // Read all files in the directory
    const files = fs.readdirSync(avatarsDir);
    
    // Filter for image files (jpg, jpeg, png, etc.)
    const avatarFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    });

    if (avatarFiles.length === 0) {
      logger.warn('No avatar files found in directory', {
        action: 'get_random_avatar',
        path: avatarsDir
      });
      return null;
    }

    // Select a random avatar
    const randomIndex = Math.floor(Math.random() * avatarFiles.length);
    const selectedAvatar = avatarFiles[randomIndex];

    logger.info('Random 8BP avatar selected', {
      action: 'get_random_avatar',
      selectedAvatar,
      totalAvatars: avatarFiles.length
    });

    return selectedAvatar;
  } catch (error) {
    logger.error('Error getting random 8BP avatar', {
      action: 'get_random_avatar_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
}

/**
 * Generate Discord avatar URL from Discord ID and avatar hash
 * Handles both custom avatars and default Discord avatars
 * 
 * @param discordId - Discord user ID (must be a string)
 * @param avatarHash - Discord avatar hash (can be null for default avatars)
 * @returns Discord avatar URL or null if discordId is invalid
 */
export function getDiscordAvatarUrl(discordId: string | null | undefined, avatarHash: string | null | undefined): string | null {
  // Validate Discord ID - can be string or number (database might store as either)
  if (!discordId) {
    logger.warn('Invalid Discord ID for avatar URL generation - discordId is null/undefined', {
      action: 'get_discord_avatar_url',
      discordId,
      discordIdType: typeof discordId
    });
    return null;
  }
  
  // Convert Discord ID to string (handles both string and number types)
  const discordIdStr = String(discordId).trim();
  if (!discordIdStr || discordIdStr === 'undefined' || discordIdStr === 'null' || discordIdStr === 'NaN') {
    logger.warn('Invalid Discord ID string for avatar URL generation', {
      action: 'get_discord_avatar_url',
      discordId,
      discordIdStr
    });
    return null;
  }
  
  // If avatar hash exists (not null/undefined/empty), use custom avatar
  if (avatarHash && typeof avatarHash === 'string' && avatarHash.trim().length > 0 && avatarHash !== 'null' && avatarHash !== 'undefined') {
    const avatarHashStr = avatarHash.trim();
    const url = `https://cdn.discordapp.com/avatars/${discordIdStr}/${avatarHashStr}.png`;
    logger.info('✅ Generated Discord custom avatar URL', {
      action: 'get_discord_avatar_url',
      discordId: discordIdStr,
      hasHash: true,
      url
    });
    return url;
  }
  
  // Otherwise, use default Discord avatar
  // Default avatars are determined by user's discriminator (discordId % 5 for new system)
  // Parse the Discord ID as a number for the modulo operation
  const discordIdNum = parseInt(discordIdStr, 10);
  if (isNaN(discordIdNum)) {
    logger.error('❌ Failed to parse Discord ID as number for default avatar', {
      action: 'get_discord_avatar_url',
      discordId,
      discordIdStr
    });
    // Fallback: use index 0 for default avatar if parsing fails
    const url = `https://cdn.discordapp.com/embed/avatars/0.png`;
    logger.warn('⚠️ Using fallback default avatar (index 0)', {
      action: 'get_discord_avatar_url',
      url
    });
    return url;
  }
  
  const defaultAvatarIndex = discordIdNum % 5;
  const url = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
  logger.info('✅ Generated Discord default avatar URL', {
    action: 'get_discord_avatar_url',
    discordId: discordIdStr,
    hasHash: false,
    defaultAvatarIndex,
    url
  });
  return url;
}



