const { Hono } = require("hono");
const router = new Hono();
const adminController = require("../controller/adminController");
const { createClient } = require("@supabase/supabase-js");
const jwt = require("jsonwebtoken");

let _dbClient = null;
const supabase = new Proxy({}, {
  get(_, prop) {
    if (!_dbClient) _dbClient = createClient(process.env.SUPABASE_URL || 'https://placeholder.supabase.co', process.env.ANON_KEY || 'placeholder_key');
    const val = _dbClient[prop];
    return typeof val === 'function' ? val.bind(_dbClient) : val;
  }
});

const authenticateAdmin = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, message: "Missing or invalid token format" }, 401);
  }

  const token = authHeader.split(" ")[1];

  if (!token || token === 'null' || token === 'undefined') {
    return c.json({ success: false, message: "Missing token" }, 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== 'admin') {
      return c.json({ success: false, message: "Admin access required" }, 403);
    }

    c.set('admin', decoded);
    await next();
  } catch (error) {
    console.error('Admin auth error:', error);
    return c.json({ success: false, message: "Invalid token" }, 401);
  }
};

router.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ message: 'Email and password are required' }, 400);
    }

    console.log('Admin login attempt:', email);

    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      console.error('Supabase query error:', error);
      return c.json({ message: 'Invalid credentials' }, 401);
    }

    if (!data) {
      console.log('No admin found with email:', email);
      return c.json({ message: 'Invalid credentials' }, 401);
    }

    const bcrypt = require('bcrypt');
    const isValid = await bcrypt.compare(password, data.password_hash);
    if (!isValid) {
      console.log('Invalid password for admin:', email);
      return c.json({ message: 'Invalid credentials' }, 401);
    }

    const token = jwt.sign(
      { id: data.id, email: data.email, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('Admin login successful:', email);
    return c.json({
      message: 'Login successful',
      token,
      admin: { id: data.id, email: data.email }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    return c.json({ message: 'Server error', error: error.message }, 500);
  }
});

router.get("/users", authenticateAdmin, adminController.getAllUsers);
router.post("/user/status", authenticateAdmin, adminController.updateUserStatus);
router.get("/users/:id", authenticateAdmin, adminController.getUserById);
router.post("/grant-premium", authenticateAdmin, adminController.grantPremiumAccess);
router.post("/remove-premium", authenticateAdmin, adminController.removePremiumAccess);
router.post("/users/:id/suspend", authenticateAdmin, adminController.suspendUser);
router.post("/users/:id/restore", authenticateAdmin, adminController.restoreUser);
router.delete("/users/:id", authenticateAdmin, adminController.deleteUser);

router.get("/dashboard-stats", authenticateAdmin, async (c) => {
  try {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('subscription');

    if (usersError) {
      console.error("Users query error:", usersError);
      return c.json({ success: false, message: "Server error" }, 500);
    }

    const totalUsers = users.length;
    const activePremium = users.filter(user => user.subscription === 'premium').length;

    const { data: mediaUpdates, error: mediaError } = await supabase
      .from('pending_media_updates')
      .select('*')
      .eq('status', 'pending');

    const pendingMedia = mediaError ? 0 : mediaUpdates.length;

    const { data: premiumApprovals, error: premiumError } = await supabase
      .from('pending_premium_subscriptions')
      .select('*')
      .eq('status', 'pending');

    const pendingPremium = premiumError ? 0 : premiumApprovals.length;

    return c.json({
      success: true,
      totalUsers,
      pendingMedia,
      pendingPremium,
      activePremium
    });

  } catch (error) {
    console.error("Dashboard stats error:", error);
    return c.json({ success: false, message: "Server error" }, 500);
  }
});

router.get("/media-updates/stats", authenticateAdmin, async (c) => {
  try {
    const { data, error } = await supabase
      .from('pending_media_updates')
      .select('status');

    if (error) {
      console.error("Media stats error:", error);
      return c.json({ success: false, message: "Server error" }, 500);
    }

    const stats = {
      pending: data.filter(item => item.status === 'pending').length,
      approved: data.filter(item => item.status === 'approved').length,
      rejected: data.filter(item => item.status === 'rejected').length
    };

    return c.json(stats);

  } catch (error) {
    console.error("Media stats error:", error);
    return c.json({ success: false, message: "Server error" }, 500);
  }
});

router.get("/premium-approvals/stats", authenticateAdmin, async (c) => {
  try {
    const { data, error } = await supabase
      .from('pending_premium_subscriptions')
      .select('status');

    if (error) {
      console.error("Premium stats error:", error);
      return c.json({ success: false, message: "Server error" }, 500);
    }

    const stats = {
      pending: data.filter(item => item.status === 'pending').length,
      approved: data.filter(item => item.status === 'approved').length,
      rejected: data.filter(item => item.status === 'rejected').length
    };

    return c.json(stats);

  } catch (error) {
    console.error("Premium stats error:", error);
    return c.json({ success: false, message: "Server error" }, 500);
  }
});

router.get("/media-updates", authenticateAdmin, async (c) => {
  try {
    const status = c.req.query('status') || 'pending';

    const { data, error } = await supabase
      .from('pending_media_updates')
      .select('*')
      .eq('status', status)
      .order('requested_at', { ascending: false });

    if (error) throw error;
    return c.json(data);
  } catch (error) {
    console.error('Error fetching media updates:', error);
    return c.json({ error: 'Server error' }, 500);
  }
});

router.post("/media-updates/review", authenticateAdmin, async (c) => {
  try {
    const { updateId, status, adminMessage } = await c.req.json();

    if (status === 'approved') {
      const { data: update } = await supabase
        .from('pending_media_updates')
        .select('*')
        .eq('id', updateId)
        .single();

      if (update) {
        const updateData = {};
        if (update.pending_photo_url) updateData.profile_photo_url = update.pending_photo_url;
        if (update.pending_video_url) updateData.profile_video_url = update.pending_video_url;

        await supabase
          .from('users')
          .update(updateData)
          .eq('email', update.user_email);
      }
    }

    await supabase
      .from('pending_media_updates')
      .update({
        status,
        admin_message: adminMessage,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', updateId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error reviewing media update:', error);
    return c.json({ error: 'Server error' }, 500);
  }
});

router.get("/premium-subscriptions", authenticateAdmin, async (c) => {
  try {
    const status = c.req.query('status') || 'pending';

    const { data, error } = await supabase
      .from('pending_premium_subscriptions')
      .select('*')
      .eq('status', status)
      .order('requested_at', { ascending: false });

    if (error) throw error;
    return c.json(data);
  } catch (error) {
    console.error('Error fetching premium subscriptions:', error);
    return c.json({ error: 'Server error' }, 500);
  }
});

router.post("/premium-subscriptions/review", authenticateAdmin, async (c) => {
  try {
    const { subscriptionId, status, adminMessage } = await c.req.json();

    if (status === 'approved') {
      const { data: subscription } = await supabase
        .from('pending_premium_subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .single();

      if (subscription) {
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('email', subscription.user_email)
          .single();

        if (user) {
          const endDate = new Date();
          endDate.setDate(endDate.getDate() + 30);
          const now = new Date().toISOString();
          const endDateStr = endDate.toISOString();

          const { data: existingSub } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

          if (existingSub) {
            await supabase
              .from('subscriptions')
              .update({
                plan: 'premium',
                status: 'active',
                start_date: now,
                end_date: endDateStr,
                amount_paid: subscription.amount,
                currency: subscription.currency,
                payment_method: subscription.payment_method
              })
              .eq('id', existingSub.id);
          } else {
            await supabase
              .from('subscriptions')
              .insert({
                user_id: user.id,
                user_email: subscription.user_email,
                plan: 'premium',
                status: 'active',
                start_date: now,
                end_date: endDateStr,
                amount_paid: subscription.amount,
                currency: subscription.currency,
                payment_method: subscription.payment_method
              });
          }

          await supabase
            .from('users')
            .update({ subscription: 'premium', current_step: 'personal' })
            .eq('id', user.id);
        }
      }
    }

    await supabase
      .from('pending_premium_subscriptions')
      .update({
        status,
        admin_message: adminMessage,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', subscriptionId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error reviewing subscription:', error);
    return c.json({ error: 'Server error' }, 500);
  }
});

module.exports = router;
