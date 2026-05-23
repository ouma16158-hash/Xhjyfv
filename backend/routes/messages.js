require("dotenv").config();
const { Hono } = require("hono");
const router = new Hono();
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

const verifyToken = async (c, next) => {
  const token = c.req.header('Authorization')?.split(" ")[1];

  if (!token) {
    return c.json({ success: false, message: "Missing token" }, 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    c.set('user', decoded);
    await next();
  } catch (error) {
    return c.json({ success: false, message: "Invalid token" }, 401);
  }
};

async function getUserIdByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (error) throw error;
  return data.id;
}

router.post('/mark-read/:userId', verifyToken, async (c) => {
  try {
    const currentUserEmail = c.get('user').email;
    const otherUserId = c.req.param('userId');

    const currentUserId = await getUserIdByEmail(currentUserEmail);

    const { error } = await supabase
      .from('messages')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('sender_id', otherUserId)
      .eq('receiver_id', currentUserId)
      .eq('is_read', false);

    if (error) {
      console.error('Error marking messages as read:', error);
      return c.json({ success: false, message: 'Database error' }, 500);
    }

    return c.json({ success: true, message: 'Messages marked as read' });
  } catch (error) {
    console.error('Mark read error:', error);
    return c.json({ success: false, message: 'Server error' }, 500);
  }
});

router.post("/send", verifyToken, async (c) => {
  try {
    const { receiverId, message } = await c.req.json();
    const senderEmail = c.get('user').email;

    if (!receiverId || !message || !message.trim()) {
      return c.json({ success: false, message: "Receiver ID and message are required" }, 400);
    }

    const senderId = await getUserIdByEmail(senderEmail);

    const { data: chatRows } = await supabase
      .from('user_interactions')
      .select('id')
      .eq('action', 'chat_enabled')
      .or(
        `and(current_user_id.eq.${senderId},target_user_id.eq.${receiverId}),` +
        `and(current_user_id.eq.${receiverId},target_user_id.eq.${senderId})`
      )
      .limit(1);

    let chatEnabled = chatRows && chatRows.length > 0;

    if (!chatEnabled) {
      const { data: bothUsers } = await supabase
        .from('users')
        .select('id, email')
        .in('id', [senderId, parseInt(receiverId)]);

      if (bothUsers && bothUsers.length === 2) {
        const senderUser   = bothUsers.find(u => u.id === senderId);
        const receiverUser = bothUsers.find(u => u.id === parseInt(receiverId));

        if (senderUser && receiverUser) {
          const { data: appA } = await supabase
            .from('job_applications')
            .select('id, job_post_id')
            .eq('seeker_id', senderId)
            .eq('status', 'chat_enabled')
            .limit(20);

          if (appA && appA.length > 0) {
            const jobIds = appA.map(a => a.job_post_id);
            const { data: jobsA } = await supabase
              .from('job_posts')
              .select('id')
              .in('id', jobIds)
              .eq('company_email', receiverUser.email)
              .limit(1);
            if (jobsA && jobsA.length > 0) chatEnabled = true;
          }

          if (!chatEnabled) {
            const { data: appB } = await supabase
              .from('job_applications')
              .select('id, job_post_id')
              .eq('seeker_id', parseInt(receiverId))
              .eq('status', 'chat_enabled')
              .limit(20);

            if (appB && appB.length > 0) {
              const jobIds = appB.map(a => a.job_post_id);
              const { data: jobsB } = await supabase
                .from('job_posts')
                .select('id')
                .in('id', jobIds)
                .eq('company_email', senderUser.email)
                .limit(1);
              if (jobsB && jobsB.length > 0) chatEnabled = true;
            }
          }

          if (chatEnabled) {
            supabase.from('user_interactions').insert({
              current_user_id: senderId,
              target_user_id: parseInt(receiverId),
              action: 'chat_enabled'
            }).then(() => {}).catch(() => {});
          }
        }
      }
    }

    if (!chatEnabled) {
      return c.json({ success: false, message: "Chat has not been enabled for this conversation" }, 403);
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: senderId,
        receiver_id: receiverId,
        message: message.trim()
      })
      .select()
      .single();

    if (error) {
      console.error("Error sending message:", error);
      return c.json({ success: false, message: "Failed to send message" }, 500);
    }

    return c.json({
      success: true,
      message: "Message sent successfully",
      data: data
    });
  } catch (error) {
    console.error("Send message error:", error);
    return c.json({ success: false, message: "Server error" }, 500);
  }
});

router.get("/unread-count", verifyToken, async (c) => {
  try {
    const userEmail = c.get('user').email;
    const userId = await getUserIdByEmail(userEmail);

    const { count: unreadMessages } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', userId)
      .is('read_at', null);

    const { data: seekerApps } = await supabase
      .from('job_applications')
      .select('job_post_id, seeker_id')
      .eq('seeker_id', userId)
      .eq('status', 'chat_enabled');

    let newActivations = 0;
    const activationDetails = [];

    if (seekerApps && seekerApps.length > 0) {
      const postIds = seekerApps.map(a => a.job_post_id);
      const { data: posts } = await supabase.from('job_posts').select('id, company_email').in('id', postIds);
      if (posts && posts.length > 0) {
        const emails = [...new Set(posts.map(p => p.company_email).filter(Boolean))];
        const { data: employers } = await supabase.from('users').select('id, full_name, email').in('email', emails);
        for (const emp of (employers || [])) {
          const { count: seekerSent } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('sender_id', userId)
            .eq('receiver_id', emp.id);

          const { count: empSent } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('sender_id', emp.id)
            .eq('receiver_id', userId);

          if ((!seekerSent || seekerSent === 0) && (!empSent || empSent === 0)) {
            newActivations++;
            activationDetails.push({ employer_id: emp.id, employer_name: emp.full_name || emp.email });
          }
        }
      }
    }

    return c.json({
      success: true,
      unread_messages: unreadMessages || 0,
      new_activations: newActivations,
      activation_details: activationDetails
    });
  } catch (error) {
    console.error('unread-count error:', error);
    return c.json({ success: false, message: 'Server error' }, 500);
  }
});

router.get("/conversation/:receiverId", verifyToken, async (c) => {
  try {
    const receiverId = c.req.param('receiverId');
    const senderEmail = c.get('user').email;

    const senderId = await getUserIdByEmail(senderEmail);

    const { data: messages, error } = await supabase
      .from('messages')
      .select(`
        id,
        sender_id,
        receiver_id,
        message,
        created_at,
        read_at,
        sender:users!messages_sender_id_fkey(full_name, profile_photo_url),
        receiver:users!messages_receiver_id_fkey(full_name, profile_photo_url)
      `)
      .or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`)
      .order('created_at', { ascending: true });

    if (error) {
      console.error("Error fetching messages:", error);
      return c.json({ success: false, message: "Failed to fetch messages" }, 500);
    }

    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', receiverId)
      .eq('receiver_id', senderId)
      .is('read_at', null);

    return c.json({
      success: true,
      messages: messages || []
    });
  } catch (error) {
    console.error("Get messages error:", error);
    return c.json({ success: false, message: "Server error" }, 500);
  }
});

router.get("/conversations", verifyToken, async (c) => {
  try {
    const userEmail = c.get('user').email;
    const userId = await getUserIdByEmail(userEmail);

    const { data: currentUserRow } = await supabase
      .from('users').select('orientation').eq('id', userId).single();
    const currentRole = currentUserRow?.orientation;
    const expectedPartnerRole = currentRole === 'seeker' ? 'employer' : 'seeker';

    const [{ data: asInitiator }, { data: asReceiver }] = await Promise.all([
      supabase.from('user_interactions')
        .select('target_user_id, users!user_interactions_target_user_id_fkey(id, full_name, profile_photo_url, email, orientation)')
        .eq('current_user_id', userId).eq('action', 'chat_enabled'),
      supabase.from('user_interactions')
        .select('current_user_id, users!user_interactions_current_user_id_fkey(id, full_name, profile_photo_url, email, orientation)')
        .eq('target_user_id', userId).eq('action', 'chat_enabled')
    ]);

    const partnerMap = new Map();
    for (const row of (asInitiator || [])) {
      const u = row.users;
      if (u && (!expectedPartnerRole || u.orientation === expectedPartnerRole)) partnerMap.set(u.id, u);
    }
    for (const row of (asReceiver || [])) {
      const u = row.users;
      if (u && (!expectedPartnerRole || u.orientation === expectedPartnerRole)) partnerMap.set(u.id, u);
    }

    if (!currentRole || currentRole === 'seeker') {
      const { data: seekerApps } = await supabase
        .from('job_applications')
        .select('job_post_id')
        .eq('seeker_id', userId)
        .eq('status', 'chat_enabled');

      if (seekerApps && seekerApps.length > 0) {
        const postIds = seekerApps.map(a => a.job_post_id);
        const { data: posts } = await supabase.from('job_posts').select('company_email').in('id', postIds);
        if (posts && posts.length > 0) {
          const emails = [...new Set(posts.map(p => p.company_email).filter(Boolean))];
          const { data: employers } = await supabase
            .from('users').select('id, full_name, profile_photo_url, email, orientation')
            .in('email', emails).eq('orientation', 'employer');
          for (const u of (employers || [])) { if (!partnerMap.has(u.id)) partnerMap.set(u.id, u); }
        }
      }
    }

    if (!currentRole || currentRole === 'employer') {
      const { data: empPosts } = await supabase.from('job_posts').select('id').eq('company_email', userEmail);
      if (empPosts && empPosts.length > 0) {
        const postIds = empPosts.map(p => p.id);
        const { data: chatApps } = await supabase
          .from('job_applications')
          .select('seeker_id')
          .in('job_post_id', postIds)
          .eq('status', 'chat_enabled');
        if (chatApps && chatApps.length > 0) {
          const seekerIds = [...new Set(chatApps.map(a => a.seeker_id).filter(Boolean))];
          const { data: seekers } = await supabase
            .from('users').select('id, full_name, profile_photo_url, email, orientation')
            .in('id', seekerIds).eq('orientation', 'seeker');
          for (const u of (seekers || [])) { if (!partnerMap.has(u.id)) partnerMap.set(u.id, u); }
        }
      }
    }

    const conversations = [];

    for (const [partnerId, partnerUser] of partnerMap) {
      const { data: lastMsgs } = await supabase
        .from('messages')
        .select('message, created_at, sender_id')
        .or(`and(sender_id.eq.${userId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${userId})`)
        .order('created_at', { ascending: false })
        .limit(1);

      const lastMsg = lastMsgs && lastMsgs[0] ? lastMsgs[0] : null;

      const { count: unreadCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('sender_id', partnerId)
        .eq('receiver_id', userId)
        .is('read_at', null);

      let photoUrl = partnerUser.profile_photo_url || null;
      if (photoUrl && photoUrl.startsWith('[')) {
        try { const arr = JSON.parse(photoUrl); photoUrl = arr[0] || null; } catch (e) {}
      }

      conversations.push({
        user_id: partnerUser.id,
        user_name: partnerUser.full_name || partnerUser.email || 'Unknown',
        profile_photo_url: photoUrl,
        last_message: lastMsg ? lastMsg.message : null,
        last_message_time: lastMsg ? lastMsg.created_at : null,
        unread_count: unreadCount || 0,
        is_last_message_mine: lastMsg ? lastMsg.sender_id === userId : false
      });
    }

    conversations.sort((a, b) => {
      if (!a.last_message_time && !b.last_message_time) return 0;
      if (!a.last_message_time) return 1;
      if (!b.last_message_time) return -1;
      return new Date(b.last_message_time) - new Date(a.last_message_time);
    });

    return c.json({ success: true, conversations });
  } catch (error) {
    console.error("Get conversations error:", error);
    return c.json({ success: false, message: "Server error" }, 500);
  }
});

module.exports = router;
