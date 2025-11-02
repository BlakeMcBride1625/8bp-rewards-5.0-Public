-- PostgreSQL Database Schema for 8BP Rewards System
-- This script initializes the PostgreSQL database with tables matching MongoDB collections

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users/Registrations table (replaces MongoDB registrations collection)
CREATE TABLE IF NOT EXISTS registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    eight_ball_pool_id VARCHAR(50) UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    discord_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Claim records table (replaces MongoDB claim_records collection)
CREATE TABLE IF NOT EXISTS claim_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    eight_ball_pool_id VARCHAR(50) NOT NULL,
    website_user_id VARCHAR(50),
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
    items_claimed TEXT[] DEFAULT '{}',
    error_message TEXT,
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
    -- Removed foreign key constraint to allow orphaned claim records
);

-- Log entries table (replaces MongoDB log_entries collection)
CREATE TABLE IF NOT EXISTS log_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    service VARCHAR(100),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- User mappings table (replaces MongoDB user_mappings collection)
CREATE TABLE IF NOT EXISTS user_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    eight_ball_pool_id VARCHAR(50) UNIQUE NOT NULL,
    website_user_id VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (eight_ball_pool_id) REFERENCES registrations(eight_ball_pool_id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_registrations_eight_ball_pool_id ON registrations(eight_ball_pool_id);
CREATE INDEX IF NOT EXISTS idx_registrations_discord_id ON registrations(discord_id);
CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON registrations(created_at);

CREATE INDEX IF NOT EXISTS idx_claim_records_eight_ball_pool_id ON claim_records(eight_ball_pool_id);
CREATE INDEX IF NOT EXISTS idx_claim_records_status ON claim_records(status);
CREATE INDEX IF NOT EXISTS idx_claim_records_claimed_at ON claim_records(claimed_at);

CREATE INDEX IF NOT EXISTS idx_log_entries_level ON log_entries(level);
CREATE INDEX IF NOT EXISTS idx_log_entries_service ON log_entries(service);
CREATE INDEX IF NOT EXISTS idx_log_entries_timestamp ON log_entries(timestamp);

CREATE INDEX IF NOT EXISTS idx_user_mappings_eight_ball_pool_id ON user_mappings(eight_ball_pool_id);
CREATE INDEX IF NOT EXISTS idx_user_mappings_website_user_id ON user_mappings(website_user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_registrations_updated_at BEFORE UPDATE ON registrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_mappings_updated_at BEFORE UPDATE ON user_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert initial data if needed
INSERT INTO registrations (eight_ball_pool_id, username, created_at) 
VALUES ('4240992207', 'random cunt', CURRENT_TIMESTAMP)
ON CONFLICT (eight_ball_pool_id) DO NOTHING;

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO 8bp_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO 8bp_user;
