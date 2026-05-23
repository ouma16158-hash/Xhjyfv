
-- Add missing columns to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS read_at TIMESTAMP;

-- Update existing messages to set is_read based on read_at
UPDATE messages 
SET is_read = (read_at IS NOT NULL) 
WHERE is_read IS NULL;
