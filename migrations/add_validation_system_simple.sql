-- Simple migration for validation system
-- Run this script to add the new tables for the unified validation system

-- Create invalid_users table
CREATE TABLE IF NOT EXISTS invalid_users (
    id SERIAL PRIMARY KEY,
    eight_ball_pool_id VARCHAR(50) NOT NULL UNIQUE,
    deregistration_reason VARCHAR(100) NOT NULL,
    source_module VARCHAR(100) NOT NULL,
    error_message TEXT,
    correlation_id VARCHAR(100),
    deregistered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    context JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create validation_logs table
CREATE TABLE IF NOT EXISTS validation_logs (
    id SERIAL PRIMARY KEY,
    unique_id VARCHAR(50) NOT NULL,
    source_module VARCHAR(100) NOT NULL,
    validation_result JSONB NOT NULL,
    context JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    correlation_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_invalid_users_eight_ball_pool_id ON invalid_users(eight_ball_pool_id);
CREATE INDEX IF NOT EXISTS idx_invalid_users_deregistered_at ON invalid_users(deregistered_at);
CREATE INDEX IF NOT EXISTS idx_invalid_users_source_module ON invalid_users(source_module);

CREATE INDEX IF NOT EXISTS idx_validation_logs_unique_id ON validation_logs(unique_id);
CREATE INDEX IF NOT EXISTS idx_validation_logs_source_module ON validation_logs(source_module);
CREATE INDEX IF NOT EXISTS idx_validation_logs_timestamp ON validation_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_validation_logs_correlation_id ON validation_logs(correlation_id);

-- Add status column to existing users table if it doesn't exist
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Update existing users to have active status
UPDATE registrations SET status = 'active' WHERE status IS NULL;

-- Create index on status column
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);




