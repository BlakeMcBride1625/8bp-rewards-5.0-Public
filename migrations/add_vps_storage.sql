-- Migration: Add VPS codes and access storage tables
-- Replaces in-memory storage with persistent database storage

-- Table for VPS access codes (multi-channel authentication)
CREATE TABLE IF NOT EXISTS vps_codes (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    discord_code VARCHAR(16) NOT NULL,
    telegram_code VARCHAR(16) NOT NULL,
    email_code VARCHAR(6) NOT NULL,
    user_email VARCHAR(255),
    username VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts INTEGER DEFAULT 0,
    is_used BOOLEAN DEFAULT FALSE,
    discord_message_id VARCHAR(255),
    telegram_message_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Table for VPS access grants
CREATE TABLE IF NOT EXISTS vps_access (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Table for reset leaderboard codes (multi-channel authentication)
CREATE TABLE IF NOT EXISTS reset_leaderboard_codes (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    discord_code VARCHAR(16) NOT NULL,
    telegram_code VARCHAR(16) NOT NULL,
    email_code VARCHAR(6) NOT NULL,
    user_email VARCHAR(255),
    username VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts INTEGER DEFAULT 0,
    is_used BOOLEAN DEFAULT FALSE,
    discord_message_id VARCHAR(255),
    telegram_message_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Table for reset leaderboard access grants
CREATE TABLE IF NOT EXISTS reset_leaderboard_access (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vps_codes_user_id ON vps_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_vps_codes_expires_at ON vps_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_vps_access_user_id ON vps_access(user_id);
CREATE INDEX IF NOT EXISTS idx_vps_access_expires_at ON vps_access(expires_at);
CREATE INDEX IF NOT EXISTS idx_reset_leaderboard_codes_user_id ON reset_leaderboard_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_leaderboard_codes_expires_at ON reset_leaderboard_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_reset_leaderboard_access_user_id ON reset_leaderboard_access(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_leaderboard_access_expires_at ON reset_leaderboard_access(expires_at);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to update updated_at
CREATE TRIGGER update_vps_codes_updated_at BEFORE UPDATE ON vps_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reset_leaderboard_codes_updated_at BEFORE UPDATE ON reset_leaderboard_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Clean up expired records (can be run periodically via cron)
-- DELETE FROM vps_codes WHERE expires_at < NOW() AND is_used = TRUE;
-- DELETE FROM vps_access WHERE expires_at < NOW();
-- DELETE FROM reset_leaderboard_codes WHERE expires_at < NOW() AND is_used = TRUE;
-- DELETE FROM reset_leaderboard_access WHERE expires_at < NOW();





