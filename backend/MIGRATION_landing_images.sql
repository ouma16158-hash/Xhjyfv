
CREATE TABLE IF NOT EXISTS landing_images (
  id         SERIAL PRIMARY KEY,
  url        TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
