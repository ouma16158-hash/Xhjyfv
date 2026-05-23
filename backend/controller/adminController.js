const { createClient } = require("@supabase/supabase-js");
const jwt = require("jsonwebtoken");
const emailService = require("../services/emailService");

let _dbClient = null;
const supabase = new Proxy({}, {
  get(_, prop) {
    if (!_dbClient) _dbClient = createClient(process.env.SUPABASE_URL || 'https://placeholder.supabase.co', process.env.ANON_KEY || 'placeholder_key');
    const val = _dbClient[prop];
    return typeof val === 'function' ? val.bind(_dbClient) : val;
  }
});


exports.adminLogin = async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json({ success: false, message: "Email and password required" }, 400);
  }

  try {
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) {
      return c.json({ success: false, message: "Invalid credentials" }, 401);
    }

    const bcrypt = require("bcrypt");
    const passwordMatch = await bcrypt.compare(password, data.password_hash);

    if (!passwordMatch) {
      return c.json({ success: false, message: "Invalid credentials" }, 401);
    }

    const token = jwt.sign({ email: data.email, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '24h' });

    return c.json({
      success: true,
      token,
      admin: { email: data.email }
    });
  } catch (err) {
    console.error("Admin login error:", err.message);
    return c.json({ success: false, message: "Server error" }, 500);
  }
};

exports.getAllUsers = async (c) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Get users error:", error.message);
      return c.json({ success: false, message: "Server error" }, 500);
    }

    return c.json({ success: true, users: data });
  } catch (err) {
    console.error("Get users error:", err.message);
    return c.json({ success: false, message: "Server error" }, 500);
  }
};

exports.updateUserStatus = async (c) => {
  const { userId, status, adminMessage } = await c.req.json();

  if (!userId || !status) {
    return c.json({ success: false, message: "User ID and status required" }, 400);
  }

  try {
    let updateData = {
      status: status,
      admin_message: adminMessage || null,
      updated_at: new Date().toISOString()
    };

    if (status === "approved") {
      updateData.current_step = "dashboard";
    } else if (status === "disapproved") {
      updateData.current_step = "submission";
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select();

    if (error) {
      console.error("Update status error:", error.message);
      return c.json({ success: false, message: "Server error" }, 500);
    }

    if (!data || data.length === 0) {
      return c.json({ success: false, message: "User not found" }, 404);
    }

    const user = data[0];
    if (user.email) {
      try {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(user.email)) {
          console.error(`❌ Invalid email format: ${user.email}`);
          return c.json({ success: true, message: "User status updated successfully (email invalid)" });
        }

        console.log(`📧 Attempting to send status update email to: ${user.email} using ${emailService.getServiceType()}`);

        if (emailService.isServiceReady()) {
          await emailService.sendStatusUpdateEmail(user.email, status, adminMessage);
          console.log(`✅ Status update email sent successfully to: ${user.email} (Status: ${status})`);
        } else {
          console.warn(`📧 Email service not ready. Email not sent to ${user.email}`);
        }
      } catch (emailError) {
        console.error("📧 Status update email sending failed:", emailError);
        console.error("🚨 RENDER DEBUG INFO - Admin Email Failure Details:");
        console.error(`   📍 Email Service Type: ${emailService.getServiceType()}`);
        console.error(`   📍 Target Email: ${user.email}`);
        console.error(`   📍 Status: ${status}`);
        console.error(`   📍 Admin Message: ${adminMessage || 'N/A'}`);
        console.error(`   📍 Error Type: ${emailError.constructor.name}`);
        console.error(`   📍 Error Message: ${emailError.message}`);

        if (emailError.response && emailError.response.body) {
          console.error("📧 RENDER DEBUG - SendGrid Admin Email Error:", JSON.stringify(emailError.response.body, null, 2));
        }
      }
    }

    return c.json({ success: true, message: "User status updated successfully" });
  } catch (err) {
    console.error("Update status error:", err.message);
    return c.json({ success: false, message: "Server error" }, 500);
  }
};

exports.getUserById = async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(" ")[1];

    if (!token) {
      return c.json({ success: false, message: "Missing token" }, 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== 'admin') {
      return c.json({ success: false, message: "Admin access required" }, 403);
    }

    const userId = c.req.param('id');

    if (!userId) {
      return c.json({ success: false, message: "User ID is required" }, 400);
    }

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error("Get user error:", error.message);
      return c.json({ success: false, message: error.message }, 500);
    }

    if (!data || error?.code === 'PGRST116') {
      return c.json({ success: false, message: "User not found" }, 404);
    }

    return c.json({ success: true, user: data });
  } catch (err) {
    console.error("Get user error:", err.message);
    if (err.name === 'JsonWebTokenError') {
      return c.json({ success: false, message: "Invalid token" }, 401);
    }
    return c.json({ success: false, message: "Server error" }, 500);
  }
};

exports.grantPremiumAccess = async (c) => {
  try {
    const { email, days = 30 } = await c.req.json();

    if (!email) {
      return c.json({ success: false, message: "Email is required" }, 400);
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single();

    if (userError || !user) {
      return c.json({ success: false, message: "User not found" }, 404);
    }

    const newEndDate = new Date();
    newEndDate.setDate(newEndDate.getDate() + parseInt(days));
    const now = new Date().toISOString();
    const endDateStr = newEndDate.toISOString();

    const { data: existingSubscription, error: findError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    console.log(`[Grant Premium] user_id=${user.id}, existingRow=`, existingSubscription, 'findError=', findError);

    if (existingSubscription) {
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({
          plan: 'premium',
          status: 'active',
          start_date: now,
          end_date: endDateStr
        })
        .eq('id', existingSubscription.id);

      if (updateError) {
        console.error('[Grant Premium] UPDATE failed:', updateError);
        return c.json({ success: false, message: 'Failed to update subscription: ' + updateError.message }, 500);
      }
      console.log('[Grant Premium] Subscription updated successfully');
    } else {
      const insertPayload = {
        user_id: user.id,
        user_email: user.email,
        plan: 'premium',
        status: 'active',
        start_date: now,
        end_date: endDateStr,
        payment_method: 'admin_grant',
        amount_paid: 0,
        currency: 'USD'
      };
      const { error: insertError } = await supabase
        .from('subscriptions')
        .insert(insertPayload);

      if (insertError) {
        console.error('[Grant Premium] INSERT failed:', insertError, 'payload:', insertPayload);
        return c.json({ success: false, message: 'Failed to create subscription: ' + insertError.message }, 500);
      }
      console.log('[Grant Premium] Subscription inserted successfully');
    }

    const { error: userUpdateError } = await supabase
      .from('users')
      .update({ subscription: 'premium' })
      .eq('id', user.id);

    if (userUpdateError) {
      return c.json({ success: false, message: userUpdateError.message }, 500);
    }

    return c.json({
      success: true,
      message: `Premium access granted to ${email} for ${days} days`
    });

  } catch (error) {
    console.error("Grant premium access error:", error);
    return c.json({ success: false, message: "Server error" }, 500);
  }
};

exports.removePremiumAccess = async (c) => {
  try {
    const { email } = await c.req.json();

    if (!email) {
      return c.json({ success: false, message: "Email is required" }, 400);
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single();

    if (userError || !user) {
      return c.json({ success: false, message: "User not found" }, 404);
    }

    const { error: subError } = await supabase
      .from('subscriptions')
      .update({
        status: 'cancelled',
        end_date: new Date().toISOString()
      })
      .eq('user_id', user.id);

    if (subError) {
      return c.json({ success: false, message: subError.message }, 500);
    }

    const { error: userUpdateError } = await supabase
      .from('users')
      .update({ subscription: 'free' })
      .eq('id', user.id);

    if (userUpdateError) {
      return c.json({ success: false, message: userUpdateError.message }, 500);
    }

    return c.json({
      success: true,
      message: `Premium access removed from ${email}`
    });

  } catch (error) {
    console.error("Remove premium access error:", error);
    return c.json({ success: false, message: "Server error" }, 500);
  }
};

// ── Suspend User ──
exports.suspendUser = async (c) => {
  try {
    const userId = c.req.param('id');
    const { reason } = await c.req.json().catch(() => ({ reason: '' }));

    const { data: user, error: findErr } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('id', userId)
      .single();

    if (findErr || !user) {
      return c.json({ success: false, message: 'User not found' }, 404);
    }

    const { error } = await supabase
      .from('users')
      .update({ status: 'suspended', admin_message: reason || 'Your account has been suspended.' })
      .eq('id', userId);

    if (error) return c.json({ success: false, message: error.message }, 500);

    if (user.email && emailService.isServiceReady()) {
      const name = (Array.isArray(user.full_name) ? user.full_name[0] : user.full_name) || 'User';
      const html = `
        <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:12px;">
          <h2 style="color:#c0392b;">Account Suspended</h2>
          <p>Hi ${name},</p>
          <p>Your Onraiser account has been <strong>suspended</strong>.</p>
          ${reason ? `<div style="background:#fff3f3;border-left:4px solid #e74c3c;padding:14px;border-radius:6px;margin:16px 0;">${reason.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>` : ''}
          <p>If you believe this is a mistake, please contact our support team at <a href="mailto:onraiser3889@gmail.com">onraiser3889@gmail.com</a>.</p>
          <p style="color:#888;font-size:0.85rem;margin-top:24px;">— The Onraiser Team</p>
        </div>`;
      try { await emailService.sendWithSendGrid(user.email, 'Your Onraiser Account Has Been Suspended', html); } catch(e) { console.error('Suspend email error:', e.message); }
    }

    return c.json({ success: true, message: 'User suspended successfully' });
  } catch (err) {
    console.error('Suspend user error:', err.message);
    return c.json({ success: false, message: 'Server error' }, 500);
  }
};

// ── Restore (Unsuspend) User ──
exports.restoreUser = async (c) => {
  try {
    const userId = c.req.param('id');

    const { data: user, error: findErr } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('id', userId)
      .single();

    if (findErr || !user) {
      return c.json({ success: false, message: 'User not found' }, 404);
    }

    const { error } = await supabase
      .from('users')
      .update({ status: 'approved', admin_message: null })
      .eq('id', userId);

    if (error) return c.json({ success: false, message: error.message }, 500);

    if (user.email && emailService.isServiceReady()) {
      const name = (Array.isArray(user.full_name) ? user.full_name[0] : user.full_name) || 'User';
      const html = `
        <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:12px;">
          <h2 style="color:#00b894;">Account Restored</h2>
          <p>Hi ${name},</p>
          <p>Good news — your Onraiser account has been <strong>restored</strong> and you can now log in again.</p>
          <p>If you have any questions, contact us at <a href="mailto:onraiser3889@gmail.com">onraiser3889@gmail.com</a>.</p>
          <p style="color:#888;font-size:0.85rem;margin-top:24px;">— The Onraiser Team</p>
        </div>`;
      try { await emailService.sendWithSendGrid(user.email, 'Your Onraiser Account Has Been Restored', html); } catch(e) { console.error('Restore email error:', e.message); }
    }

    return c.json({ success: true, message: 'User restored successfully' });
  } catch (err) {
    console.error('Restore user error:', err.message);
    return c.json({ success: false, message: 'Server error' }, 500);
  }
};

// ── Delete User (full purge) ──
exports.deleteUser = async (c) => {
  try {
    const userId = c.req.param('id');

    const { data: user, error: findErr } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('id', userId)
      .single();

    if (findErr || !user) {
      return c.json({ success: false, message: 'User not found' }, 404);
    }

    const userEmail = user.email;
    const name = (Array.isArray(user.full_name) ? user.full_name[0] : user.full_name) || 'User';

    // Send deletion email before purging
    if (userEmail && emailService.isServiceReady()) {
      const html = `
        <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:12px;">
          <h2 style="color:#e74c3c;">Account Deleted</h2>
          <p>Hi ${name},</p>
          <p>Your Onraiser account and all associated data have been <strong>permanently deleted</strong> from our platform.</p>
          <p>If you did not request this or believe this is an error, please contact us immediately at <a href="mailto:onraiser3889@gmail.com">onraiser3889@gmail.com</a>.</p>
          <p style="color:#888;font-size:0.85rem;margin-top:24px;">— The Onraiser Team</p>
        </div>`;
      try { await emailService.sendWithSendGrid(userEmail, 'Your Onraiser Account Has Been Deleted', html); } catch(e) { console.error('Delete email error:', e.message); }
    }

    // Purge related data
    await supabase.from('subscriptions').delete().eq('user_id', userId);
    await supabase.from('pending_premium_subscriptions').delete().eq('user_email', userEmail);
    await supabase.from('job_applications').delete().eq('seeker_id', userId);
    await supabase.from('job_posts').delete().eq('company_id', userId);
    await supabase.from('user_interactions').delete().or(`current_user_id.eq.${userId},target_user_id.eq.${userId}`);
    await supabase.from('messages').delete().or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
    await supabase.from('pending_media_updates').delete().eq('user_email', userEmail);

    // Finally delete the user
    const { error: delErr } = await supabase.from('users').delete().eq('id', userId);
    if (delErr) return c.json({ success: false, message: delErr.message }, 500);

    return c.json({ success: true, message: 'User and all associated data deleted' });
  } catch (err) {
    console.error('Delete user error:', err.message);
    return c.json({ success: false, message: 'Server error' }, 500);
  }
};
