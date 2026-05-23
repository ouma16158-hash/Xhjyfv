require("dotenv").config();
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

let _dbClient = null;
const supabase = new Proxy({}, {
  get(_, prop) {
    if (!_dbClient) _dbClient = createClient(process.env.SUPABASE_URL || 'https://placeholder.supabase.co', process.env.ANON_KEY || 'placeholder_key');
    const val = _dbClient[prop];
    return typeof val === 'function' ? val.bind(_dbClient) : val;
  }
});

console.log("🔧 R2 CONFIG CHECK:");
console.log("   ACCOUNT_ID :", process.env.CLOUDFLARE_ACCOUNT_ID ? process.env.CLOUDFLARE_ACCOUNT_ID.slice(0,8) + "…" : "MISSING");
console.log("   BUCKET     :", process.env.CLOUDFLARE_BUCKET_NAME || "MISSING");
console.log("   PUBLIC_URL :", process.env.CLOUDFLARE_PUBLIC_URL || "MISSING");
console.log("   KEY_ID     :", process.env.KEY_ID ? process.env.KEY_ID.slice(0,10) + "…" : "MISSING");
console.log("   SECRET_KEY :", process.env.SECRET_KEY ? "SET (hidden)" : "MISSING");

// Helper: extract file extension without path module
function getExt(name, mimeType) {
  if (name) { const m = name.match(/\.[^.]+$/); if (m) return m[0]; }
  if (mimeType) return "." + (mimeType.split("/")[1] || "bin");
  return ".bin";
}

// Upload to Cloudflare R2 — uses aws4fetch (CF Workers + Node.js compatible)
// input can be:
//   - a base64 data URL string ("data:image/...;base64,...")
//   - a Web API File object (from Hono's parseBody({ all: true }))
async function uploadToCloudinary(input, folder, mimeType) {
  console.log("☁️  Uploading to Cloudflare R2 | bucket:", process.env.CLOUDFLARE_BUCKET_NAME, "| folder:", folder);
  try {
    const { AwsClient } = await import('aws4fetch');
    let fileContent;
    let ext = ".bin";

    if (typeof input === "string" && input.startsWith("data:")) {
      const matches = input.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        fileContent = Buffer.from(matches[2], "base64");
        ext = "." + (mimeType.split("/")[1] || "bin");
      }
    } else if (input && typeof input === "object" && typeof input.arrayBuffer === "function") {
      fileContent = Buffer.from(await input.arrayBuffer());
      if (!mimeType) mimeType = input.type || "application/octet-stream";
      ext = getExt(input.name, mimeType);
    } else {
      throw new Error("Unsupported input type for R2 upload");
    }

    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    console.log("   → key:", fileName, "| size:", fileContent ? fileContent.length : 0, "bytes");

    const r2 = new AwsClient({
      accessKeyId:     process.env.KEY_ID || "",
      secretAccessKey: process.env.SECRET_KEY || "",
      region:          "auto",
      service:         "s3",
    });
    const endpoint = `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const res = await r2.fetch(`${endpoint}/${process.env.CLOUDFLARE_BUCKET_NAME}/${fileName}`, {
      method: "PUT",
      body: fileContent,
      headers: { "Content-Type": mimeType || "application/octet-stream" },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`R2 PUT failed (${res.status}): ${text}`);
    }

    const publicUrl = `${process.env.CLOUDFLARE_PUBLIC_URL}/${fileName}`;
    console.log("   ✅ R2 upload success:", publicUrl);
    return { url: publicUrl, public_id: fileName };
  } catch (err) {
    console.error("❌ R2 UPLOAD FAILED:", err.message);
    throw err;
  }
}

const uploadToR2 = uploadToCloudinary;

// Helper: extract a single file from Hono parseBody result (may be array or single)
function extractFile(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val.length > 0 ? val[0] : null;
  return val;
}

// Helper: get auth token user from Hono context
function getTokenUser(c) {
  const token = c.req.header('Authorization')?.split(" ")[1];
  if (!token) throw Object.assign(new Error("Missing token"), { status: 401 });
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = {
  uploadToCloudinary,

  uploadIdentity: async (c) => {
    console.log("📦 Incoming /api/upload-identity request...");

    let decoded;
    try {
      decoded = getTokenUser(c);
      console.log("🔐 Authenticated:", decoded.email);
    } catch (err) {
      return c.json({ success: false, message: err.status === 401 ? "Missing token" : "Invalid token" }, 401);
    }

    const userEmail = decoded.email;

    try {
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('*')
        .eq('email', userEmail)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error("🔥 Upload Identity Error:", checkError);
        return c.json({ success: false, message: checkError.message }, 500);
      }

      if (!existingUser) {
        return c.json({ success: false, message: "User not found" }, 404);
      }

      const body = await c.req.parseBody({ all: true });
      const { photo, video, idFront, idBack, nationalIdNumber } = body;

      let photoUrl = null;
      let videoUrl = null;
      let idFrontUrl = null;
      let idBackUrl = null;

      if (photo) {
        const photoResult = await uploadToR2(photo, "identity_photos", typeof photo === 'string' ? "image/jpeg" : photo.type);
        photoUrl = photoResult.url;
      }

      if (video) {
        const videoResult = await uploadToR2(video, "identity_videos", typeof video === 'string' ? "video/mp4" : video.type);
        videoUrl = videoResult.url;
      }

      if (idFront) {
        const idFrontResult = await uploadToR2(idFront, "id_documents", typeof idFront === 'string' ? "image/jpeg" : idFront.type);
        idFrontUrl = idFrontResult.url;
      }

      if (idBack) {
        const idBackResult = await uploadToR2(idBack, "id_documents", typeof idBack === 'string' ? "image/jpeg" : idBack.type);
        idBackUrl = idBackResult.url;
      }

      if (!nationalIdNumber || (!photoUrl && !photo) || (!idFrontUrl && !idFront)) {
        return c.json({ success: false, message: "Missing required identity verification data" }, 400);
      }

      const updateData = { updated_at: new Date().toISOString() };

      if (photoUrl) updateData.photo_url = photoUrl;
      if (videoUrl) updateData.liveness_video_url = videoUrl;
      if (idFrontUrl) updateData.id_front_url = idFrontUrl;
      if (idBackUrl) updateData.id_back_url = idBackUrl;
      if (nationalIdNumber) updateData.national_id_number = nationalIdNumber;

      if (nationalIdNumber && (photoUrl || photo) && (idFrontUrl || idFront)) {
        updateData.current_step = 'personal';
      }

      const { error: updateError } = await supabase
        .from('users')
        .update(updateData)
        .eq('email', userEmail);

      if (updateError) {
        console.error("🔥 Update Error:", updateError);
        return c.json({ success: false, message: updateError.message }, 500);
      }

      console.log("✅ Identity verification data saved for:", userEmail);
      return c.json({
        success: true,
        message: "Identity verification data uploaded successfully",
        current_step: 'personal'
      }, 200);

    } catch (error) {
      console.error("🔥 Identity upload error:", error.message);
      return c.json({ success: false, message: "Server error during identity verification save" }, 500);
    }
  },

  savePersonalInfo: async (c) => {
    console.log("📦 Incoming /api/user/personal request...");

    let decoded;
    try {
      decoded = getTokenUser(c);
      console.log("🔐 Authenticated:", decoded.email);
    } catch (err) {
      return c.json({ success: false, message: err.status === 401 ? "Missing token" : "Invalid token" }, 401);
    }

    const userEmail = decoded.email;

    try {
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('*')
        .eq('email', userEmail)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error("🔥 Save Personal Info Error:", checkError);
        return c.json({ success: false, message: checkError.message }, 500);
      }

      if (!existingUser) {
        return c.json({ success: false, message: "User not found" }, 404);
      }

      // Parse multipart form body (files + text fields)
      const rawBody = await c.req.parseBody({ all: true });

      const profilePhotoFile = extractFile(rawBody['profilePhoto']);
      const profileVideoFile = extractFile(rawBody['profileVideo']);

      let profilePhotoUrl = null;
      let profileVideoUrl = null;
      let profilePhotoPublicId = null;
      let profileVideoPublicId = null;

      try {
        if (profilePhotoFile) {
          console.log("📷 Uploading profile photo...");
          const photoUploadResult = await uploadToCloudinary(profilePhotoFile, "profile_photos", profilePhotoFile.type);
          profilePhotoUrl = photoUploadResult.url;
          profilePhotoPublicId = photoUploadResult.public_id;
          console.log("✅ Profile photo uploaded:", profilePhotoUrl);
        }

        if (profileVideoFile) {
          console.log("🎥 Uploading profile video...");
          const videoUploadResult = await uploadToCloudinary(profileVideoFile, "profile_videos", profileVideoFile.type);
          profileVideoUrl = videoUploadResult.url;
          profileVideoPublicId = videoUploadResult.public_id;
          console.log("✅ Profile video uploaded:", profileVideoUrl);
        }
      } catch (uploadError) {
        console.error("❌ File upload error:", uploadError);
        return c.json({ success: false, message: "File upload failed: " + uploadError.message }, 500);
      }

      // Build body object from remaining text fields
      const bodyFields = {};
      for (const [key, val] of Object.entries(rawBody)) {
        if (key !== 'profilePhoto' && key !== 'profileVideo') {
          bodyFields[key] = val;
        }
      }

      let languages = bodyFields['languages[]'];
      if (typeof languages === 'string') {
        languages = [languages];
      }

      const personalData = {
        ...bodyFields,
        languages: languages,
        profile_photo_url: profilePhotoUrl || bodyFields.profile_photo_url || null,
        profile_video_url: profileVideoUrl || bodyFields.profile_video_url || null,
        profile_photo_public_id: profilePhotoPublicId || null,
        profile_video_public_id: profileVideoPublicId || null,
        updated_at: new Date().toISOString(),
        current_step: 'preferences'
      };

      delete personalData['languages[]'];
      delete personalData.profilePhoto;
      delete personalData.profileVideo;
      delete personalData.video_intros;
      delete personalData.document_vault;

      const integerFields = ['height', 'weight', 'pref_age_min', 'pref_age_max', 'pref_height', 'pref_weight'];
      integerFields.forEach(field => {
        if (personalData[field] === '' || personalData[field] === undefined) {
          personalData[field] = null;
        } else if (personalData[field] !== null) {
          const parsed = parseInt(personalData[field], 10);
          personalData[field] = isNaN(parsed) ? null : parsed;
        }
      });

      const dateFields = ['dob'];
      dateFields.forEach(field => {
        if (personalData[field] === '' || personalData[field] === undefined) {
          personalData[field] = null;
        }
      });

      const { error: updateError } = await supabase
        .from('users')
        .update(personalData)
        .eq('email', userEmail);

      if (updateError) {
        console.error("🔥 Update Error:", updateError);
        return c.json({ success: false, message: updateError.message }, 500);
      }

      console.log("✅ Personal info saved for:", userEmail);
      return c.json({
        success: true,
        message: "Personal information saved successfully",
        current_step: 'preferences'
      }, 200);

    } catch (error) {
      console.error("🔥 Personal info save error:", error.message);
      return c.json({ success: false, message: "Server error during personal info save" }, 500);
    }
  },

  savePreferences: async (c) => {
    console.log("📦 Incoming /api/user/preferences request...");

    let decoded;
    try {
      decoded = getTokenUser(c);
      console.log("🔐 Authenticated:", decoded.email);
    } catch (err) {
      return c.json({ success: false, message: err.status === 401 ? "Missing token" : "Invalid token" }, 401);
    }

    const userEmail = decoded.email;

    try {
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('*')
        .eq('email', userEmail)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error("🔥 Save Preferences Error:", checkError);
        return c.json({ success: false, message: checkError.message }, 500);
      }

      if (!existingUser) {
        return c.json({ success: false, message: "User not found" }, 404);
      }

      const body = await c.req.parseBody({ all: true });

      const preferenceFields = [
        'pref_gender', 'pref_age_min', 'pref_age_max',
        'pref_body_type', 'pref_occupation', 'pref_religion', 'pref_ethnicity',
        'pref_languages', 'pref_interests', 'pref_lifestyle', 'pref_family_plans',
        'pref_smoking', 'pref_drinking', 'pref_exercise', 'pref_diet',
        'pref_pets', 'pref_travel', 'pref_communication_style',
        'pref_conflict_resolution', 'pref_love_language', 'pref_social_habits',
        'pref_financial_habits', 'pref_living_situation', 'pref_willing_to_relocate',
        'pref_relationship_type',
        'pref_country_of_birth',
        'pref_country_of_residence',
        'pref_country',
        'pref_height', 'pref_weight', 'pref_body_type', 'pref_skin_color'
      ];

      const preferenceUpdates = {};
      const integerPrefFields = ['pref_age_min', 'pref_age_max', 'pref_height', 'pref_weight'];

      preferenceFields.forEach(field => {
        if (body[field] !== undefined) {
          let value = body[field];
          if (['pref_languages', 'pref_interests'].includes(field) && typeof value === 'string') {
            value = value.split(',').map(item => item.trim()).filter(item => item.length > 0);
          }
          if (integerPrefFields.includes(field)) {
            if (value === '' || value === undefined || value === null) {
              value = null;
            } else {
              const parsed = parseInt(value, 10);
              value = isNaN(parsed) ? null : parsed;
            }
          }
          preferenceUpdates[field] = value;
        }
      });

      const updateData = {
        ...preferenceUpdates,
        current_step: 'submission',
        is_complete: true,
        updated_at: new Date().toISOString()
      };

      const { error: updateError } = await supabase
        .from('users')
        .update(updateData)
        .eq('email', userEmail);

      if (updateError) {
        console.error("🔥 Update Error:", updateError);
        return c.json({ success: false, message: updateError.message }, 500);
      }

      console.log("✅ Preferences saved for:", userEmail);
      return c.json({
        success: true,
        message: "Preferences saved successfully",
        current_step: 'submission'
      }, 200);

    } catch (error) {
      console.error("🔥 Preferences save error:", error.message);
      return c.json({ success: false, message: "Server error during preferences save" }, 500);
    }
  },

  getCurrentPreferences: async (c) => {
    console.log("📦 Incoming /api/user/current-preferences request...");

    let decoded;
    try {
      decoded = getTokenUser(c);
      console.log("🔐 Authenticated:", decoded.email);
    } catch (err) {
      return c.json({ success: false, message: err.status === 401 ? "Missing token" : "Invalid token" }, 401);
    }

    const userEmail = decoded.email;

    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', userEmail)
        .single();

      if (error) {
        console.error("🔥 Get Preferences Error:", error);
        return c.json({ success: false, message: error.message }, 500);
      }

      if (!user) {
        return c.json({ success: false, message: "User not found" }, 404);
      }

      console.log("✅ Preferences fetched for:", userEmail);
      return c.json(user, 200);

    } catch (error) {
      console.error("🔥 Get preferences error:", error.message);
      return c.json({ success: false, message: "Server error during preferences fetch" }, 500);
    }
  },

  updatePreferences: async (c) => {
    console.log("📦 Incoming /api/user/update-preferences request...");

    let decoded;
    try {
      decoded = getTokenUser(c);
      console.log("🔐 Authenticated:", decoded.email);
    } catch (err) {
      return c.json({ success: false, message: err.status === 401 ? "Missing token" : "Invalid token" }, 401);
    }

    const userEmail = decoded.email;
    const updateData = await c.req.json();

    if (updateData.pref_languages && typeof updateData.pref_languages === 'string') {
      if (!updateData.pref_languages.startsWith('{')) {
        updateData.pref_languages = `{${updateData.pref_languages}}`;
      }
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('email', userEmail)
        .select();

      if (error) {
        console.error("🔥 Update Error:", error);
        return c.json({ success: false, message: error.message }, 500);
      }

      console.log("✅ Preferences updated for:", userEmail);
      return c.json({
        success: true,
        message: "Preferences updated successfully",
        data: data[0]
      }, 200);

    } catch (error) {
      console.error("🔥 Update preferences error:", error.message);
      return c.json({ success: false, message: "Server error during preferences update" }, 500);
    }
  },

  getUserProgress: async (c) => {
    console.log("📦 Incoming /api/user/progress request...");

    let decoded;
    try {
      decoded = getTokenUser(c);
      console.log("🔐 Authenticated:", decoded.email);
    } catch (err) {
      return c.json({ success: false, message: err.status === 401 ? "Missing token" : "Invalid token" }, 401);
    }

    const userEmail = decoded.email;

    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('current_step, status, orientation')
        .eq('email', userEmail)
        .single();

      if (error) {
        console.error("🔥 Get Progress Error:", error);
        return c.json({ success: false, message: error.message }, 500);
      }

      if (!user) {
        return c.json({ success: false, message: "User not found" }, 404);
      }

      console.log("✅ Progress retrieved for:", userEmail, "Step:", user.current_step, "Status:", user.status);
      return c.json({
        success: true,
        current_step: user.current_step || 'identity',
        status: user.status || 'pending',
        orientation: user.orientation || 'seeker'
      }, 200);

    } catch (err) {
      console.error("🔥 Get progress error:", err.message);
      return c.json({ success: false, message: "Server error during progress retrieval" }, 500);
    }
  },

  resetUserSubmission: async (c) => {
    console.log("📦 Incoming /api/user/reset-submission request...");

    let decoded;
    try {
      decoded = getTokenUser(c);
      console.log("🔐 Authenticated:", decoded.email);
    } catch (err) {
      return c.json({ success: false, message: err.status === 401 ? "Missing token" : "Invalid token" }, 401);
    }

    const userEmail = decoded.email;

    try {
      const { data, error } = await supabase
        .from('users')
        .update({
          current_step: 'identity',
          status: 'pending',
          admin_message: null,
          full_name: null,
          dob: null,
          gender: null,
          orientation: null,
          country_of_birth: null,
          country_of_residence: null,
          city: null,
          willing_to_relocate: null,
          languages: null,
          preferred_language: null,
          education: null,
          occupation: null,
          employment_type: null,
          religion: null,
          religious_importance: null,
          political_views: null,
          height: null,
          weight: null,
          skin_color: null,
          body_type: null,
          eye_color: null,
          hair_color: null,
          ethnicity: null,
          diet: null,
          smoking: null,
          drinking: null,
          exercise: null,
          pets: null,
          living_situation: null,
          children: null,
          photo_url: null,
          video_url: null,
          profile_photo_url: null,
          profile_video_url: null,
          id_front_url: null,
          id_back_url: null,
          liveness_video_url: null,
          national_id_number: null,
          is_complete: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('email', userEmail)
        .select();

      if (error) {
        console.error("🔥 Reset Submission Error:", error);
        return c.json({ success: false, message: error.message }, 500);
      }

      console.log("✅ User submission completely reset for:", userEmail);
      return c.json({
        success: true,
        message: "User submission completely reset - starting fresh as new user"
      }, 200);

    } catch (err) {
      console.error("🔥 Reset Submission Error:", err.message);
      return c.json({ success: false, message: "Server error during submission reset" }, 500);
    }
  },

  resetIdentityOnly: async (c) => {
    console.log("📦 Incoming /api/user/reset-identity request...");

    let decoded;
    try {
      decoded = getTokenUser(c);
      console.log("🔐 Authenticated:", decoded.email);
    } catch (err) {
      return c.json({ success: false, message: err.status === 401 ? "Missing token" : "Invalid token" }, 401);
    }

    const userEmail = decoded.email;

    try {
      const { data, error } = await supabase
        .from('users')
        .update({
          current_step: 'identity',
          status: 'pending',
          admin_message: null,
          id_front_url: null,
          id_back_url: null,
          liveness_video_url: null,
          national_id_number: null
        })
        .eq('email', userEmail)
        .select();

      if (error) {
        console.error("🔥 Reset Identity Error:", error);
        return c.json({ success: false, message: error.message }, 500);
      }

      console.log("✅ Identity reset successfully for:", userEmail);
      return c.json({ success: true, message: "Identity reset successfully" }, 200);

    } catch (err) {
      console.error("🔥 Reset Identity Error:", err.message);
      return c.json({ success: false, message: "Server error during identity reset" }, 500);
    }
  },

  resetPersonalOnly: async (c) => {
    console.log("📦 Incoming /api/user/reset-personal request...");

    let decoded;
    try {
      decoded = getTokenUser(c);
      console.log("🔐 Authenticated:", decoded.email);
    } catch (err) {
      return c.json({ success: false, message: err.status === 401 ? "Missing token" : "Invalid token" }, 401);
    }

    const userEmail = decoded.email;

    try {
      const { data, error } = await supabase
        .from('users')
        .update({
          current_step: 'personal',
          status: 'pending',
          admin_message: null,
          full_name: null,
          dob: null,
          gender: null,
          orientation: null,
          country_of_birth: null,
          country_of_residence: null,
          city: null,
          willing_to_relocate: null,
          languages: null,
          preferred_language: null,
          education: null,
          occupation: null,
          employment_type: null,
          religion: null,
          religious_importance: null,
          political_views: null,
          height: null,
          weight: null,
          skin_color: null,
          body_type: null,
          eye_color: null,
          hair_color: null,
          ethnicity: null,
          diet: null,
          smoking: null,
          drinking: null,
          exercise: null,
          pets: null,
          living_situation: null,
          children: null,
          photo_url: null,
          video_url: null,
          profile_photo_url: null,
          profile_video_url: null
        })
        .eq('email', userEmail)
        .select();

      if (error) {
        console.error("🔥 Reset Personal Error:", error);
        return c.json({ success: false, message: error.message }, 500);
      }

      console.log("✅ Personal info reset successfully for:", userEmail);
      return c.json({ success: true, message: "Personal info reset successfully" }, 200);

    } catch (err) {
      console.error("🔥 Reset Personal Error:", err.message);
      return c.json({ success: false, message: "Server error during personal reset" }, 500);
    }
  },

  getUserProfilePhoto: async (c) => {
    try {
      const email = c.req.param('email');
      console.log(`📦 Fetching profile photo for: ${email}`);

      const { data: user, error } = await supabase
        .from('users')
        .select('profile_photo_url')
        .eq('email', email)
        .single();

      if (error || !user) {
        return c.json({ error: 'User not found' }, 404);
      }

      return c.json({ profile_photo_url: user.profile_photo_url });
    } catch (error) {
      console.error('❌ Error fetching profile photo:', error);
      return c.json({ error: 'Server error' }, 500);
    }
  },

  updateMedia: async (c) => {
    console.log("📦 Incoming /api/user/update-media request...");

    let decoded;
    try {
      decoded = getTokenUser(c);
      console.log("🔐 Authenticated:", decoded.email);
    } catch (err) {
      return c.json({ success: false, message: err.status === 401 ? "Missing token" : "Invalid token" }, 401);
    }

    const userEmail = decoded.email;

    try {
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('*')
        .eq('email', userEmail)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error("🔥 Update Media Error:", checkError);
        return c.json({ success: false, message: checkError.message }, 500);
      }

      if (!existingUser) {
        return c.json({ success: false, message: "User not found" }, 404);
      }

      const rawBody = await c.req.parseBody({ all: true });
      const profilePhotoFile = extractFile(rawBody['profilePhoto']);
      const profileVideoFile = extractFile(rawBody['profileVideo']);

      let profilePhotoUrl = null;
      let profileVideoUrl = null;

      try {
        if (profilePhotoFile) {
          console.log("📷 Uploading new profile photo...");
          const photoUploadResult = await uploadToCloudinary(profilePhotoFile, "profile_photos", profilePhotoFile.type);
          profilePhotoUrl = photoUploadResult.url;
        }

        if (profileVideoFile) {
          console.log("🎥 Uploading new profile video...");
          const videoUploadResult = await uploadToCloudinary(profileVideoFile, "profile_videos", profileVideoFile.type);
          profileVideoUrl = videoUploadResult.url;
        }
      } catch (uploadError) {
        console.error("❌ File upload error:", uploadError);
        return c.json({ success: false, message: "File upload failed: " + uploadError.message }, 500);
      }

      const updateData = {
        user_email: userEmail,
        pending_photo_url: profilePhotoUrl,
        pending_video_url: profileVideoUrl,
        status: 'pending',
        requested_at: new Date().toISOString()
      };

      const { error: insertError } = await supabase
        .from('pending_media_updates')
        .insert(updateData);

      if (insertError) {
        console.error("🔥 Insert Error:", insertError);
        return c.json({ success: false, message: insertError.message }, 500);
      }

      await supabase
        .from('users')
        .update({ last_media_update: new Date().toISOString() })
        .eq('email', userEmail);

      console.log("✅ Media update request submitted for:", userEmail);
      return c.json({
        success: true,
        message: "Media update request submitted for admin approval"
      }, 200);

    } catch (error) {
      console.error("🔥 Media update error:", error.message);
      return c.json({ success: false, message: "Server error during media update" }, 500);
    }
  },

  setMediaUpdateTimestamp: async (c) => {
    console.log("📦 Incoming /api/user/set-media-update-timestamp request...");

    let decoded;
    try {
      decoded = getTokenUser(c);
    } catch (err) {
      return c.json({ success: false, message: "Invalid token" }, 401);
    }

    const userEmail = decoded.email;
    const { timestamp } = await c.req.json();

    try {
      const { error } = await supabase
        .from('users')
        .update({ last_media_update: timestamp })
        .eq('email', userEmail);

      if (error) {
        return c.json({ success: false, message: error.message }, 500);
      }

      return c.json({ success: true, message: "Timestamp updated" }, 200);
    } catch (error) {
      return c.json({ success: false, message: "Server error" }, 500);
    }
  },

  sendMatchRequest: async (c) => {
    try {
      const decoded = getTokenUser(c);
      const senderEmail = decoded.email;
      const { targetUserId } = await c.req.json();

      if (!targetUserId) {
        return c.json({ success: false, message: "Target user ID is required" }, 400);
      }

      const { data: sender, error: senderError } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('email', senderEmail)
        .single();

      if (senderError || !sender) {
        return c.json({ success: false, message: "Sender not found" }, 404);
      }

      const { data: existingMatch } = await supabase
        .from('matches')
        .select('*')
        .or(`and(sender_id.eq.${sender.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${sender.id})`)
        .single();

      if (existingMatch) {
        return c.json({ success: false, message: "Match request already exists" }, 400);
      }

      const { data: newMatch, error: createError } = await supabase
        .from('matches')
        .insert({
          sender_id: sender.id,
          receiver_id: targetUserId,
          status: 'pending',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error("Match request creation error:", createError.message);
        return c.json({ success: false, message: "Failed to create match request" }, 500);
      }

      return c.json({ success: true, message: "Match request sent successfully", match: newMatch });
    } catch (err) {
      console.error("❌ Error in sendMatchRequest:", err.message);
      return c.json({ success: false, message: "Server error" }, 500);
    }
  },

  uploadSingleFile: async (c) => {
    let decoded;
    try {
      decoded = getTokenUser(c);
    } catch (err) {
      return c.json({ success: false, message: err.status === 401 ? "Missing token" : "Invalid token" }, 401);
    }

    const rawBody = await c.req.parseBody({ all: true });
    const file = extractFile(rawBody['file']);

    if (!file) {
      return c.json({ success: false, message: "No file provided" }, 400);
    }

    const mimeType = typeof file === 'object' && file.type ? file.type : '';

    try {
      const result = await uploadToCloudinary(file, 'onraiser_uploads', mimeType);
      return c.json({
        success: true,
        url: result.url,
        public_id: result.public_id
      });
    } catch (uploadErr) {
      console.error("Upload error:", uploadErr);
      return c.json({ success: false, message: "Upload failed: " + uploadErr.message }, 500);
    }
  },

  selectPlan: async (c) => {
    let decoded;
    try {
      decoded = getTokenUser(c);
    } catch (err) {
      return c.json({ success: false, message: err.status === 401 ? "Missing token" : "Invalid token" }, 401);
    }

    const { plan } = await c.req.json();

    try {
      const { error } = await supabase
        .from('users')
        .update({
          current_step: 'personal',
          updated_at: new Date().toISOString()
        })
        .eq('email', decoded.email);

      if (error) {
        console.error("selectPlan error:", error);
        return c.json({ success: false, message: error.message }, 500);
      }

      console.log(`✅ Plan selected (${plan || 'free'}) for ${decoded.email} → step: personal`);
      return c.json({ success: true });
    } catch (err) {
      console.error("selectPlan catch:", err.message);
      return c.json({ success: false, message: err.message }, 500);
    }
  }
};
