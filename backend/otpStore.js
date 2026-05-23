// otpStore.js

const otpMap = new Map(); // Stores OTP and metadata in memory

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const OTP_LIMIT = 3; // Max resend attempts
const OTP_LOCK_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit string
}

function storeOTP(email, otp, type = 'register') {
  const now = Date.now();
  const key = `${email}_${type}`;
  const existing = otpMap.get(key);

  console.log(`💾 Storing OTP - Key: ${key}, OTP: "${otp}" (type: ${typeof otp})`);
  console.log(`💾 Current map size before store: ${otpMap.size}`);

  const newEntry = {
    otp,
    createdAt: now,
    attempts: existing ? existing.attempts : 0,
    lastSent: now,
    lockedUntil: existing ? existing.lockedUntil : null,
    type
  };

  otpMap.set(key, newEntry);
  
  console.log(`✅ OTP stored successfully for ${email}`);
  console.log(`💾 Current map size after store: ${otpMap.size}`);
  console.log(`💾 Stored entry:`, newEntry);
}

function verifyOTP(email, inputOtp, type = 'register') {
  const key = `${email}_${type}`;
  const entry = otpMap.get(key);
  
  console.log(`🔍 VerifyOTP - Key: ${key}, Entry:`, entry);
  console.log(`🔍 Input OTP: "${inputOtp}" (type: ${typeof inputOtp})`);
  
  if (!entry) {
    console.log(`❌ No OTP entry found for key: ${key}`);
    return false;
  }

  const now = Date.now();
  const ageMs = now - entry.createdAt;

  // Check expired
  if (ageMs > OTP_EXPIRY_MS) {
    console.log(`❌ OTP expired for ${email}`);
    return false;
  }

  // Check match
  const stored = entry.otp;
  const match = stored === inputOtp;
  console.log(`🔍 Stored OTP: "${stored}" (type: ${typeof stored})`);
  console.log(`🔍 OTP Match: ${match}`);
  
  return match;
}

function checkOTPValidity(email, inputOtp, type = 'register') {
  const key = `${email}_${type}`;
  const entry = otpMap.get(key);
  
  console.log(`🔍 CheckOTPValidity - Key: ${key}, Entry:`, entry);
  console.log(`🔍 Input OTP: "${inputOtp}" (type: ${typeof inputOtp})`);
  
  if (!entry) {
    console.log(`❌ No OTP entry found for key: ${key}`);
    return false;
  }

  const now = Date.now();
  const ageMs = now - entry.createdAt;
  console.log(`🔍 OTP age: ${ageMs}ms, Expiry limit: ${OTP_EXPIRY_MS}ms`);

  // Check expired
  if (ageMs > OTP_EXPIRY_MS) {
    console.log(`❌ OTP expired for ${email}`);
    return false;
  }

  // Check match
  const stored = entry.otp;
  const match = stored === inputOtp;
  console.log(`🔍 Stored OTP: "${stored}" (type: ${typeof stored})`);
  console.log(`🔍 OTP Match: ${match}`);
  
  return match;
}

function canSendOTP(email, type = 'register') {
  const key = `${email}_${type}`;
  let entry = otpMap.get(key);

  // If no entry exists, create one with 0 attempts
  if (!entry) {
    entry = {
      attempts: 0,
      lockedUntil: null,
      type
    };
    otpMap.set(key, entry);
    return { canSend: true, message: null };
  }

  const now = Date.now();

  // Check if user is locked due to too many attempts
  if (entry.lockedUntil && now < entry.lockedUntil) {
    const hoursLeft = Math.ceil((entry.lockedUntil - now) / (1000 * 60 * 60));
    return { 
      canSend: false, 
      message: `You have reached the maximum number of OTP resend attempts. Try again after ${hoursLeft} hours and check the spam folder.` 
    };
  }

  // Check if user has reached the limit
  if (entry.attempts >= OTP_LIMIT) {
    entry.lockedUntil = now + OTP_LOCK_MS;
    return { 
      canSend: false, 
      message: "You have reached the maximum number of OTP resend attempts. Try again after 24 hours and check the spam folder." 
    };
  }

  return { canSend: true, message: null };
}

function incrementOTPAttempt(email, type = 'register') {
  const key = `${email}_${type}`;
  const entry = otpMap.get(key);
  if (entry) {
    entry.attempts = (entry.attempts || 0) + 1;
  }
}

function resetOTP(email, type = 'register') {
  const key = `${email}_${type}`;
  otpMap.delete(key);
}

module.exports = {
  generateOTP,
  storeOTP,
  verifyOTP,
  checkOTPValidity,
  canSendOTP,
  incrementOTPAttempt,
  resetOTP
};
