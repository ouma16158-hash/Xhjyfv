const { Hono } = require('hono');
const router = new Hono();
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const {
  getUserProgress,
  resetUserSubmission,
  resetIdentityOnly,
  resetPersonalOnly,
  savePersonalInfo,
  savePreferences,
  getCurrentPreferences,
  updatePreferences,
  getUserProfilePhoto,
  updateMedia,
  setMediaUpdateTimestamp,
  uploadSingleFile
} = require("../controller/userController");

let _dbClient = null;
const supabase = new Proxy({}, {
  get(_, prop) {
    if (!_dbClient) _dbClient = createClient(process.env.SUPABASE_URL || 'https://placeholder.supabase.co', process.env.ANON_KEY || 'placeholder_key');
    const val = _dbClient[prop];
    return typeof val === 'function' ? val.bind(_dbClient) : val;
  }
});

function getToken(c) {
  return c.req.header('Authorization')?.split(" ")[1] || null;
}

router.get("/progress", getUserProgress);

router.get("/profile", async (c) => {
  try {
    const token = getToken(c);
    if (!token) return c.json({ success: false, message: "Unauthorized" }, 401);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, full_name, orientation, status, subscription, smoking, current_step, created_at")
      .eq("email", decoded.email)
      .single();
    if (error || !user) return c.json({ success: false, message: "User not found" }, 404);
    return c.json({ success: true, user });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

router.post("/select-plan", require("../controller/userController").selectPlan);
router.post("/reset-submission", resetUserSubmission);
router.post("/reset-identity", resetIdentityOnly);
router.post("/reset-personal", resetPersonalOnly);
router.post("/upload-file", uploadSingleFile);
router.post("/personal", savePersonalInfo);
router.post("/preferences", savePreferences);
router.get("/current-preferences", getCurrentPreferences);
router.put("/update-preferences", updatePreferences);
router.get("/profile-photo/:email", getUserProfilePhoto);
router.post("/update-media", updateMedia);
router.put("/set-media-update-timestamp", setMediaUpdateTimestamp);

router.delete("/delete-account", async (c) => {
  try {
    const token = getToken(c);
    if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    const { data: user, error: findErr } = await supabase
      .from('users').select('id').eq('email', email).single();
    if (findErr || !user) return c.json({ success: false, message: 'User not found' }, 404);
    const userId = user.id;

    await supabase.from('subscriptions').delete().eq('user_id', userId);
    await supabase.from('pending_premium_subscriptions').delete().eq('user_email', email);
    await supabase.from('job_applications').delete().eq('seeker_id', userId);
    await supabase.from('job_posts').delete().eq('company_id', userId);
    await supabase.from('user_interactions').delete().or(`current_user_id.eq.${userId},target_user_id.eq.${userId}`);
    await supabase.from('messages').delete().or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
    await supabase.from('pending_media_updates').delete().eq('user_email', email);

    const { error: delErr } = await supabase.from('users').delete().eq('id', userId);
    if (delErr) return c.json({ success: false, message: delErr.message }, 500);

    return c.json({ success: true, message: 'Account deleted successfully' });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

router.get("/subscription-status", async (c) => {
  try {
    const token = getToken(c);
    if (!token) return c.json({ subscription: 'free' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      console.error('JWT verification failed in subscription-status:', jwtError.message);
      return c.json({ subscription: 'free' });
    }
    const email = decoded.email;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, subscription')
      .eq('email', email)
      .single();

    if (userError || !user) return c.json({ subscription: 'free' });

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gte('end_date', new Date().toISOString())
      .single();

    if (subscription) {
      const planType = ['premium', 'weekly', 'monthly', 'yearly'].includes(subscription.plan) ? 'premium' : 'free';
      await supabase.from('users').update({ subscription: planType }).eq('id', user.id);
      return c.json({ subscription: planType });
    } else {
      await supabase.from('users').update({ subscription: 'free' }).eq('id', user.id);
      return c.json({ subscription: 'free' });
    }
  } catch (error) {
    console.error('Subscription check error:', error);
    return c.json({ subscription: 'free' });
  }
});

router.get("/pending-subscription", async (c) => {
  try {
    const token = getToken(c);
    if (!token) return c.json({ pending: false });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return c.json({ pending: false });
    }

    const { data } = await supabase
      .from('pending_premium_subscriptions')
      .select('id, plan, status, created_at')
      .eq('user_email', decoded.email)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data ? c.json({ pending: true, plan: data.plan }) : c.json({ pending: false });
  } catch (error) {
    console.error('Pending subscription check error:', error);
    return c.json({ pending: false });
  }
});

router.get("/conversations", async (c) => {
  try {
    const token = getToken(c);
    if (!token) return c.json([]);

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      console.error('JWT verification failed in conversations:', jwtError.message);
      return c.json([]);
    }
    const email = decoded.email;

    const { data: currentUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (userError || !currentUser) return c.json([]);

    const currentUserId = currentUser.id;

    const { data: acceptedByCurrentUser, error: acceptedError } = await supabase
      .from('user_interactions')
      .select(`
        target_user_id,
        users!user_interactions_target_user_id_fkey(id, full_name, profile_photo_url)
      `)
      .eq('current_user_id', currentUserId)
      .eq('action', 'accepted');

    if (acceptedError) {
      console.error('Error fetching accepted matches:', acceptedError);
      return c.json([]);
    }

    const conversations = [];
    for (const match of acceptedByCurrentUser) {
      const { data: reverseMatch, error: reverseError } = await supabase
        .from('user_interactions')
        .select('id')
        .eq('current_user_id', match.target_user_id)
        .eq('target_user_id', currentUserId)
        .eq('action', 'accepted')
        .single();

      if (!reverseError && reverseMatch) {
        const user = match.users;

        const { data: messages } = await supabase
          .from('messages')
          .select('*')
          .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${user.id}),and(sender_id.eq.${user.id},receiver_id.eq.${currentUserId})`)
          .order('sent_at', { ascending: false })
          .limit(1);

        let lastMessage = 'Start a conversation...';
        if (messages && messages.length > 0) lastMessage = messages[0].message;

        const { data: unreadMessages } = await supabase
          .from('messages')
          .select('id')
          .eq('sender_id', user.id)
          .eq('receiver_id', currentUserId)
          .eq('read', false);

        conversations.push({
          user_id: user.id,
          user_name: user.full_name,
          profile_photo_url: user.profile_photo_url,
          last_message: lastMessage,
          last_message_time: messages && messages.length > 0 ? messages[0].sent_at : null,
          unread_count: unreadMessages ? unreadMessages.length : 0
        });
      }
    }

    return c.json(conversations);
  } catch (error) {
    console.error('Conversations error:', error);
    return c.json([]);
  }
});

router.get("/payment-status", async (c) => {
  try {
    const token = getToken(c);
    if (!token) return c.json({ pending: false });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      console.error('JWT verification failed in payment-status:', jwtError.message);
      return c.json({ pending: false });
    }
    const email = decoded.email;

    const { data: pendingPayments } = await supabase
      .from('payment_approvals')
      .select('*')
      .eq('user_email', email)
      .eq('status', 'pending')
      .or('status.eq.approved,status.eq.disapproved')
      .not('admin_message', 'is', null);

    if (pendingPayments && pendingPayments.length > 0) {
      const payment = pendingPayments[0];
      return c.json({
        pending: true,
        status: payment.status,
        admin_message: payment.admin_message
      });
    } else {
      return c.json({ pending: false });
    }
  } catch (error) {
    console.error('Payment status check error:', error);
    return c.json({ pending: false });
  }
});

router.post("/clear-message", async (c) => {
  try {
    const token = getToken(c);
    if (!token) return c.json({ success: false }, 401);

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      console.error('JWT verification failed in clear-message:', jwtError.message);
      return c.json({ success: false }, 401);
    }
    const email = decoded.email;

    await supabase
      .from('payment_approvals')
      .update({ admin_message: null })
      .eq('user_email', email);

    return c.json({ success: true });
  } catch (error) {
    console.error('Clear message error:', error);
    return c.json({ success: false });
  }
});

router.put("/profile", async (c) => {
  try {
    const token = getToken(c);
    if (!token) return c.json({ success: false, message: "Missing token" }, 401);

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return c.json({ success: false, message: "Invalid token" }, 401);
    }

    const { data: user, error: userErr } = await supabase
      .from("users").select("id, orientation").eq("email", decoded.email).single();
    if (userErr || !user) return c.json({ success: false, message: "User not found" }, 404);

    const b = await c.req.json();
    const allowed = [
      "full_name", "occupation", "employment_type", "education", "religion",
      "skin_color", "religious_importance", "political_views", "children",
      "country_of_residence", "body_type", "profile_photo_url", "profile_video_url",
      "liveness_video_url", "id_back_url"
    ];
    const updates = {};
    allowed.forEach(f => { if (b[f] !== undefined) updates[f] = b[f]; });

    if (Object.keys(updates).length === 0)
      return c.json({ success: false, message: "No fields to update" }, 400);

    const { error: updateErr } = await supabase.from("users").update(updates).eq("id", user.id);
    if (updateErr) return c.json({ success: false, message: updateErr.message }, 500);

    return c.json({ success: true, message: "Profile updated successfully" });
  } catch (err) {
    console.error("Profile update error:", err);
    return c.json({ success: false, message: "Server error" }, 500);
  }
});

module.exports = router;
