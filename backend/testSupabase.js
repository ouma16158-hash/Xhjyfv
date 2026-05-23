const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yekxujhqkslctmxqseww.supabase.co';  // Replace with your actual Supabase URL
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlla3h1amhxa3NsY3RteHFzZXd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MzQ3NDAsImV4cCI6MjA2NjUxMDc0MH0.JWfIwkgWoP-pZ5mRf0XKXMORX5rlgHwZ9oQbdYybpcc';  // Replace with your actual anon key

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function fetchUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, dob, country_of_birth, profile_photo_url, profile_video_url');

  if (error) {
    console.error('Error fetching users:', error);
  } else {
    console.log('Fetched Users:', data);
  }
}

fetchUsers();
