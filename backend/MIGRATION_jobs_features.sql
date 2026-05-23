-- =============================================
-- Onraiser – job posts feature additions
-- Run this in the Supabase SQL editor ONCE.
-- =============================================

-- 1. Add a `deadline` column (date the position closes for applications)
ALTER TABLE job_posts
  ADD COLUMN IF NOT EXISTS deadline DATE;

-- 2. Add an `experience_strict` toggle.
--    true  = filter out applicants outside the experience range
--    false = show every applicant regardless of experience
ALTER TABLE job_posts
  ADD COLUMN IF NOT EXISTS experience_strict BOOLEAN DEFAULT false;

-- 3. Helpful index for the auto-cleanup job that removes posts whose
--    deadline ended more than 3 days ago.
CREATE INDEX IF NOT EXISTS idx_job_posts_deadline ON job_posts (deadline);
CREATE INDEX IF NOT EXISTS idx_job_posts_status ON job_posts (status);
