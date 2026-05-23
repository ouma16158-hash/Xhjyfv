const bcrypt = require("bcrypt");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

(async () => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const email = "onraiser001@gmail.com";
    const password = "0768012671";
    const hashed = await bcrypt.hash(password, 10);

    // Check if admin already exists
    const { data: existingAdmin } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .single();

    if (existingAdmin) {
      console.log("⚠️ Admin already exists with email:", email);
      
      // Update password if admin exists
      const { error } = await supabase
        .from('admins')
        .update({ password_hash: hashed })
        .eq('email', email);

      if (error) {
        console.error("❌ Error updating admin:", error.message);
      } else {
        console.log("✅ Admin password updated successfully.");
      }
    } else {
      // Create new admin
      const { data, error } = await supabase
        .from('admins')
        .insert({
          email: email,
          password_hash: hashed
        });

      if (error) {
        console.error("❌ Error creating admin:", error.message);
      } else {
        console.log("✅ Admin created successfully.");
        console.log("📧 Email:", email);
        console.log("🔑 Password:", password);
      }
    }

  } catch (error) {
    console.error("❌ Script error:", error.message);
  }
  
  process.exit();
})();