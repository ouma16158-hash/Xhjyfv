require("dotenv").config();
const { Hono } = require("hono");
const router = new Hono();
const jwt = require("jsonwebtoken");
const cloudinary = require("cloudinary").v2;
const { createClient } = require("@supabase/supabase-js");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

let _dbClient = null;
const supabase = new Proxy({}, {
  get(_, prop) {
    if (!_dbClient) _dbClient = createClient(process.env.SUPABASE_URL || 'https://placeholder.supabase.co', process.env.ANON_KEY || 'placeholder_key');
    const val = _dbClient[prop];
    return typeof val === 'function' ? val.bind(_dbClient) : val;
  }
});

async function uploadBufferToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: `onraiser/${folder}`, resource_type: "auto" },
      (error, result) => {
        if (error) reject(error);
        else resolve({ url: result.secure_url, public_id: result.public_id });
      }
    ).end(buffer);
  });
}

async function testSupabaseConnection() {
  try {
    const { data, error } = await supabase.from('users').select('id').limit(1);
    if (error) {
      console.error("❌ Supabase connection test failed:", error.message);
      return false;
    }
    console.log("✅ Supabase connection successful");
    return true;
  } catch (err) {
    console.error("❌ Supabase connection error:", err.message);
    return false;
  }
}

router.post("/upload-identity", async (c) => {
  console.log("📦 Incoming /api/upload-identity request...");

  const connectionTest = await testSupabaseConnection();
  if (!connectionTest) {
    return c.json({
      success: false,
      message: "Database connection failed. Please check your Supabase configuration."
    }, 500);
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json({ success: false, message: "Missing token" }, 401);
  }

  const token = authHeader.split(" ")[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("🔐 Authenticated:", decoded.email);
  } catch (err) {
    console.error("❌ Token verification failed:", err.message);
    return c.json({ success: false, message: "Invalid token" }, 401);
  }

  const userEmail = decoded.email;

  const body = await c.req.parseBody({ all: true });

  // Extract files — each may be a File object or array of File objects
  function extractFile(val) {
    if (!val) return null;
    if (Array.isArray(val)) return val.length > 0 ? val[0] : null;
    return val;
  }

  const idFrontFile = extractFile(body['idFront']);
  const idBackFile = extractFile(body['idBack']);
  const videoFile = extractFile(body['video']);
  const livenessInstructions = body['livenessInstructions'];

  if (!idFrontFile && !idBackFile && !videoFile) {
    return c.json({ success: false, message: "Missing identity files." }, 400);
  }

  try {
    let idFrontUrl = null;
    let idBackUrl = null;
    let livenessVideoUrl = null;
    let idFrontPublicId = null;
    let idBackPublicId = null;
    let livenessPublicId = null;

    if (idFrontFile) {
      const buffer = Buffer.from(await idFrontFile.arrayBuffer());
      const result = await uploadBufferToCloudinary(buffer, "identity_front");
      idFrontUrl = result.url;
      idFrontPublicId = result.public_id;
    }

    if (idBackFile) {
      const buffer = Buffer.from(await idBackFile.arrayBuffer());
      const result = await uploadBufferToCloudinary(buffer, "identity_back");
      idBackUrl = result.url;
      idBackPublicId = result.public_id;
    }

    if (videoFile) {
      const buffer = Buffer.from(await videoFile.arrayBuffer());
      const result = await uploadBufferToCloudinary(buffer, "liveness_video");
      livenessVideoUrl = result.url;
      livenessPublicId = result.public_id;
    }

    const updateData = {
      current_step: 'personal',
      id_front_url: idFrontUrl,
      id_back_url: idBackUrl,
      liveness_video_url: livenessVideoUrl,
      id_front_public_id: idFrontPublicId,
      id_back_public_id: idBackPublicId,
      liveness_public_id: livenessPublicId
    };

    if (livenessInstructions) {
      try {
        updateData.liveness_instructions = JSON.parse(livenessInstructions);
      } catch (e) {
        updateData.liveness_instructions = livenessInstructions;
      }
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('email', userEmail)
      .select();

    if (error) {
      console.error("❌ Database update error:", error);
      throw new Error(`Database update failed: ${error.message}`);
    }

    console.log("✅ Database update successful for:", userEmail);
    return c.json({
      success: true,
      message: "Identity uploaded and user record updated successfully.",
      data: data,
    }, 200);
  } catch (err) {
    console.error("❌ Identity upload failed:", err.message);
    return c.json({ success: false, message: err.message }, 500);
  }
});

module.exports = router;
