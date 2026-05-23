
const express = require('express');
const router = express.Router();

// Add conversations endpoint
router.get("/conversations", async (req, res) => {
  try {
    const jwt = require("jsonwebtoken");
    const { createClient } = require("@supabase/supabase-js");

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.json([]);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    // Get current user
    const { data: currentUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (userError || !currentUser) {
      return res.json([]);
    }

    // Get users that current user has accepted (mutual matches)
    const { data: acceptedInteractions, error: acceptedError } = await supabase
      .from('user_interactions')
      .select('target_user_id')
      .eq('current_user_id', currentUser.id)
      .eq('action', 'accepted');

    if (acceptedError || !acceptedInteractions || acceptedInteractions.length === 0) {
      return res.json([]);
    }

    const acceptedUserIds = acceptedInteractions.map(interaction => interaction.target_user_id);

    // Get user details for matched users
    const { data: matchedUsers, error: usersError } = await supabase
      .from('users')
      .select('id, full_name, profile_photo_url')
      .in('id', acceptedUserIds)
      .eq('status', 'approved');

    if (usersError) {
      console.error('Error fetching matched users:', usersError);
      return res.json([]);
    }

    // Format conversations
    const conversations = matchedUsers.map(user => ({
      user_id: user.id,
      user_name: user.full_name,
      profile_photo_url: user.profile_photo_url,
      last_message: 'Start a conversation...',
      last_message_time: null,
      unread_count: 0
    }));

    res.json(conversations);
  } catch (error) {
    console.error('Conversations error:', error);
    res.json([]);
  }
});

module.exports = router;
