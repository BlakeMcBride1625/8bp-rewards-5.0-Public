-- Migration: Add user dashboard tables
-- This migration adds support for user dashboard functionality including deregistration requests

-- Deregistration requests table
CREATE TABLE IF NOT EXISTS deregistration_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    discord_id VARCHAR(50) NOT NULL,
    eight_ball_pool_id VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45), -- IPv6 support
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by VARCHAR(50), -- Discord ID of admin who reviewed
    review_notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_deregistration_requests_discord_id ON deregistration_requests(discord_id);
CREATE INDEX IF NOT EXISTS idx_deregistration_requests_eight_ball_pool_id ON deregistration_requests(eight_ball_pool_id);
CREATE INDEX IF NOT EXISTS idx_deregistration_requests_status ON deregistration_requests(status);
CREATE INDEX IF NOT EXISTS idx_deregistration_requests_requested_at ON deregistration_requests(requested_at);

-- Add last_login_at and last_login_ip to track user sessions (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'registrations' AND column_name = 'last_login_at') THEN
        ALTER TABLE registrations ADD COLUMN last_login_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'registrations' AND column_name = 'last_login_ip') THEN
        ALTER TABLE registrations ADD COLUMN last_login_ip VARCHAR(45);
    END IF;
END $$;

-- Create index for last_login_at if not exists
CREATE INDEX IF NOT EXISTS idx_registrations_last_login_at ON registrations(last_login_at);

