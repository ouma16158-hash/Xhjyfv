
-- Clean up existing tables to avoid conflicts
DROP TABLE IF EXISTS user_interactions CASCADE;
DROP TABLE IF EXISTS matches CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;

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

-- Add subscription column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription VARCHAR(20) DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS found_match BOOLEAN DEFAULT FALSE;
