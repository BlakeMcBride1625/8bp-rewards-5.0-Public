-- Add leaderboard profile fields to registrations table
-- This migration adds fields for profile images, 8BP avatars, and Discord toggles

-- Add profile image fields
ALTER TABLE registrations 
ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
ADD COLUMN IF NOT EXISTS profile_image_updated_at TIMESTAMP;

-- Add leaderboard-specific image fields
ALTER TABLE registrations 
ADD COLUMN IF NOT EXISTS leaderboard_image_url TEXT,
ADD COLUMN IF NOT EXISTS leaderboard_image_updated_at TIMESTAMP;

-- Add 8 Ball Pool avatar selection
ALTER TABLE registrations 
ADD COLUMN IF NOT EXISTS eight_ball_pool_avatar_filename VARCHAR(255);

-- Add Discord toggles (use_discord_avatar defaults to TRUE if discord_id exists, use_discord_username defaults to FALSE)
ALTER TABLE registrations 
ADD COLUMN IF NOT EXISTS use_discord_avatar BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS use_discord_username BOOLEAN DEFAULT FALSE;

-- Add Discord avatar hash for building Discord avatar URLs
ALTER TABLE registrations 
ADD COLUMN IF NOT EXISTS discord_avatar_hash VARCHAR(255);

-- Set default values for existing records
-- If discord_id exists, set use_discord_avatar to TRUE by default
UPDATE registrations 
SET use_discord_avatar = TRUE 
WHERE discord_id IS NOT NULL 
  AND use_discord_avatar IS NULL;

-- use_discord_username should always default to FALSE (never use Discord username by default)
UPDATE registrations 
SET use_discord_username = FALSE 
WHERE use_discord_username IS NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_registrations_profile_image_url ON registrations(profile_image_url) WHERE profile_image_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_registrations_leaderboard_image_url ON registrations(leaderboard_image_url) WHERE leaderboard_image_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_registrations_eight_ball_pool_avatar_filename ON registrations(eight_ball_pool_avatar_filename) WHERE eight_ball_pool_avatar_filename IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN registrations.profile_image_url IS 'URL to the user uploaded profile image';
COMMENT ON COLUMN registrations.leaderboard_image_url IS 'URL to the user uploaded leaderboard-specific image';
COMMENT ON COLUMN registrations.eight_ball_pool_avatar_filename IS 'Filename of the selected 8 Ball Pool game avatar';
COMMENT ON COLUMN registrations.use_discord_avatar IS 'Whether to use Discord avatar on leaderboard (defaults to TRUE if discord_id exists)';
COMMENT ON COLUMN registrations.use_discord_username IS 'Whether to use Discord username on leaderboard (defaults to FALSE)';
COMMENT ON COLUMN registrations.discord_avatar_hash IS 'Discord avatar hash for building Discord avatar URLs';



