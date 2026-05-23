-- Add job_field and job_sub_field columns to job_posts for matchmaking
ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS job_field TEXT;
ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS job_sub_field TEXT;
