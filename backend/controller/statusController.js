
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

exports.getUserStatus = async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    const { data, error } = await supabase
      .from('users')
      .select('status, admin_message')
      .eq('email', email)
      .single();

    if (error) {
      console.error("Status check error:", error.message);
      return c.json({ message: "Server error" }, 500);
    }

    if (!data) {
      return c.json({ message: "User not found" }, 404);
    }

    const { status, admin_message } = data;

    return c.json({ status, adminMessage: admin_message });
  } catch (err) {
    console.error("Status check error:", err.message);
    return c.json({ message: "Server error" }, 500);
  }
};
