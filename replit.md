# Onraiser – Job-Seeking Platform

## Overview

Onraiser is a full-stack job-seeking platform that connects skilled professionals with employers through smart profile matching. Built on top of an existing Node.js/Express/Supabase infrastructure that was originally a dating app (Takeyours), Onraiser repurposes the same schema and infrastructure for the job market.

**Key Features:**
- Role-based registration: Job Seeker or Employer
- Multi-step profile setup (personal info → preferences → admin approval)
- Job seekers upload video introductions and a document vault (CV, degrees, etc.)
- Employers post their company profile and create a first job post during setup
- Employers can post specific job positions via "Add a Job" (post-job.html)
- Smart seeker-side matching that counts 3 attributes: main industry, sub industry, and location
- Seeker clicks a matched company → company-jobs.html lists every active position, with Apply on each
- Seeker dashboard: Companies, Applied, Shortlisted tabs
- Employer dashboard: Applications, Shortlisted, Allowed to Chat tabs + My Jobs panel, all tied to posted positions
- My Jobs panel: employers see posted positions → click a position → see applicants for that job
- Premium subscription required for chat activation

**Landing Images Table (must be created in Supabase SQL editor):**
Run `backend/MIGRATION_landing_images.sql` to create the `landing_images` table used by the hero background slideshow on the landing page.
```sql
CREATE TABLE IF NOT EXISTS landing_images (
  id SERIAL PRIMARY KEY, url TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Job Post Tables (must be created in Supabase SQL editor):**
```sql
CREATE TABLE IF NOT EXISTS job_posts (
  id SERIAL PRIMARY KEY, company_id INTEGER, company_email TEXT,
  position TEXT, job_field TEXT, job_sub_field TEXT,
  experience_required TEXT, about_company TEXT,
  job_functions TEXT, skills_required TEXT, salary_min NUMERIC,
  salary_max NUMERIC, work_mode TEXT, attachment_url TEXT,
  status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW(),
  deadline DATE,                              -- application deadline (auto-delete 3 days later)
  experience_strict BOOLEAN DEFAULT FALSE     -- strict experience filter on applicants
);
CREATE TABLE IF NOT EXISTS job_applications (
  id SERIAL PRIMARY KEY, job_post_id INTEGER, seeker_id INTEGER,
  seeker_email TEXT, status TEXT DEFAULT 'applied',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
For existing databases, run `backend/MIGRATION_jobs_features.sql` to add the
`deadline` and `experience_strict` columns plus indexes, then run
`backend/MIGRATION_job_fields.sql` to add `job_field` and `job_sub_field`
columns. The backend silently falls back to insertions without those fields if
the migrations haven't been run.

## Public (no-login) Browsing
- `public-jobs.html` lists every active position grouped by company. No videos
  are shown on the company card; only the company's bio + location + industry +
  preferences. Each position shows posted date and deadline.
- Backend endpoints (no auth):
  - `GET /api/public/jobs` – all live positions grouped by company
  - `GET /api/public/company/:id` – one company + its open positions
- Clicking "Apply" on a public job redirects to `login.html?next=apply&job=ID`.
- Auto-cleanup task in `backend/server.js` (`cleanupExpiredJobPosts`) deletes
  jobs whose deadline + 3 days has elapsed; runs every hour.

## Dashboard Company Search (Seeker)
- `companySearchBar` on the seeker dashboard hits
  `GET /api/seeker/companies/search?q=` (auth-required) and bypasses the
  matching algorithm. Click ✕ to restore the matched companies list.
- Clicking a result opens `company-jobs.html?id=<companyId>` with all positions.

## Strict Experience Filter (Employer)
- `job_posts.experience_strict` flag (per job). When true, applicants whose
  `religious_importance` (years-of-experience field) falls outside the job's
  experience range are filtered out from `/api/jobs/:jobId/applicants` and
  `/api/jobs/all-applicants`. Helpers in `server.js`:
  `parseExperienceRange`, `parseSeekerYears`, `applicantPassesExperienceFilter`.
- Toggle is exposed on `post-job.html` and `preferences.html` (employer side).

## User Flow

1. **Register** → select role (Job Seeker / Employer), email + password
2. **OTP confirmation** → account created with `current_step='personal'`
3. **Login** → redirected to personal.html (identity step is bypassed)
4. **Personal Info** → role-specific form (seeker fields vs employer fields)
5. **Preferences** → seeker job preferences or employer first job post
6. **Admin Review** → `status` changes from `pending` to `approved`/`disapproved`
7. **Dashboard** → role-based tabs with match scores and interaction buttons

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
Vanilla HTML, CSS, and JavaScript multi-page application:
- **JWT Token Authentication**: Tokens stored in localStorage; role decoded from JWT payload
- **Role Detection**: `orientation` column stores `'seeker'` or `'employer'`; JWT includes `role` field
- **Progressive Onboarding**: personal → preferences → submission → dashboard
- **File Upload Flow**: Files uploaded individually to `/api/user/upload-file` (Cloudinary); URLs stored as JSON in DB

### Backend Architecture
Node.js + Express + Supabase + Cloudinary:
- **Auth routes**: `backend/routes/auth.js` – send-otp, verify-otp (stores role), login (includes role in JWT)
- **User routes**: `backend/routes/user.js` – progress, personal, preferences, upload-file
- **Server**: `backend/server.js` – matching logic, interactions, shortlisted-me endpoint
- **Controller**: `backend/controller/userController.js` – savePersonalInfo, savePreferences, uploadSingleFile

### Database Column Repurposing
See `COLUMN_MAPPING.md` for the full mapping. Key repurposings:
- `orientation` → user role ('seeker'/'employer')
- `occupation` → major category / industry
- `employment_type` → sub-major / work mode
- `religion` → seeker small bio / employer company bio
- `skin_color` → seeker skills
- `body_type` → seeker address
- `religious_importance` → seeker experience
- `political_views` → seeker projects
- `children` → seeker referees
- `height` → seeker min salary
- `weight` → employer max salary
- `liveness_video_url` → JSON array of seeker video intros
- `id_back_url` → JSON array of seeker document vault
- Preference columns repurposed for job platform filters

### Matching Algorithm
Seeker dashboard matching shows a count out of 3:
1. Seeker preferred main industry (`pref_languages`) vs company `occupation` or active job post text
2. Seeker preferred sub industry (`pref_country_of_residence`) vs company `employment_type` or job post text
3. Seeker preferred location (`pref_living_situation`) vs company `country_of_residence`

Companies appear on the seeker dashboard whenever at least one of the three items matches.
Companies do NOT need to have active job posts to appear (but they need at least one to receive applications).
Both employer and seeker personal forms collect Main Area + Sub Area (occupation / employment_type) so that scoring works.

Employer dashboard applications are loaded from `job_applications` only. Generic matched seekers are not shown to employers unless the seeker applied to a specific `job_posts` position.

### Key Files
- `frontend/register.html` – Role selection (Seeker/Employer) + registration form
- `frontend/personal.html` + `personal.js` – Role-based personal info form
- `frontend/preferences.html` + `preferences.js` – Role-based preferences form
- `frontend/adjust-preferences.html` + `adjust-preferences.js` – Dashboard preference adjustment page
- `frontend/dashboard_page.html` + `dashboard_script.js` – Role-based dashboard
- `backend/routes/auth.js` – OTP, registration, login with role
- `backend/routes/user.js` – User profile management + file upload
- `backend/controller/userController.js` – savePersonalInfo, savePreferences, uploadSingleFile
- `backend/server.js` – Matching, interactions, shortlisted-me
- `COLUMN_MAPPING.md` – DB column repurposing reference

## Environment Variables Required
Configure in `backend/.env`:
- `SUPABASE_URL`, `ANON_KEY` – Supabase database
- `JWT_SECRET` – JWT signing key
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` – File hosting
- `SENDGRID_API_KEY`, `EMAIL_USER` – OTP email delivery

## Deployment
- Port 5000, binding 0.0.0.0
- Configured as autoscale deployment on Replit
- Workflow: `node backend/server.js`
