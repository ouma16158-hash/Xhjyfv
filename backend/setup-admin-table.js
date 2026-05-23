
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

(async () => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    console.log("Setting up admin table...");

    // Try to create a test record to see if table exists
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .limit(1);

    if (error) {
      if (error.message.includes('relation "public.admins" does not exist')) {
        console.log("❌ Admin table does not exist. Please create it manually in Supabase:");
        console.log(`
CREATE TABLE public.admins (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
        `);
      } else {
        console.error("❌ Error checking admin table:", error.message);
      }
    } else {
      console.log("✅ Admin table exists");
      console.log("Found", data.length, "admin records");
    }

  } catch (error) {
    console.error("❌ Script error:", error.message);
  }
  
  process.exit();
})();
