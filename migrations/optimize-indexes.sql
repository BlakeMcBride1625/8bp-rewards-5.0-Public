-- PostgreSQL Index Optimisation
-- Run this script to add performance indexes for common queries

-- Composite indexes for leaderboard queries (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_claim_records_eight_ball_pool_id_claimed_at 
ON claim_records(eight_ball_pool_id, claimed_at DESC);

CREATE INDEX IF NOT EXISTS idx_claim_records_status_claimed_at 
ON claim_records(status, claimed_at DESC);

-- Composite index for user lookup with status filter
CREATE INDEX IF NOT EXISTS idx_registrations_status_eight_ball_pool_id 
ON registrations(status, eight_ball_pool_id);

-- Index for date range queries on claim_records (leaderboard timeframes)
CREATE INDEX IF NOT EXISTS idx_claim_records_claimed_at_date 
ON claim_records(date(claimed_at));

-- Partial index for active users only (most queries filter by status)
CREATE INDEX IF NOT EXISTS idx_registrations_active 
ON registrations(eight_ball_pool_id, username, created_at) 
WHERE status = 'active' OR status IS NULL;

-- Index for invalid users lookups
CREATE INDEX IF NOT EXISTS idx_invalid_users_eight_ball_pool_id_deregistered_at 
ON invalid_users(eight_ball_pool_id, deregistered_at DESC);

-- Analyse tables to update query planner statistics
ANALYZE registrations;
ANALYZE claim_records;
ANALYZE invalid_users;
ANALYZE validation_logs;





