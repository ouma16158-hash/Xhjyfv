// ─── Imports (ES Module — Cloudflare Workers entry point) ───
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { AwsClient } from 'aws4fetch';
import userController from './controller/userController.js';
import emailService from './services/emailService.js';
import authRoutes from './routes/auth.js';
import uploadIdentityRoute from './routes/upload-identity.js';
import personalRoute from './routes/personal.js';
import preferencesRoute from './routes/preferences.js';
import statusRoute from './routes/status.js';
import adminRoutes from './routes/admin.js';
import userRoutes from './routes/user.js';
import messageRoutes from './routes/messages.js';
import paymentRoutes from './routes/payment.js';
import testEmailRoute from './routes/test-email.js';

// Platform detection for debugging
const platformInfo = {
  isRender: !!(process.env.RENDER || process.env.RENDER_SERVICE_ID),
  isReplit: !!(process.env.REPL_ID || process.env.REPLIT_DB_URL),
  isCodespace: !!process.env.CODESPACES,
  nodeEnv: process.env.NODE_ENV || 'development',
};

console.log(`🌐 PLATFORM DETECTION:`, JSON.stringify(platformInfo, null, 2));
console.log(`🔍 Environment Variables Check:`);

const envVars = {
  EMAIL_USER: process.env.EMAIL_USER,
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
  ANON_KEY: process.env.ANON_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
  NODE_ENV: process.env.NODE_ENV,
};

Object.keys(envVars).forEach(key => {
  const value = envVars[key];
  if (key === 'SENDGRID_API_KEY' && value) {
    console.log(`   ${key}: ${value.substring(0, 15)}... (length: ${value.length})`);
  } else if (value) {
    console.log(`   ${key}: ${key.includes('SECRET') || key.includes('KEY') ? 'SET (hidden)' : value}`);
  } else {
    console.log(`   ${key}: NOT SET`);
  }
});

const app = new Hono();

// CORS
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// CF Workers env → process.env bridge (must run before any handler that reads process.env)
// In wrangler local dev, vars from .dev.vars are available via c.env but NOT process.env.
// This middleware populates process.env once on the first request.
let _cfEnvApplied = false;
app.use('*', async (c, next) => {
  if (!_cfEnvApplied && c.env && typeof c.env === 'object') {
    for (const [k, v] of Object.entries(c.env)) {
      if (typeof v === 'string' && !process.env[k]) process.env[k] = v;
    }
    _cfEnvApplied = true;
  }
  await next();
});

// Supabase Client — lazy so it picks up process.env values populated by the middleware above
let _supabaseClient = null;
const supabase = new Proxy({}, {
  get(_, prop) {
    if (!_supabaseClient) _supabaseClient = createClient(
      process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
      process.env.ANON_KEY || 'placeholder_key'
    );
    const val = _supabaseClient[prop];
    return typeof val === 'function' ? val.bind(_supabaseClient) : val;
  }
});

// R2 client for landing images (aws4fetch — works in both CF Workers and Node.js)
const LANDING_BUCKET = process.env.CLOUDFLARE_BUCKET_NAME || 'niche';
const LANDING_FOLDER = 'onraiser_landing';
const R2_PUBLIC_URL  = process.env.CLOUDFLARE_PUBLIC_URL || '';
const R2_ENDPOINT    = `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;

function getLandingR2() {
  return new AwsClient({
    accessKeyId:     process.env.KEY_ID || '',
    secretAccessKey: process.env.SECRET_KEY || '',
    region:          'auto',
    service:         's3',
  });
}

// Parse S3 XML list response
function parseS3ListXml(xml) {
  const items = [];
  const re = /<Contents>([\s\S]*?)<\/Contents>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const keyM = /<Key>([\s\S]*?)<\/Key>/.exec(m[1]);
    const dateM = /<LastModified>([\s\S]*?)<\/LastModified>/.exec(m[1]);
    if (keyM) items.push({ Key: keyM[1], LastModified: dateM ? dateM[1] : '' });
  }
  return items;
}

console.log(`🔧 R2 CONFIG CHECK:`);
console.log(`   ACCOUNT_ID : ${(process.env.CLOUDFLARE_ACCOUNT_ID || '').slice(0, 10)}…`);
console.log(`   BUCKET     : ${LANDING_BUCKET}`);
console.log(`   PUBLIC_URL : ${R2_PUBLIC_URL}`);
console.log(`   KEY_ID     : ${(process.env.KEY_ID || '').slice(0, 10)}…`);
console.log(`   SECRET_KEY : ${process.env.SECRET_KEY ? 'SET (hidden)' : 'NOT SET'}`);

// API routes
app.route("/api", authRoutes);
app.route("/api", uploadIdentityRoute);
app.route("/api", personalRoute);
app.route("/api", preferencesRoute);
app.route("/api", statusRoute);
app.route('/api/admin', adminRoutes);
app.route("/api/user", userRoutes);
app.route("/api/messages", messageRoutes);
app.route("/api/payment", paymentRoutes);
app.route("/api", testEmailRoute);

// ─────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────

function getTokenUser(c) {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return null;
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) { return null; }
}

async function getUserIdByEmail(currentUserEmail) {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', currentUserEmail)
    .single();
  if (error) throw new Error(`Supabase Query Error: ${error.message}`);
  if (!data) throw new Error('No user found with the provided email.');
  return data.id;
}

async function fetchUsers(currentUserId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .neq('id', currentUserId);
  if (error) throw new Error(`Supabase Query Error: ${error.message}`);
  if (!data || data.length === 0) throw new Error('No users found in the database.');
  return data;
}

function parsePrefLanguages(val) {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map(s => String(s).replace(/^\{|\}$/g, '').trim()).filter(Boolean);
  }
  return String(val).replace(/^\{|\}$/g, '').split(',').map(s => s.trim()).filter(Boolean);
}

function extractFirstValue(val) {
  if (!val) return '';
  if (Array.isArray(val)) return val.find(s => s && String(s).trim()) || '';
  const s = String(val).trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.find(v => v && String(v).trim()) || '';
    } catch (e) {}
  }
  return s;
}

function extractAllValues(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(s => String(s).replace(/^\{|\}$/g, '').trim()).filter(Boolean);
  const s = String(val).trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map(v => String(v).trim()).filter(Boolean);
    } catch (e) {}
  }
  return s ? [s.replace(/^\{|\}$/g, '')] : [];
}

async function fetchUsersWithPreFiltering(currentUserId, currentUser) {
  const currentRole = currentUser.orientation || 'seeker';
  const targetRole = currentRole === 'employer' ? 'seeker' : 'employer';

  console.log(`🔍 MATCH PRE-FILTER | viewer: ${currentUser.email} (${currentRole}) | looking for: ${targetRole}`);

  let query = supabase
    .from('users')
    .select('*')
    .neq('id', currentUserId)
    .in('status', ['approved', 'pending'])
    .eq('orientation', targetRole);

  const { data: rawCandidates, error: rawErr } = await supabase
    .from('users')
    .select('id, email, status, orientation, current_step, occupation')
    .neq('id', currentUserId)
    .eq('orientation', targetRole);

  if (!rawErr) {
    console.log(`🔍 MATCH DIAGNOSTIC | Total ${targetRole}s in DB: ${rawCandidates.length}`);
    rawCandidates.forEach(u => {
      console.log(`   → ${u.email} | status=${u.status} | step=${u.current_step} | occupation=${u.occupation}`);
    });
    const blocked = rawCandidates.filter(u => !['approved','pending'].includes(u.status));
    if (blocked.length) console.log(`⚠️  MATCH: ${blocked.length} profile(s) hidden because status is not approved/pending`);
  }

  if (currentRole === 'employer') {
    if (currentUser.pref_gender && currentUser.pref_gender !== 'Any') {
      query = query.eq('gender', currentUser.pref_gender);
    }
    if (currentUser.pref_age_min) {
      const maxDob = new Date();
      maxDob.setFullYear(maxDob.getFullYear() - parseInt(currentUser.pref_age_min));
      query = query.lte('dob', maxDob.toISOString());
    }
    if (currentUser.pref_body_type) {
      const educationOrder = ['Certificate', 'Diploma', "Bachelor's", "Master's", 'PhD'];
      const minLevel = educationOrder.indexOf(currentUser.pref_body_type);
      if (minLevel >= 0) {
        const validLevels = educationOrder.slice(minLevel);
        query = query.in('education', validLevels);
      }
    }
    if (currentUser.pref_willing_to_relocate === 'Yes') {
      query = query.eq('willing_to_relocate', 'Yes');
    }
    if (currentUser.pref_religion === 'today') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      query = query.gte('created_at', startOfDay.toISOString());
    }
  } else {
    if (currentUser.pref_religion === 'today') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      query = query.gte('created_at', startOfDay.toISOString());
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(`Supabase Query Error: ${error.message}`);
  console.log(`✅ MATCH RESULT | ${data ? data.length : 0} ${targetRole}(s) passed all filters`);
  return data || [];
}

async function getUserById(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw new Error('Error fetching current user');
  return data;
}

function calculateMatchScore(candidate, employer, companyJobs = []) {
  let seeker, company;
  if (candidate.orientation === 'seeker') {
    seeker = candidate;
    company = employer;
  } else {
    seeker = employer;
    company = candidate;
  }

  let score = 0;
  const details = [];

  const seekerMain      = normalizeMatchValue(parsePrefLanguages(seeker.pref_languages)[0] || '');
  const seekerSub       = normalizeMatchValue(extractFirstValue(seeker.pref_country_of_residence));
  const seekerLocation  = normalizeMatchValue(seeker.pref_living_situation || seeker.country_of_residence);
  const seekerMinSalary = parseFloat(seeker.pref_height || seeker.height) || 0;
  const companyLocation = normalizeMatchValue(company.country_of_residence || '');
  const hasJobFieldData = companyJobs.some(j => j.job_field);

  if (seekerMain) {
    let matched = false;
    if (hasJobFieldData) {
      matched = companyJobs.some(j => j.job_field && normalizeMatchValue(j.job_field).includes(seekerMain));
    } else {
      const companyMain = normalizeMatchValue(
        extractFirstValue(company.pref_languages) || extractFirstValue(company.occupation)
      );
      matched = !!(companyMain && companyMain.includes(seekerMain));
    }
    if (matched) { score++; details.push('Job field'); }
  }

  if (seekerSub) {
    let matched = false;
    if (hasJobFieldData) {
      matched = companyJobs.some(j => j.job_sub_field && normalizeMatchValue(j.job_sub_field).includes(seekerSub));
    } else {
      const companySub = normalizeMatchValue(
        extractFirstValue(company.pref_country_of_residence) || extractFirstValue(company.employment_type)
      );
      matched = !!(companySub && companySub.includes(seekerSub));
    }
    if (matched) { score++; details.push('Sub field'); }
  }

  if (seekerLocation && companyLocation) {
    if (companyLocation.includes(seekerLocation) || seekerLocation.includes(companyLocation)) {
      score++;
      details.push('Location');
    }
  }

  if (seekerMinSalary > 0 && companyJobs.length > 0) {
    const salaryMatch = companyJobs.some(job => {
      const jobMax = parseFloat(job.salary_max) || 0;
      return jobMax > 0 && jobMax >= seekerMinSalary;
    });
    if (salaryMatch) { score++; details.push('Salary range'); }
  }

  return { matchCount: score, details };
}

function normalizeMatchValue(value) {
  return String(value || '').trim().toLowerCase();
}

function compareAttribute(userValue, prefValue, prefMax) {
  if (userValue == null || prefValue == null) return 0;
  if (Array.isArray(userValue) && Array.isArray(prefValue)) {
    return userValue.some(val => prefValue.includes(val)) ? 1 : 0;
  }
  if (prefMax != null && !isNaN(userValue) && !isNaN(prefValue)) {
    const prefMinValue = Array.isArray(prefValue) ? prefValue[0] : prefValue;
    const prefMaxValue = Array.isArray(prefValue) ? prefValue[1] : prefMax;
    return (userValue >= prefMinValue && userValue <= prefMaxValue) ? 1 : 0;
  }
  return userValue === prefValue ? 1 : 0;
}

// Experience-strict filter helpers
function parseExperienceRange(label) {
  if (!label) return null;
  const s = String(label);
  const plus = s.match(/(\d+)\s*\+/);
  if (plus) return { min: parseInt(plus[1], 10), max: 99 };
  const range = s.match(/(\d+)\s*[–\-to]+\s*(\d+)/);
  if (range) return { min: parseInt(range[1], 10), max: parseInt(range[2], 10) };
  const single = s.match(/(\d+)/);
  if (single) { const n = parseInt(single[1], 10); return { min: n, max: n }; }
  return null;
}
function parseSeekerYears(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw);
  const plus = s.match(/(\d+)\s*\+/);
  if (plus) return parseInt(plus[1], 10);
  const range = s.match(/(\d+)\s*[\-–—]+\s*(\d+)/);
  if (range) return parseInt(range[2], 10);
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
function applicantPassesExperienceFilter(job, applicant) {
  if (!job || !job.experience_strict) return true;
  const range = parseExperienceRange(job.experience_required);
  if (!range) return true;
  const years = parseSeekerYears(applicant.religious_importance);
  if (years === null) return false;
  return years >= range.min && years <= range.max;
}

// Auto-cleanup of expired job posts
async function cleanupExpiredJobPosts() {
  try {
    const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('job_posts')
      .delete()
      .lt('deadline', cutoff)
      .not('deadline', 'is', null)
      .select('id');
    if (error) {
      if (!String(error.message).includes('does not exist')) {
        console.error('cleanupExpiredJobPosts error:', error.message);
      }
      return;
    }
    if (data && data.length > 0) {
      console.log(`🧹 Auto-deleted ${data.length} expired job post(s)`);
    }
  } catch (e) {
    console.error('cleanupExpiredJobPosts crash:', e.message);
  }
}
// Cleanup runs via CF Workers Cron Trigger (see wrangler.toml [triggers])
// No setTimeout/setInterval allowed at global scope in CF Workers.

// Online presence
const onlineMap = new Map();
const ONLINE_THRESHOLD_MS = 35 * 1000;

// ─────────────────────────────────────────────
// Inline API Routes
// ─────────────────────────────────────────────

// Match / users
app.get('/api/users/:email', async (c) => {
  const currentUserEmail = c.req.param('email');
  try {
    const currentUserId = await getUserIdByEmail(currentUserEmail);
    const currentUser = await getUserById(currentUserId);
    const preFilteredUsers = await fetchUsersWithPreFiltering(currentUserId, currentUser);

    if (preFilteredUsers.length === 0) {
      let adjustMessage = "No users found matching your preferences for All Profiles. ";
      if (currentUser.pref_gender && currentUser.pref_gender !== 'Any') {
        adjustMessage += `Try adjusting your preferred gender (currently: ${currentUser.pref_gender}). `;
      }
      if (currentUser.pref_country_of_residence) {
        adjustMessage += `Try adjusting your preferred county (currently: ${currentUser.pref_country_of_residence}). `;
      }
      if (currentUser.pref_age_min && currentUser.pref_age_max) {
        adjustMessage += `Try adjusting your age range (currently: ${currentUser.pref_age_min}-${currentUser.pref_age_max} years). `;
      }
      adjustMessage += "Consider broadening your criteria to find more matches.";
      return c.json({ shouldAdjustPreferences: true, message: adjustMessage, users: [], section: 'all_profiles' });
    }

    let jobsByCompanyId = new Map();
    let appliedJobIdsByCompany = new Map();
    let removedCompanyIds = new Set();
    const isSeeker = (currentUser.orientation || 'seeker') === 'seeker';

    if (isSeeker) {
      try {
        const { data: activeJobs, error: jobsError } = await supabase
          .from('job_posts').select('*').eq('status', 'active');
        if (!jobsError && activeJobs) {
          activeJobs.forEach(job => {
            if (!jobsByCompanyId.has(job.company_id)) jobsByCompanyId.set(job.company_id, []);
            jobsByCompanyId.get(job.company_id).push(job);
          });
        }
      } catch (jobErr) {
        console.log('Job posts unavailable for seeker matching; falling back to company profile fields.');
      }

      try {
        const { data: myApps } = await supabase.from('job_applications')
          .select('job_post_id').eq('seeker_id', currentUserId);
        const appliedJobIdSet = new Set((myApps || []).map(a => a.job_post_id));
        jobsByCompanyId.forEach((jobs, companyId) => {
          const applied = jobs.filter(j => appliedJobIdSet.has(j.id)).map(j => j.id);
          if (applied.length) appliedJobIdsByCompany.set(companyId, applied);
        });
      } catch (e) {}

      try {
        const { data: removed } = await supabase.from('user_interactions')
          .select('target_user_id').eq('current_user_id', currentUserId).eq('action', 'removed');
        removedCompanyIds = new Set((removed || []).map(r => r.target_user_id));
      } catch (e) {}
    }

    const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const matchedUsers = preFilteredUsers.map(user => {
      const companyJobs = jobsByCompanyId.get(user.id) || [];
      const details = calculateMatchScore(user, currentUser, companyJobs);
      const rawScore = typeof details === 'number' ? details : details.matchCount;
      const matchScore = Math.round((rawScore / 4) * 100);
      const appliedIds = appliedJobIdsByCompany.get(user.id) || [];
      const unappliedJobs = companyJobs.filter(j => !appliedIds.includes(j.id));
      const appliedPositions = companyJobs.filter(j => appliedIds.includes(j.id)).map(j => j.position);
      const hasNewJobs = unappliedJobs.some(j => {
        const ts = j.updated_at || j.created_at;
        if (!ts) return false;
        const t = new Date(ts).getTime();
        return Number.isFinite(t) && (now - t) <= NEW_WINDOW_MS;
      });
      return {
        ...user, matchScore, matchCount: rawScore, matchTotal: 4,
        matchDetails: details.details || [],
        matchedJobs: companyJobs.map(job => ({
          id: job.id, position: job.position,
          experience_required: job.experience_required,
          work_mode: job.work_mode, salary_min: job.salary_min, salary_max: job.salary_max
        })),
        appliedJobIds: appliedIds, appliedPositions,
        unappliedJobsCount: unappliedJobs.length,
        totalJobsCount: companyJobs.length, hasNewJobs
      };
    }).filter(user => {
      if (!isSeeker) return true;
      if (user.matchCount <= 0) return false;
      if (removedCompanyIds.has(user.id)) return false;
      if (user.totalJobsCount > 0 && user.unappliedJobsCount === 0) return false;
      return true;
    });

    matchedUsers.sort((a, b) => b.matchScore - a.matchScore);
    return c.json({ users: matchedUsers, message: null, shouldAdjustPreferences: false });
  } catch (error) {
    console.error("Error occurred:", error.message);
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.get('/api/user/profile-photo/:email', async (c) => {
  const currentUserEmail = c.req.param('email');
  try {
    const currentUserId = await getUserIdByEmail(currentUserEmail);
    const currentUser = await getUserById(currentUserId);
    const profilePhotoUrl = currentUser.photo_url || currentUser.profile_photo_url;
    if (!profilePhotoUrl) {
      return c.json({ success: false, message: 'Profile photo not found' }, 404);
    }
    return c.json({ success: true, profile_photo_url: profilePhotoUrl });
  } catch (error) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.get('/api/users/selected-you/:email', async (c) => {
  const currentUserEmail = c.req.param('email');
  try {
    const currentUserId = await getUserIdByEmail(currentUserEmail);
    const { data: interactions, error } = await supabase
      .from('user_interactions')
      .select(`*, selector_user:users!fk_current_user(*)`)
      .eq('target_user_id', currentUserId)
      .eq('action', 'selected');
    if (error) {
      return c.json({ success: false, message: 'Error fetching user interactions' }, 500);
    }
    if (!interactions || interactions.length === 0) return c.json([]);
    const currentUser = await getUserById(currentUserId);
    const selectorUsersWithMatchScore = interactions.map(interaction => {
      const user = interaction.selector_user;
      const matchScore = calculateMatchScore(user, currentUser);
      return { ...user, action: interaction.action, matchScore, interactionId: interaction.id };
    });
    selectorUsersWithMatchScore.sort((a, b) => b.matchScore - a.matchScore);
    return c.json(selectorUsersWithMatchScore);
  } catch (error) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.get('/api/users/shortlisted-me/:email', async (c) => {
  const currentUserEmail = c.req.param('email');
  try {
    const currentUserId = await getUserIdByEmail(currentUserEmail);
    const { data: interactions, error } = await supabase
      .from('user_interactions')
      .select(`*, selector_user:users!fk_current_user(*)`)
      .eq('target_user_id', currentUserId)
      .in('action', ['shortlisted', 'selected', 'chat_enabled', 'accepted']);
    if (error) {
      return c.json({ success: false, message: 'Error fetching shortlisted profiles' }, 500);
    }
    if (!interactions || interactions.length === 0) return c.json([]);
    const result = interactions.map(interaction => ({
      ...interaction.selector_user,
      action: interaction.action,
      interactionId: interaction.id
    }));
    return c.json(result);
  } catch (error) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.get('/api/users/match-scores/:email', async (c) => {
  const currentUserEmail = c.req.param('email');
  try {
    const currentUserId = await getUserIdByEmail(currentUserEmail);
    const currentUser = await getUserById(currentUserId);
    const { data: allUsers, error } = await supabase.from('users').select('*').neq('id', currentUserId);
    if (error) throw new Error('Error fetching users for match scores');
    const matchScores = {};
    allUsers.forEach(user => {
      const score = calculateMatchScore(user, currentUser);
      const totalAttributes = 18;
      matchScores[user.id] = Math.round((score / totalAttributes) * 100);
    });
    return c.json(matchScores);
  } catch (error) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.post('/api/users/match/:email', async (c) => {
  const currentUserEmail = c.req.param('email');
  const { matchedUserId } = await c.req.json();
  try {
    const currentUserId = await getUserIdByEmail(currentUserEmail);
    const { data: existingMatch } = await supabase
      .from('matches').select('*')
      .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${matchedUserId}),and(sender_id.eq.${matchedUserId},receiver_id.eq.${currentUserId})`)
      .single();
    if (existingMatch) return c.json({ success: false, message: "Match already exists" }, 400);
    const { data: newMatch, error: createError } = await supabase
      .from('matches')
      .insert({ sender_id: currentUserId, receiver_id: matchedUserId, status: 'pending', created_at: new Date().toISOString() })
      .select().single();
    if (createError) return c.json({ success: false, message: "Failed to create match request" }, 500);
    return c.json({ success: true, message: "Match request sent successfully", match: newMatch });
  } catch (error) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.get('/api/users/mutual-matches/:email', async (c) => {
  const currentUserEmail = c.req.param('email');
  try {
    const currentUserId = await getUserIdByEmail(currentUserEmail);
    const { data: mutualMatches, error } = await supabase
      .from('matches')
      .select(`*, sender:users!matches_sender_id_fkey(*), receiver:users!matches_receiver_id_fkey(*)`)
      .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
      .eq('status', 'accepted');
    if (error) return c.json({ success: false, message: error.message }, 500);
    const processedMatches = mutualMatches.map(match => {
      const otherUser = match.sender_id === currentUserId ? match.receiver : match.sender;
      return { ...otherUser, matchId: match.id, matchedAt: match.created_at, isMutualMatch: true };
    });
    return c.json(processedMatches);
  } catch (error) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.post('/api/users/accept/:email', async (c) => {
  const currentUserEmail = c.req.param('email');
  const { selectedUserId } = await c.req.json();
  try {
    const currentUserId = await getUserIdByEmail(currentUserEmail);
    const { error } = await supabase.from('user_interactions')
      .update({ action: 'accepted' })
      .eq('current_user_id', currentUserId).eq('target_user_id', selectedUserId);
    if (error) throw new Error('Error accepting user');
    return c.json({ success: true, message: 'User accepted' });
  } catch (error) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.post('/api/users/reject/:email', async (c) => {
  const currentUserEmail = c.req.param('email');
  const { selectedUserId } = await c.req.json();
  try {
    const currentUserId = await getUserIdByEmail(currentUserEmail);
    const { error } = await supabase.from('user_interactions')
      .update({ action: 'rejected' })
      .eq('current_user_id', currentUserId).eq('target_user_id', selectedUserId);
    if (error) throw new Error('Error rejecting user');
    return c.json({ success: true, message: 'User rejected' });
  } catch (error) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.get('/api/users/interactions/:email', async (c) => {
  const currentUserEmail = c.req.param('email');
  try {
    const currentUserId = await getUserIdByEmail(currentUserEmail);
    const { data: interactions, error } = await supabase
      .from('user_interactions')
      .select(`*, target_user:users!fk_target_user(*)`)
      .eq('current_user_id', currentUserId);
    if (error) throw new Error('Error fetching user interactions');
    const userInteractions = interactions.map(interaction => ({
      ...interaction.target_user,
      action: interaction.action,
      originalLocation: interaction.original_location || 'all',
      interactionId: interaction.id
    }));
    return c.json(userInteractions);
  } catch (error) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.post('/api/users/interact', async (c) => {
  const decoded = getTokenUser(c);
  if (!decoded) return c.json({ success: false, message: "Missing token" }, 401);
  try {
    const { targetUserId, action, originalLocation } = await c.req.json();
    const currentUserId = await getUserIdByEmail(decoded.email);
    const { data: existingInteraction } = await supabase
      .from('user_interactions').select('*')
      .eq('current_user_id', currentUserId).eq('target_user_id', targetUserId).single();
    if (existingInteraction) {
      const { error: updateError } = await supabase.from('user_interactions')
        .update({ action, original_location: originalLocation || existingInteraction.original_location || 'all', updated_at: new Date().toISOString() })
        .eq('current_user_id', currentUserId).eq('target_user_id', targetUserId);
      if (updateError) throw new Error('Error updating interaction');
    } else {
      const { error: insertError } = await supabase.from('user_interactions')
        .insert({ current_user_id: currentUserId, target_user_id: targetUserId, action, original_location: originalLocation || 'all' });
      if (insertError) throw new Error('Error creating interaction');
    }
    return c.json({ success: true, message: 'Interaction updated successfully' });
  } catch (error) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.post('/api/users/found-match-status', async (c) => {
  const decoded = getTokenUser(c);
  if (!decoded) return c.json({ success: false, message: "Missing token" }, 401);
  try {
    const { targetUserId, foundMatch } = await c.req.json();
    const { error } = await supabase.from('users').update({ found_match: foundMatch }).eq('id', targetUserId);
    if (error) throw new Error('Error updating found match status');
    return c.json({ success: true, message: 'Found match status updated successfully' });
  } catch (error) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.post('/api/users/match-status', async (c) => {
  const decoded = getTokenUser(c);
  if (!decoded) return c.json({ success: false, message: "Missing token" }, 401);
  try {
    const { targetUserId } = await c.req.json();
    const currentUserId = await getUserIdByEmail(decoded.email);
    const { error: currentUserError } = await supabase.from('users')
      .update({ found_match: true, matched_with: targetUserId }).eq('id', currentUserId);
    const { error: targetUserError } = await supabase.from('users')
      .update({ found_match: true, matched_with: currentUserId }).eq('id', targetUserId);
    if (currentUserError || targetUserError) throw new Error('Error updating match status');
    return c.json({ success: true, message: 'Match status updated successfully' });
  } catch (error) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.post('/api/users/select/:email', async (c) => {
  const currentUserEmail = c.req.param('email');
  const { selectedUserId, action } = await c.req.json();
  console.log(`📦 Select user request - Current user: ${currentUserEmail}, Selected user: ${selectedUserId}, Action: ${action}`);
  try {
    if (!selectedUserId || !action) {
      return c.json({ success: false, message: "Missing selectedUserId or action" }, 400);
    }
    const currentUserId = await getUserIdByEmail(currentUserEmail);
    if (!currentUserId) return c.json({ success: false, message: "Current user not found." }, 400);
    const { data, error } = await supabase.from('user_interactions').select('*')
      .eq('current_user_id', currentUserId).eq('target_user_id', selectedUserId);
    if (error) return c.json({ success: false, message: 'Error checking user interaction' }, 500);
    if (data.length > 0) {
      const { error: updateError } = await supabase.from('user_interactions')
        .update({ action }).eq('current_user_id', currentUserId).eq('target_user_id', selectedUserId);
      if (updateError) return c.json({ success: false, message: 'Error updating user interaction' }, 500);
      return c.json({ success: true, message: 'Interaction updated successfully' });
    } else {
      const { error: insertError } = await supabase.from('user_interactions')
        .insert({ current_user_id: currentUserId, target_user_id: selectedUserId, action });
      if (insertError) return c.json({ success: false, message: 'Error creating user interaction' }, 500);
      return c.json({ success: true, message: 'Interaction created successfully' });
    }
  } catch (error) {
    return c.json({ success: false, message: 'Server error during user selection' }, 500);
  }
});

app.get('/api/user/subscription', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(" ")[1];
    if (!token) return c.json({ plan: 'free', status: 'active' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data: user, error } = await supabase.from('users')
      .select('id, subscription').eq('email', decoded.email).single();
    if (error || !user) return c.json({ plan: 'free', status: 'active' });
    const { data: activeSubscription } = await supabase.from('subscriptions')
      .select('*').eq('user_id', user.id).eq('status', 'active')
      .gte('end_date', new Date().toISOString()).single();
    if (activeSubscription) {
      return c.json({ plan: activeSubscription.plan, status: 'active', startDate: activeSubscription.start_date, endDate: activeSubscription.end_date });
    } else {
      return c.json({ plan: 'free', status: 'active' });
    }
  } catch (error) {
    return c.json({ plan: 'free', status: 'active' });
  }
});

app.get('/api/user/subscription-status', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(" ")[1];
    if (!token) return c.json({ subscription: 'free' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data: user, error } = await supabase.from('users')
      .select('id, subscription').eq('email', decoded.email).single();
    if (error || !user) return c.json({ subscription: 'free' });
    const { data: activeSubscription } = await supabase.from('subscriptions')
      .select('plan, status, end_date').eq('user_id', user.id).eq('status', 'active')
      .gte('end_date', new Date().toISOString()).limit(1).maybeSingle();
    if (activeSubscription) {
      const planType = ['premium', 'weekly', 'monthly', 'yearly'].includes(activeSubscription.plan) ? 'premium' : 'free';
      if (planType === 'premium' && user.subscription !== 'premium') {
        await supabase.from('users').update({ subscription: 'premium' }).eq('id', user.id);
      }
      return c.json({ subscription: planType });
    } else if (user.subscription === 'premium') {
      return c.json({ subscription: 'premium' });
    } else {
      return c.json({ subscription: 'free' });
    }
  } catch (error) {
    return c.json({ subscription: 'free' });
  }
});

app.post('/api/users/mutual-match', async (c) => {
  const decoded = getTokenUser(c);
  if (!decoded) return c.json({ success: false, message: "Missing token" }, 401);
  try {
    const { targetUserId, originalLocation } = await c.req.json();
    const currentUserId = await getUserIdByEmail(decoded.email);
    const { error: currentUserError } = await supabase.from('user_interactions').upsert({
      current_user_id: currentUserId, target_user_id: targetUserId, action: 'accepted',
      original_location: originalLocation || 'selected-you', updated_at: new Date().toISOString()
    }, { onConflict: 'current_user_id,target_user_id' });
    if (currentUserError) console.error("Error creating current user interaction:", currentUserError);
    const { error: reverseUserError } = await supabase.from('user_interactions').upsert({
      current_user_id: targetUserId, target_user_id: currentUserId, action: 'accepted',
      original_location: 'selected', updated_at: new Date().toISOString()
    }, { onConflict: 'current_user_id,target_user_id' });
    if (reverseUserError) console.error("Error creating reverse user interaction:", reverseUserError);
    return c.json({ success: true, message: "Mutual match created successfully" });
  } catch (error) {
    return c.json({ success: false, message: "Server error" }, 500);
  }
});

app.get('/api/user', async (c) => {
  try {
    const email = c.req.query('email');
    const id = c.req.query('id');
    let query = supabase.from('users').select('*');
    if (email) {
      query = query.eq('email', email);
    } else if (id) {
      query = query.eq('id', id);
    } else {
      return c.json({ error: 'Email or ID parameter required' }, 400);
    }
    const { data, error } = await query.single();
    if (error) return c.json({ error: 'User not found' }, 404);
    if (id) {
      const { password, email: em, national_id_number, id_front_url, id_back_url, liveness_video_url, ...publicData } = data;
      return c.json(publicData);
    }
    return c.json(data);
  } catch (error) {
    return c.json({ error: 'Server error' }, 500);
  }
});

app.post('/api/users/match-request', userController.sendMatchRequest);

// Online presence
app.post('/api/user/heartbeat', async (c) => {
  const decoded = getTokenUser(c);
  if (!decoded) return c.json({ success: false }, 401);
  try {
    const { data: u } = await supabase.from('users').select('id').eq('email', decoded.email).single();
    if (u) onlineMap.set(u.id, Date.now());
    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: true });
  }
});

app.get('/api/user/online-status/:userId', async (c) => {
  const decoded = getTokenUser(c);
  if (!decoded) return c.json({ success: false }, 401);
  const uid = parseInt(c.req.param('userId'));
  const last = onlineMap.get(uid);
  const online = !!(last && Date.now() - last < ONLINE_THRESHOLD_MS);
  return c.json({ success: true, online, last_seen: last || null });
});

// ─────────────────────────────────────────────
// JOB POSTS API
// ─────────────────────────────────────────────

app.post('/api/jobs', async (c) => {
  const decoded = getTokenUser(c);
  if (!decoded) return c.json({ success: false, message: 'Unauthorized' }, 401);
  const { position, job_field, job_sub_field, experience_required, about_company, job_functions,
          skills_required, salary_min, salary_max, work_mode, attachment_url,
          deadline, experience_strict } = await c.req.json();
  try {
    const { data: user } = await supabase.from('users').select('id').eq('email', decoded.email).single();
    if (!user) return c.json({ success: false, message: 'User not found' }, 404);
    const insertPayload = {
      company_id: user.id, company_email: decoded.email,
      position, job_field: job_field || null, job_sub_field: job_sub_field || null,
      experience_required, about_company, job_functions,
      skills_required, salary_min: salary_min || null, salary_max: salary_max || null,
      work_mode, attachment_url: attachment_url || null, status: 'active',
      deadline: deadline || null,
      experience_strict: experience_strict === true || experience_strict === 'true'
    };
    let { data, error } = await supabase.from('job_posts').insert(insertPayload).select().single();
    if (error && /column .* does not exist/i.test(error.message || '')) {
      const { deadline: _d, experience_strict: _s, job_field: _jf, job_sub_field: _jsf, ...legacy } = insertPayload;
      const res2 = await supabase.from('job_posts').insert(legacy).select().single();
      data = res2.data; error = res2.error;
    }
    if (error) return c.json({ success: false, message: error.message }, 500);
    return c.json({ success: true, job: data });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get('/api/jobs', async (c) => {
  const decoded = getTokenUser(c);
  if (!decoded) return c.json({ success: false, message: 'Unauthorized' }, 401);
  try {
    const { data, error } = await supabase.from('job_posts')
      .select('*').eq('company_email', decoded.email).order('created_at', { ascending: false });
    if (error) return c.json({ success: false, message: error.message }, 500);
    return c.json({ success: true, jobs: data || [] });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get('/api/jobs/company/:companyId', async (c) => {
  const decoded = getTokenUser(c);
  if (!decoded) return c.json({ success: false, message: 'Unauthorized' }, 401);
  try {
    const companyId = parseInt(c.req.param('companyId'));
    const { data: company, error: cErr } = await supabase.from('users')
      .select('id, full_name, profile_photo_url, profile_video_url, occupation, employment_type, country_of_residence, religion, religious_importance, weight')
      .eq('id', companyId).single();
    if (cErr || !company) return c.json({ success: false, message: 'Company not found' }, 404);
    const { data: jobs, error: jErr } = await supabase.from('job_posts')
      .select('*').eq('company_id', companyId).eq('status', 'active').order('created_at', { ascending: false });
    if (jErr) return c.json({ success: false, message: jErr.message }, 500);
    let appliedJobIds = [];
    try {
      const { data: me } = await supabase.from('users').select('id').eq('email', decoded.email).single();
      if (me && jobs && jobs.length > 0) {
        const { data: apps } = await supabase.from('job_applications')
          .select('job_post_id').eq('seeker_id', me.id).in('job_post_id', jobs.map(j => j.id));
        appliedJobIds = (apps || []).map(a => a.job_post_id);
      }
    } catch (e) {}
    const enriched = (jobs || []).map(j => ({ ...j, alreadyApplied: appliedJobIds.includes(j.id) }));
    return c.json({ success: true, company, jobs: enriched });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get('/api/seeker/applied-companies', async (c) => {
  const decoded = getTokenUser(c);
  if (!decoded) return c.json({ success: false, message: 'Unauthorized' }, 401);
  try {
    const { data: me } = await supabase.from('users').select('id').eq('email', decoded.email).single();
    if (!me) return c.json({ success: true, companies: [] });
    const { data: apps } = await supabase.from('job_applications')
      .select('id, status, created_at, job_post_id').eq('seeker_id', me.id).order('created_at', { ascending: false });
    if (!apps || apps.length === 0) return c.json({ success: true, companies: [] });
    const jobIds = apps.map(a => a.job_post_id);
    const { data: jobs } = await supabase.from('job_posts').select('id, position, company_id').in('id', jobIds);
    const jobMap = Object.fromEntries((jobs || []).map(j => [j.id, j]));
    const companyIds = [...new Set((jobs || []).map(j => j.company_id))];
    if (companyIds.length === 0) return c.json({ success: true, companies: [] });
    const { data: companies } = await supabase.from('users').select('*').in('id', companyIds);
    const byCompany = new Map();
    apps.forEach(app => {
      const job = jobMap[app.job_post_id];
      if (!job) return;
      if (!byCompany.has(job.company_id)) byCompany.set(job.company_id, []);
      byCompany.get(job.company_id).push({ position: job.position, status: app.status, appliedAt: app.created_at, jobPostId: app.job_post_id });
    });
    const result = (companies || []).map(c2 => ({
      ...c2,
      appliedPositions: (byCompany.get(c2.id) || []).map(a => a.position),
      applications: byCompany.get(c2.id) || []
    }));
    return c.json({ success: true, companies: result });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get('/api/jobs/all', async (c) => {
  const decoded = getTokenUser(c);
  if (!decoded) return c.json({ success: false, message: 'Unauthorized' }, 401);
  try {
    const { data, error } = await supabase.from('job_posts')
      .select('*, company:users!job_posts_company_id_fkey(full_name, profile_photo_url, occupation, email)')
      .eq('status', 'active').order('created_at', { ascending: false });
    if (error) {
      const { data: plain, error: plainErr } = await supabase.from('job_posts')
        .select('*').eq('status', 'active').order('created_at', { ascending: false });
      if (plainErr) return c.json({ success: false, message: plainErr.message }, 500);
      return c.json({ success: true, jobs: plain || [] });
    }
    return c.json({ success: true, jobs: data || [] });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post('/api/jobs/:jobId/apply', async (c) => {
  const decoded = getTokenUser(c);
  if (!decoded) return c.json({ success: false, message: 'Unauthorized' }, 401);
  try {
    const { data: user } = await supabase.from('users').select('id').eq('email', decoded.email).single();
    if (!user) return c.json({ success: false, message: 'User not found' }, 404);
    const jobId = parseInt(c.req.param('jobId'));
    const { data: existing } = await supabase.from('job_applications')
      .select('id').eq('job_post_id', jobId).eq('seeker_id', user.id).maybeSingle();
    if (existing) return c.json({ success: true, message: 'Already applied' });
    const { data, error } = await supabase.from('job_applications')
      .insert({ job_post_id: jobId, seeker_id: user.id, seeker_email: decoded.email, status: 'applied' })
      .select().single();
    if (error) return c.json({ success: false, message: error.message }, 500);
    return c.json({ success: true, application: data });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get('/api/jobs/:jobId/applicants', async (c) => {
  const decoded = getTokenUser(c);
  if (!decoded) return c.json({ success: false, message: 'Unauthorized' }, 401);
  try {
    const jobId = parseInt(c.req.param('jobId'));
    const { data: job } = await supabase.from('job_posts')
      .select('*').eq('id', jobId).eq('company_email', decoded.email).maybeSingle();
    if (!job) return c.json({ success: false, message: 'Job not found or forbidden' }, 403);
    const { data: applications, error } = await supabase.from('job_applications')
      .select('id, status, created_at, seeker_id').eq('job_post_id', jobId).neq('status', 'rejected');
    if (error) return c.json({ success: false, message: error.message }, 500);
    const seekerIds = (applications || []).map(a => a.seeker_id);
    if (seekerIds.length === 0) return c.json({ success: true, applicants: [], job });
    const { data: seekers } = await supabase.from('users').select('*').in('id', seekerIds);
    const seekerMap = Object.fromEntries((seekers || []).map(s => [s.id, s]));
    const applicants = applications.map(app => ({
      ...(seekerMap[app.seeker_id] || {}),
      applicationId: app.id, applicationStatus: app.status,
      jobPostId: jobId, appliedAt: app.created_at
    })).filter(a => applicantPassesExperienceFilter(job, a));
    return c.json({ success: true, applicants, job });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get('/api/jobs/all-applicants', async (c) => {
  const decoded = getTokenUser(c);
  if (!decoded) return c.json({ success: false, message: 'Unauthorized' }, 401);
  try {
    const { data: jobs, error: jobsError } = await supabase.from('job_posts')
      .select('*').eq('company_email', decoded.email).order('created_at', { ascending: false });
    if (jobsError) return c.json({ success: false, message: jobsError.message }, 500);
    const jobIds = (jobs || []).map(job => job.id);
    if (jobIds.length === 0) return c.json({ success: true, applicants: [], jobs: [] });
    const { data: applications, error: appsError } = await supabase.from('job_applications')
      .select('id, status, created_at, seeker_id, job_post_id')
      .in('job_post_id', jobIds).neq('status', 'rejected').order('created_at', { ascending: false });
    if (appsError) return c.json({ success: false, message: appsError.message }, 500);
    const seekerIds = [...new Set((applications || []).map(app => app.seeker_id).filter(Boolean))];
    if (seekerIds.length === 0) return c.json({ success: true, applicants: [], jobs: jobs || [] });
    const { data: seekers, error: seekersError } = await supabase.from('users').select('*').in('id', seekerIds);
    if (seekersError) return c.json({ success: false, message: seekersError.message }, 500);
    const seekerMap = Object.fromEntries((seekers || []).map(seeker => [seeker.id, seeker]));
    const jobMap = Object.fromEntries((jobs || []).map(job => [job.id, job]));
    const applicants = (applications || []).map(app => {
      const job = jobMap[app.job_post_id] || {};
      const seeker = seekerMap[app.seeker_id] || {};
      return {
        ...seeker, applicationId: app.id, applicationStatus: app.status,
        jobPostId: app.job_post_id, jobPosition: job.position || 'Position not specified',
        jobWorkMode: job.work_mode || '', jobExperience: job.experience_required || '',
        appliedAt: app.created_at, _job: job
      };
    }).filter(applicant => applicant.id && applicantPassesExperienceFilter(applicant._job, applicant))
      .map(({ _job, ...rest }) => rest);
    return c.json({ success: true, applicants, jobs: jobs || [] });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post('/api/jobs/applications/:applicationId/action', async (c) => {
  const decoded = getTokenUser(c);
  if (!decoded) return c.json({ success: false, message: 'Unauthorized' }, 401);
  try {
    const { action } = await c.req.json();
    const appId = parseInt(c.req.param('applicationId'));
    const { data, error } = await supabase.from('job_applications')
      .update({ status: action }).eq('id', appId).select().single();
    if (error) return c.json({ success: false, message: error.message }, 500);
    if (action === 'chat_enabled' && data && data.seeker_id) {
      try {
        const { data: employerUser } = await supabase.from('users').select('id').eq('email', decoded.email).single();
        if (employerUser) {
          await supabase.from('user_interactions').upsert({
            current_user_id: employerUser.id, target_user_id: data.seeker_id, action: 'chat_enabled'
          }, { onConflict: 'current_user_id,target_user_id' });
        }
      } catch (upsertErr) {
        console.error('chat_enabled interaction upsert error:', upsertErr.message);
      }
    }
    return c.json({ success: true, application: data });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post('/api/jobs/:jobId/close', async (c) => {
  const decoded = getTokenUser(c);
  if (!decoded) return c.json({ success: false, message: 'Unauthorized' }, 401);
  try {
    const { data, error } = await supabase.from('job_posts')
      .update({ status: 'closed' }).eq('id', c.req.param('jobId'))
      .eq('company_email', decoded.email).select().single();
    if (error) return c.json({ success: false, message: error.message }, 500);
    return c.json({ success: true, job: data });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// Public jobs API
app.get('/api/public/jobs', async (c) => {
  try {
    cleanupExpiredJobPosts().catch(() => {});
    const today = new Date().toISOString().slice(0, 10);
    const { data: jobs, error: jErr } = await supabase.from('job_posts')
      .select('*').eq('status', 'active').order('created_at', { ascending: false });
    if (jErr) return c.json({ success: false, message: jErr.message }, 500);
    const liveJobs = (jobs || []).filter(j => !j.deadline || j.deadline >= today);
    const companyIds = [...new Set(liveJobs.map(j => j.company_id).filter(Boolean))];
    if (companyIds.length === 0) return c.json({ success: true, companies: [] });
    const { data: companies, error: cErr } = await supabase.from('users')
      .select('id, full_name, profile_photo_url, occupation, employment_type, country_of_residence, religion, religious_importance, weight, orientation')
      .in('id', companyIds);
    if (cErr) return c.json({ success: false, message: cErr.message }, 500);
    const grouped = (companies || []).map(company => ({
      id: company.id, full_name: company.full_name, profile_photo_url: company.profile_photo_url,
      occupation: company.occupation, employment_type: company.employment_type,
      country_of_residence: company.country_of_residence, religion: company.religion,
      jobs: liveJobs.filter(j => j.company_id === company.id).map(j => ({
        id: j.id, position: j.position, experience_required: j.experience_required,
        work_mode: j.work_mode, salary_min: j.salary_min, salary_max: j.salary_max,
        about_company: j.about_company, job_functions: j.job_functions,
        skills_required: j.skills_required, attachment_url: j.attachment_url,
        posted_at: j.created_at, deadline: j.deadline || null
      }))
    })).filter(company => company.jobs.length > 0);
    return c.json({ success: true, companies: grouped });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get('/api/public/company/:companyId', async (c) => {
  try {
    const companyId = parseInt(c.req.param('companyId'));
    const today = new Date().toISOString().slice(0, 10);
    const { data: company, error: cErr } = await supabase.from('users')
      .select('id, full_name, profile_photo_url, occupation, employment_type, country_of_residence, religion, religious_importance, weight, orientation')
      .eq('id', companyId).single();
    if (cErr || !company) return c.json({ success: false, message: 'Company not found' }, 404);
    const { data: jobs, error: jErr } = await supabase.from('job_posts')
      .select('*').eq('company_id', companyId).eq('status', 'active').order('created_at', { ascending: false });
    if (jErr) return c.json({ success: false, message: jErr.message }, 500);
    const liveJobs = (jobs || []).filter(j => !j.deadline || j.deadline >= today)
      .map(j => ({
        id: j.id, position: j.position, experience_required: j.experience_required,
        work_mode: j.work_mode, salary_min: j.salary_min, salary_max: j.salary_max,
        about_company: j.about_company, job_functions: j.job_functions,
        skills_required: j.skills_required, attachment_url: j.attachment_url,
        posted_at: j.created_at, deadline: j.deadline || null
      }));
    return c.json({ success: true, company, jobs: liveJobs });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get('/api/seeker/companies/search', async (c) => {
  const decoded = getTokenUser(c);
  if (!decoded) return c.json({ success: false, message: 'Unauthorized' }, 401);
  try {
    const q = String(c.req.query('q') || '').trim();
    if (!q) return c.json({ success: true, companies: [] });
    const today = new Date().toISOString().slice(0, 10);
    const { data: companies, error: cErr } = await supabase.from('users')
      .select('*').eq('orientation', 'employer').ilike('full_name', `%${q}%`).limit(40);
    if (cErr) return c.json({ success: false, message: cErr.message }, 500);
    if (!companies || companies.length === 0) return c.json({ success: true, companies: [] });
    const companyIds = companies.map(comp => comp.id);
    const { data: jobs } = await supabase.from('job_posts')
      .select('*').in('company_id', companyIds).eq('status', 'active');
    const liveJobs = (jobs || []).filter(j => !j.deadline || j.deadline >= today);
    const enriched = companies.map(comp => {
      const cJobs = liveJobs.filter(j => j.company_id === comp.id);
      return {
        ...comp,
        matchedJobs: cJobs.map(j => ({
          id: j.id, position: j.position, experience_required: j.experience_required,
          work_mode: j.work_mode, salary_min: j.salary_min, salary_max: j.salary_max,
          deadline: j.deadline || null, posted_at: j.created_at
        })),
        unappliedJobsCount: cJobs.length, totalJobsCount: cJobs.length
      };
    }).filter(comp => comp.matchedJobs.length > 0);
    return c.json({ success: true, companies: enriched });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// Admin extras
app.post('/api/admin/toggle-manual-payment', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ success: false, message: 'Unauthorized' }, 401);
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return c.json({ success: false, message: 'Forbidden' }, 403);
    const { email, enabled } = await c.req.json();
    if (!email) return c.json({ success: false, message: 'Email required' }, 400);
    const { error } = await supabase.from('users')
      .update({ smoking: enabled ? 'manual_enabled' : null }).eq('email', email);
    if (error) return c.json({ success: false, message: error.message }, 500);
    return c.json({ success: true, message: `Manual payment ${enabled ? 'enabled' : 'disabled'} for ${email}` });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post('/api/admin/send-user-message', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ success: false, message: 'Unauthorized' }, 401);
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return c.json({ success: false, message: 'Forbidden' }, 403);
    const { email, message } = await c.req.json();
    if (!email || !message) return c.json({ success: false, message: 'Email and message required' }, 400);
    const htmlContent = `
      <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:12px;">
        <h2 style="color:#0d0d0d;margin-bottom:6px;">Message from Onraiser</h2>
        <hr style="border:none;border-top:1px solid #e0e0e0;margin-bottom:24px;">
        <div style="background:white;border-radius:8px;padding:20px;font-size:1rem;color:#333;line-height:1.7;white-space:pre-wrap;">${message.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        <p style="margin-top:24px;font-size:0.85rem;color:#888;">This message was sent by the Onraiser admin team.</p>
      </div>
    `;
    await emailService.sendWithSendGrid(email, 'Message from Onraiser', htmlContent);
    console.log(`📧 Admin message sent to ${email}`);
    return c.json({ success: true, message: `Message sent to ${email}` });
  } catch (err) {
    console.error('Admin send-message error:', err.message);
    return c.json({ success: false, message: err.message }, 500);
  }
});

// Landing images — stored in Cloudflare R2
app.get('/api/public/landing-images', async (c) => {
  try {
    const r2 = getLandingR2();
    const listRes = await r2.fetch(
      `${R2_ENDPOINT}/${LANDING_BUCKET}?list-type=2&prefix=${encodeURIComponent(LANDING_FOLDER + '/')}`
    );
    const xml = await listRes.text();
    const contents = parseS3ListXml(xml);
    const images = contents
      .filter(obj => obj.Key !== LANDING_FOLDER + '/')
      .sort((a, b) => new Date(a.LastModified) - new Date(b.LastModified))
      .map(obj => ({ id: encodeURIComponent(obj.Key), url: `${R2_PUBLIC_URL}/${obj.Key}` }));
    return c.json({ success: true, images });
  } catch (err) {
    console.warn('Landing images list error:', err.message);
    return c.json({ success: true, images: [] });
  }
});

app.post('/api/admin/landing-images', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ success: false, message: 'Unauthorized' }, 401);
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return c.json({ success: false, message: 'Forbidden' }, 403);
    const body = await c.req.parseBody({ all: true });
    const imageFile = body['image'];
    if (!imageFile) return c.json({ success: false, message: 'No image uploaded' }, 400);
    const mimeType = typeof imageFile === 'object' ? (imageFile.type || 'image/jpeg') : 'image/jpeg';
    const ext = mimeType.split('/')[1] || 'jpg';
    const key = `${LANDING_FOLDER}/${Date.now()}.${ext}`;
    const fileBuffer = typeof imageFile.arrayBuffer === 'function'
      ? Buffer.from(await imageFile.arrayBuffer())
      : imageFile;
    const r2 = getLandingR2();
    await r2.fetch(`${R2_ENDPOINT}/${LANDING_BUCKET}/${key}`, {
      method: 'PUT',
      body: fileBuffer,
      headers: { 'Content-Type': mimeType },
    });
    const imageUrl = `${R2_PUBLIC_URL}/${key}`;
    return c.json({ success: true, image: { id: encodeURIComponent(key), url: imageUrl } });
  } catch (err) {
    console.error('Landing image upload error:', err.message);
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.delete('/api/admin/landing-images/:id', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ success: false, message: 'Unauthorized' }, 401);
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return c.json({ success: false, message: 'Forbidden' }, 403);
    const key = decodeURIComponent(c.req.param('id'));
    const r2 = getLandingR2();
    await r2.fetch(`${R2_ENDPOINT}/${LANDING_BUCKET}/${key}`, { method: 'DELETE' });
    return c.json({ success: true });
  } catch (err) {
    console.error('Landing image delete error:', err.message);
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get("/api", (c) => c.text("✅ Onraiser Job Platform API is running."));

// Static files are served by Cloudflare Workers Assets binding (configured in wrangler.toml)
// For local Node.js dev, use dev-server.js which adds serveStatic via @hono/node-server

// ─────────────────────────────────────────────
// Cloudflare Workers entry point
// ─────────────────────────────────────────────
export default {
  fetch: app.fetch.bind(app),
  // Cron trigger: runs cleanupExpiredJobPosts every hour (configured in wrangler.toml)
  scheduled(_event, _env, ctx) {
    ctx.waitUntil(cleanupExpiredJobPosts());
  },
};
