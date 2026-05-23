-- Create table for pending media updates that need admin approval
CREATE TABLE IF NOT EXISTS pending_media_updates (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    pending_photo_url TEXT,
    pending_video_url TEXT,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    admin_message TEXT,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    reviewed_by VARCHAR(255)
);

-- Create table for pending premium subscriptions that need admin approval
CREATE TABLE IF NOT EXISTS pending_premium_subscriptions (
  id SERIAL PRIMARY KEY,
  user_email VARCHAR(255) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  payment_proof_url TEXT,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  transaction_reference VARCHAR(255),
  phone_number VARCHAR(20),
  plan VARCHAR(50) NOT NULL DEFAULT 'premium',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  admin_message TEXT,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP
);

-- Create subscriptions table for active subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add subscription column to users table if it doesn't exist
ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscription VARCHAR(20) DEFAULT 'free'; -- 'free', 'premium'

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pending_media_status ON pending_media_updates(status);
CREATE INDEX IF NOT EXISTS idx_pending_media_user ON pending_media_updates(user_email);
CREATE INDEX IF NOT EXISTS idx_pending_subscriptions_status ON pending_premium_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_pending_subscriptions_user ON pending_premium_subscriptions(user_email);

-- Create chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for chat messages
CREATE INDEX IF NOT EXISTS idx_chat_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_receiver ON chat_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_chat_sent_at ON chat_messages(sent_at);