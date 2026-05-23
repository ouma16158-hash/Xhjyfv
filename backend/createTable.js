require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createUsersTable() {
  try {
    console.log("🔄 Creating users table...");

    const { data, error } = await supabase.rpc('create_users_table', {}, {
      body: `
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          id_front_url TEXT,
          id_back_url TEXT,
          liveness_video_url TEXT,
          full_name VARCHAR(255),
          dob DATE,
          gender VARCHAR(50),
          orientation VARCHAR(50),
          country_of_birth VARCHAR(100),
          country_of_residence VARCHAR(100),
          city VARCHAR(100),
          willing_to_relocate VARCHAR(20),
          languages TEXT,
          preferred_language VARCHAR(50),
          education VARCHAR(100),
          occupation VARCHAR(255),
          employment_type VARCHAR(100),
          religion VARCHAR(100),
          religious_importance VARCHAR(50),
          political_views VARCHAR(50),
          height INTEGER,
          weight INTEGER,
          skin_color VARCHAR(50),
          body_type VARCHAR(50),
          eye_color VARCHAR(50),
          hair_color VARCHAR(50),
          ethnicity VARCHAR(100),
          diet VARCHAR(50),
          smoking VARCHAR(50),
          drinking VARCHAR(50),
          exercise VARCHAR(50),
          pets VARCHAR(50),
          living_situation VARCHAR(100),
          children VARCHAR(50),
          photo_url TEXT,
          video_url TEXT,
          pref_gender VARCHAR(50),
          pref_age_min INTEGER,
          pref_age_max INTEGER,
          pref_country VARCHAR(100),
          pref_languages TEXT,
          pref_religion VARCHAR(100),
          pref_religion_importance VARCHAR(50),
          pref_height VARCHAR(50),
          pref_weight VARCHAR(50),
          pref_body_type VARCHAR(50),
          pref_skin_color VARCHAR(50),
          pref_ethnicity VARCHAR(100),
          pref_diet VARCHAR(50),
          pref_drinking VARCHAR(50),
          pref_smoking VARCHAR(50),
          pref_exercise VARCHAR(50),
          pref_pets VARCHAR(50),
          pref_children VARCHAR(50),
          pref_living_situation VARCHAR(100),
          pref_willing_to_relocate VARCHAR(20),
          pref_relationship_type VARCHAR(100),
          national_id_number VARCHAR(50),
          county_of_residence VARCHAR(100),
          pref_country_of_birth VARCHAR(100),
          pref_country_of_residence VARCHAR(100),
          pref_county_of_residence VARCHAR(100),
          profile_photo_url TEXT,
          profile_video_url TEXT,
          status VARCHAR(20) DEFAULT 'pending',
          admin_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          current_step VARCHAR(50) DEFAULT 'identity',
          is_complete BOOLEAN DEFAULT FALSE,
          id_front_public_id VARCHAR(255),
          id_back_public_id VARCHAR(255),
          liveness_public_id VARCHAR(255),
          profile_photo_public_id VARCHAR(255),
          profile_video_public_id VARCHAR(255)
        );
      `
    });

    if (error) {
      console.error("❌ Error creating users table:", error);
    } else {
      console.log("✅ Users table created successfully!");
    }

  } catch (err) {
    console.error("❌ Unexpected error:", err.message);
  }
}

// Run the function
createUsersTable();