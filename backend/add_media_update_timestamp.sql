
-- Add last_media_update column to track when users last updated their media
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_media_update TIMESTAMP;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_last_media_update ON users(last_media_update);
