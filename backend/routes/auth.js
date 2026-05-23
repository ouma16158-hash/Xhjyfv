require("dotenv").config();
const { Hono } = require("hono");
const router = new Hono();
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");
const emailService = require("../services/emailService");
const {
  generateOTP,
  storeOTP,
  verifyOTP,
  checkOTPValidity,
  canSendOTP,
  incrementOTPAttempt,
  resetOTP
} = require("../otpStore");

let _dbClient = null;
const supabase = new Proxy({}, {
  get(_, prop) {
    if (!_dbClient) _dbClient = createClient(process.env.SUPABASE_URL || 'https://placeholder.supabase.co', process.env.ANON_KEY || 'placeholder_key');
    const val = _dbClient[prop];
    return typeof val === 'function' ? val.bind(_dbClient) : val;
  }
});

// ---------- REGISTER: Send OTP ----------
router.post("/send-otp", async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) return c.json({ error: "Missing email or password." }, 400);

  try {
    const { data: existing, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (existing && !error) {
      return c.json({ error: "Account with this email already exists." }, 400);
    }

    const otpCheck = canSendOTP(email, 'register');
    if (!otpCheck.canSend) {
      return c.json({ error: otpCheck.message }, 429);
    }

    incrementOTPAttempt(email, 'register');

    const otp = generateOTP();
    storeOTP(email, otp, 'register');

    console.log(`📧 Attempting to send registration OTP to: ${email} using ${emailService.getServiceType()}`);
    console.log(`🌐 RENDER DEBUG - Platform: ${process.platform}`);
    console.log(`🌐 RENDER DEBUG - Node Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 RENDER DEBUG - Email Service Ready: ${emailService.isServiceReady()}`);

    try {
      await emailService.sendOTP(email, otp);
      console.log(`✅ Registration OTP sent successfully to: ${email}`);
      return c.json({ message: "OTP sent to your email." }, 200);
    } catch (emailError) {
      console.error("📧 Registration OTP sending failed:", emailError);

      console.error("🚨 RENDER DEBUG INFO - Email Service Failure Details:");
      console.error(`   📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.error(`   📍 Email Service Type: ${emailService.getServiceType()}`);
      console.error(`   📍 Target Email: ${email}`);
      console.error(`   📍 Timestamp: ${new Date().toISOString()}`);
      console.error(`   📍 Error Type: ${emailError.constructor.name}`);
      console.error(`   📍 Error Message: ${emailError.message}`);

      if (emailError.stack) {
        console.error(`   📍 Stack Trace: ${emailError.stack}`);
      }

      let errorMessage = "Failed to send OTP. Please check your email address and try again.";

      if (emailError.response && emailError.response.body) {
        const sendGridError = emailError.response.body;
        console.error("📧 RENDER DEBUG - SendGrid Full Response Body:", JSON.stringify(sendGridError, null, 2));
        console.error("📧 RENDER DEBUG - SendGrid Status Code:", emailError.response.statusCode);
        console.error("📧 RENDER DEBUG - SendGrid Headers:", JSON.stringify(emailError.response.headers, null, 2));

        if (sendGridError.errors && sendGridError.errors.length > 0) {
          console.error("📧 RENDER DEBUG - SendGrid Error Array:");
          sendGridError.errors.forEach((err, index) => {
            console.error(`   Error ${index + 1}:`, JSON.stringify(err, null, 2));
          });

          const firstError = sendGridError.errors[0];
          if (firstError.message.includes('does not exist') || firstError.message.includes('invalid')) {
            errorMessage = "Invalid email address. Please check and try again.";
          } else if (firstError.message.includes('rate limit') || firstError.message.includes('quota')) {
            errorMessage = "Too many requests. Please wait a moment and try again.";
          } else if (firstError.message.includes('sender') || firstError.message.includes('verify') || firstError.message.includes('authentication')) {
            console.error("🚨 RENDER CRITICAL: SENDER VERIFICATION ISSUE DETECTED!");
            console.error("💡 ACTION REQUIRED: Verify sender email in SendGrid Dashboard");
            errorMessage = "Email service configuration issue. Please contact support.";
          } else {
            errorMessage = "Email service error. Please try again later.";
          }
        }
      } else if (emailError.code === 'ETIMEDOUT' || emailError.code === 'ECONNECTION') {
        console.error("📧 RENDER DEBUG - SMTP Connection Issue:", emailError.code);
        errorMessage = "Email service temporarily unavailable. Please try again later.";
      } else if (emailError.code === 'EAUTH') {
        console.error("📧 RENDER DEBUG - SMTP Authentication Issue:", emailError.code);
        errorMessage = "Email service authentication failed. Please try again later.";
      } else if (emailError.code >= 400 && emailError.code < 500) {
        console.error("📧 RENDER DEBUG - Client Error (4xx):", emailError.code);
        errorMessage = "Invalid email request. Please check your email and try again.";
      } else if (emailError.code >= 500) {
        console.error("📧 RENDER DEBUG - Server Error (5xx):", emailError.code);
        errorMessage = "Email service temporarily unavailable. Please try again later.";
      }

      console.error("🚨 RENDER DEBUG - Final Error Message Sent to Client:", errorMessage);
      return c.json({ error: errorMessage }, 500);
    }
  } catch (err) {
    console.error("📧 Registration error:", err.message);
    return c.json({ error: "Server error during registration." }, 500);
  }
});

// ---------- VERIFY OTP + Create User ----------
router.post("/verify-otp", async (c) => {
  const { email, otp, password, role } = await c.req.json();
  if (!email || !otp || !password) {
    return c.json({ error: "Missing email, OTP or password." }, 400);
  }

  const valid = verifyOTP(email, otp, 'register');
  if (!valid) {
    return c.json({ error: "Wrong OTP." }, 400);
  }

  resetOTP(email, 'register');

  const userRole = role === 'employer' ? 'employer' : 'seeker';

  try {
    const { data: existing, error: checkError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (existing && !checkError) {
      return c.json({ error: "User already exists." }, 400);
    }

    const { data, error } = await supabase
      .from('users')
      .insert([{
        email: email,
        password: password,
        current_step: 'personal',
        status: 'pending',
        orientation: userRole
      }])
      .select();

    if (error) {
      console.error("Insert error:", error);
      return c.json({ error: "Failed to save user." }, 500);
    }

    return c.json({ message: "User registered successfully." }, 200);
  } catch (err) {
    console.error("Save user error:", err.message);
    return c.json({ error: "Failed to save user." }, 500);
  }
});

// ---------- LOGIN ----------
router.post("/login", async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: "Missing email or password." }, 400);
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) {
      return c.json({ error: "Account does not exist. Please sign up." }, 404);
    }

    if (data.password !== password) {
      return c.json({ error: "Wrong password." }, 401);
    }

    let currentStep = data.current_step;
    if (!currentStep) {
      const { error: updateError } = await supabase
        .from('users')
        .update({ current_step: 'identity' })
        .eq('email', email);

      if (updateError) {
        console.error("Update error:", updateError);
      }
      currentStep = 'identity';
    }

    const userRole = data.orientation === 'employer' ? 'employer' : 'seeker';

    const token = jwt.sign(
      { email: data.email, role: userRole },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    return c.json({
      message: "Login successful.",
      token,
      email: data.email,
      role: userRole,
      current_step: currentStep,
      status: data.status || "pending"
    }, 200);
  } catch (err) {
    console.error("🔥 Login error:", err.message);
    return c.json({ error: "Server error during login." }, 500);
  }
});

// ---------- FORGOT PASSWORD ----------
router.post("/forgot-password", async (c) => {
  const { email } = await c.req.json();

  if (!email || email.trim() === "") {
    return c.json({ error: "Email is required." }, 400);
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) {
      return c.json({ error: "User does not exist. Please sign up." }, 404);
    }

    const otpCheck = canSendOTP(email, 'reset');
    if (!otpCheck.canSend) {
      return c.json({ error: otpCheck.message }, 429);
    }

    incrementOTPAttempt(email, 'reset');

    const otp = generateOTP();
    storeOTP(email, otp, 'reset');

    console.log(`📧 Attempting to send password reset OTP to: ${email} using ${emailService.getServiceType()}`);
    console.log(`🌐 RENDER DEBUG - Platform: ${process.platform}`);
    console.log(`🌐 RENDER DEBUG - Node Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 RENDER DEBUG - Email Service Ready: ${emailService.isServiceReady()}`);

    try {
      await emailService.sendOTP(email, otp, 'reset');
      console.log(`✅ Password reset OTP sent successfully to: ${email}`);
      return c.json({ message: "OTP sent." }, 200);
    } catch (emailError) {
      console.error("📧 Password reset OTP sending failed:", emailError);

      console.error("🚨 RENDER DEBUG INFO - Password Reset Email Failure Details:");
      console.error(`   📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.error(`   📍 Email Service Type: ${emailService.getServiceType()}`);
      console.error(`   📍 Target Email: ${email}`);
      console.error(`   📍 Timestamp: ${new Date().toISOString()}`);
      console.error(`   📍 Error Type: ${emailError.constructor.name}`);
      console.error(`   📍 Error Message: ${emailError.message}`);

      if (emailError.stack) {
        console.error(`   📍 Stack Trace: ${emailError.stack}`);
      }

      let errorMessage = "Failed to send OTP. Please check your email address and try again.";

      if (emailError.response && emailError.response.body) {
        const sendGridError = emailError.response.body;
        console.error("📧 RENDER DEBUG - SendGrid Full Response Body:", JSON.stringify(sendGridError, null, 2));
        console.error("📧 RENDER DEBUG - SendGrid Status Code:", emailError.response.statusCode);
        console.error("📧 RENDER DEBUG - SendGrid Headers:", JSON.stringify(emailError.response.headers, null, 2));

        if (sendGridError.errors && sendGridError.errors.length > 0) {
          console.error("📧 RENDER DEBUG - SendGrid Error Array:");
          sendGridError.errors.forEach((err, index) => {
            console.error(`   Error ${index + 1}:`, JSON.stringify(err, null, 2));
          });

          const firstError = sendGridError.errors[0];
          if (firstError.message.includes('does not exist') || firstError.message.includes('invalid')) {
            errorMessage = "Invalid email address. Please check and try again.";
          } else if (firstError.message.includes('rate limit') || firstError.message.includes('quota')) {
            errorMessage = "Too many requests. Please wait a moment and try again.";
          } else if (firstError.message.includes('sender') || firstError.message.includes('verify') || firstError.message.includes('authentication')) {
            console.error("🚨 RENDER CRITICAL: SENDER VERIFICATION ISSUE DETECTED!");
            console.error("💡 ACTION REQUIRED: Verify sender email in SendGrid Dashboard");
            errorMessage = "Email service configuration issue. Please contact support.";
          } else {
            errorMessage = "Email service error. Please try again later.";
          }
        }
      } else if (emailError.code === 'ETIMEDOUT' || emailError.code === 'ECONNECTION') {
        console.error("📧 RENDER DEBUG - SMTP Connection Issue:", emailError.code);
        errorMessage = "Email service temporarily unavailable. Please try again later.";
      } else if (emailError.code === 'EAUTH') {
        console.error("📧 RENDER DEBUG - SMTP Authentication Issue:", emailError.code);
        errorMessage = "Email service authentication failed. Please try again later.";
      } else if (emailError.code >= 400 && emailError.code < 500) {
        console.error("📧 RENDER DEBUG - Client Error (4xx):", emailError.code);
        errorMessage = "Invalid email request. Please check your email and try again.";
      } else if (emailError.code >= 500) {
        console.error("📧 RENDER DEBUG - Server Error (5xx):", emailError.code);
        errorMessage = "Email service temporarily unavailable. Please try again later.";
      }

      console.error("🚨 RENDER DEBUG - Final Error Message Sent to Client:", errorMessage);
      return c.json({ error: errorMessage }, 500);
    }
  } catch (err) {
    console.error("📧 Password reset error:", err.message);
    return c.json({ error: "Server error during password reset." }, 500);
  }
});

// ---------- VERIFY RESET OTP ----------
router.post("/verify-reset-otp", async (c) => {
  try {
    const { email, otp } = await c.req.json();

    if (!email || !otp) {
      return c.json({ error: "Missing email or OTP." }, 400);
    }

    const isValid = checkOTPValidity(email, otp, 'reset');
    if (!isValid) {
      return c.json({ error: "Wrong OTP." }, 400);
    }

    return c.json({ message: "OTP verified." }, 200);
  } catch (error) {
    console.error("Verify reset OTP error:", error);
    return c.json({ error: "Server error during OTP verification." }, 500);
  }
});

// ---------- RESET PASSWORD ----------
router.post("/reset-password", async (c) => {
  const { email, otp, newPassword } = await c.req.json();

  if (!email || !otp || !newPassword) {
    return c.json({
      success: false,
      message: "Email, OTP, and new password are required"
    }, 400);
  }

  try {
    const isValid = verifyOTP(email, otp, 'reset');
    if (!isValid) {
      return c.json({
        success: false,
        message: "Invalid or expired reset link. Please request a new password reset."
      }, 400);
    }

    const { error } = await supabase
      .from('users')
      .update({ password: newPassword })
      .eq('email', email);

    if (error) {
      console.error("Password update error:", error);
      return c.json({
        success: false,
        message: "Failed to update password"
      }, 500);
    }

    resetOTP(email, 'reset');

    console.log("✅ Password reset successfully for:", email);
    return c.json({
      success: true,
      message: "Password updated successfully"
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return c.json({
      success: false,
      message: "Server error"
    }, 500);
  }
});

// Verify reset token route
router.get("/verify-reset-token", async (c) => {
  const email = c.req.query('email');
  const otp = c.req.query('otp');

  console.log("🔍 Verify reset token request:", { email, otp });

  if (!email || !otp) {
    console.log("❌ Missing email or OTP in query params");
    return c.json({
      success: false,
      message: "Invalid reset link"
    }, 400);
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single();

    if (error || !user) {
      return c.json({
        success: false,
        message: "Invalid reset link"
      }, 400);
    }

    const isValid = checkOTPValidity(email, otp, 'reset');
    console.log("🔍 OTP validity check result:", { email, otp, isValid });

    if (!isValid) {
      console.log("❌ OTP validation failed for reset token verification");
      return c.json({
        success: false,
        message: "Invalid or expired reset link"
      }, 400);
    }

    return c.json({
      success: true,
      message: "Valid reset token"
    });
  } catch (error) {
    console.error("Verify reset token error:", error);
    return c.json({
      success: false,
      message: "Server error"
    }, 500);
  }
});

// ---------- USER PROGRESS ----------
router.get("/user/progress", async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json({ error: "Missing token" }, 401);
  }

  const token = authHeader.split(" ")[1];
  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("🔐 User progress request for:", decoded.email);
  } catch (err) {
    console.error("❌ Token verification failed:", err.message);
    return c.json({ error: "Invalid token" }, 401);
  }

  const email = decoded.email;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('current_step, status, orientation')
      .eq('email', email)
      .single();

    if (error || !data) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({
      current_step: data.current_step || "identity",
      status: data.status || "pending",
      orientation: data.orientation || "seeker"
    }, 200);
  } catch (err) {
    console.error("🔥 Progress fetch error:", err.message);
    return c.json({ error: "Server error" }, 500);
  }
});

// ---------- GOOGLE AUTH CONFIG ----------
router.get("/auth/google-config", (c) => {
  return c.json({ clientId: process.env.GOOGLE_CLIENT_ID || null });
});

// ---------- GOOGLE SIGN-IN / SIGN-UP ----------
router.post("/auth/google", async (c) => {
  const { credential, role } = await c.req.json();
  if (!credential) return c.json({ error: "Missing Google credential" }, 400);

  try {
    const gRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    const gUser = await gRes.json();

    if (gUser.error || !gUser.email) {
      return c.json({ error: "Invalid Google token. Please try again." }, 400);
    }

    const email = gUser.email;

    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (existing) {
      const userRole = existing.orientation === 'employer' ? 'employer' : 'seeker';
      const token = jwt.sign({ email: existing.email, role: userRole }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return c.json({
        token,
        email: existing.email,
        role: userRole,
        current_step: existing.current_step || 'personal',
        status: existing.status || 'pending',
        isNew: false
      });
    }

    const userRole = role === 'employer' ? 'employer' : 'seeker';
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{
        email,
        full_name: gUser.name || email.split('@')[0],
        orientation: userRole,
        status: 'pending',
        current_step: 'personal',
        is_complete: false
      }])
      .select()
      .single();

    if (insertError) {
      console.error("Google register insert error:", insertError);
      return c.json({ error: "Failed to create account. Please try again." }, 500);
    }

    const token = jwt.sign({ email: newUser.email, role: userRole }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return c.json({
      token,
      email: newUser.email,
      role: userRole,
      current_step: 'personal',
      status: 'pending',
      isNew: true
    });
  } catch (err) {
    console.error("Google auth error:", err);
    return c.json({ error: "Google authentication failed. Please try again." }, 500);
  }
});

module.exports = router;
