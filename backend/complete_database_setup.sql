-- Complete Database Setup for Dating App
-- Run this SQL script in your PostgreSQL database

-- First, let's check if tables exist and drop them if they have wrong structure
DROP TABLE IF EXISTS matches CASCADE;
DROP TABLE IF EXISTS user_interactions CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;

-- Ensure users table exists with all required columns
DO $$
BEGIN
    -- Add missing columns to users table if they don't exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        -- Add subscription column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'subscription') THEN
            ALTER TABLE users ADD COLUMN subscription VARCHAR(20) DEFAULT 'free';
        END IF;

        -- Add found_match column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'found_match') THEN
            ALTER TABLE users ADD COLUMN found_match BOOLEAN DEFAULT FALSE;
        END IF;

        -- Add matched_with column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'matched_with') THEN
            ALTER TABLE users ADD COLUMN matched_with INTEGER DEFAULT NULL;
        END IF;
    END IF;
END $$;

-- Create user_interactions table with proper structure
CREATE TABLE user_interactions (
    id SERIAL PRIMARY KEY,
    current_user_id INTEGER NOT NULL,
    target_user_id INTEGER NOT NULL,
    action VARCHAR(20) NOT NULL, -- 'selected', 'removed', 'accepted', 'rejected', 'matched'
    original_location VARCHAR(20) DEFAULT 'all', -- Track where profile came from
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraints
ALTER TABLE user_interactions
ADD CONSTRAINT fk_current_user
FOREIGN KEY (current_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE user_interactions
ADD CONSTRAINT fk_target_user
FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Create indexes for faster queries
CREATE INDEX idx_interactions_current_user ON user_interactions(current_user_id);
CREATE INDEX idx_interactions_target_user ON user_interactions(target_user_id);
CREATE INDEX idx_interactions_action ON user_interactions(action);

-- Ensure only one active interaction per user pair
ALTER TABLE user_interactions
ADD CONSTRAINT unique_active_interaction UNIQUE (current_user_id, target_user_id);

-- Create matches table
CREATE TABLE matches (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraints for matches
ALTER TABLE matches
ADD CONSTRAINT fk_sender
FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE matches
ADD CONSTRAINT fk_receiver
FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE;

-- Ensure no duplicate matches
ALTER TABLE matches
ADD CONSTRAINT unique_match UNIQUE (sender_id, receiver_id);

-- Create indexes for matches
CREATE INDEX idx_matches_sender ON matches(sender_id);
CREATE INDEX idx_matches_receiver ON matches(receiver_id);
CREATE INDEX idx_matches_status ON matches(status);

-- Create subscriptions table
CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    plan VARCHAR(50) NOT NULL, -- 'premium', 'vip', etc.
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'expired', 'cancelled'
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraint for subscriptions
ALTER TABLE subscriptions
ADD CONSTRAINT fk_subscription_user
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Create indexes for subscriptions
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- Update existing users to have free subscription if not set
UPDATE users SET subscription = 'free' WHERE subscription IS NULL;

-- Verify tables were created successfully
DO $$
BEGIN
    RAISE NOTICE 'Tables created successfully:';
    RAISE NOTICE 'user_interactions table: % records', (SELECT count(*) FROM user_interactions);
    RAISE NOTICE 'matches table: % records', (SELECT count(*) FROM matches);
    RAISE NOTICE 'subscriptions table: % records', (SELECT count(*) FROM subscriptions);
END $$;