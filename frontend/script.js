// ✅ Configure your Supabase connection
const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_KEY = "YOUR_SUPABASE_PUBLIC_KEY";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ✅ DOM container where profiles will be added
const profilesContainer = document.getElementById("profiles-container");

// Fetch profiles from Supabase
async function loadProfiles() {
  try {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("*");

    if (error) throw error;

    profilesContainer.innerHTML = ""; // Clear before rendering

    data.forEach(profile => {
      const card = createProfileCard(profile);
      profilesContainer.appendChild(card);
    });

  } catch (err) {
    console.error("Error loading profiles:", err.message);
  }
}

// Create a profile card element
function createProfileCard(profile) {
  const card = document.createElement("div");
  card.classList.add("profile-card");

  // Profile photo
  const photo = document.createElement("img");
  photo.src = profile.photo_url;
  photo.alt = `${profile.name} photo`;
  photo.classList.add("profile-photo");

  // Profile video
  const video = document.createElement("video");
  video.src = profile.video_url;
  video.controls = true;
  video.classList.add("profile-video");

  // Info
  const info = document.createElement("div");
  info.classList.add("profile-info");
  info.innerHTML = `
    <strong>${profile.name}</strong><br>
    ${profile.age}yrs<br>
    ${profile.country}, ${profile.city}
  `;

  // Match score
  const score = document.createElement("div");
  score.classList.add("match-score");
  score.innerText = `${profile.match_score}`;

  // Actions
  const actions = document.createElement("div");
  actions.classList.add("profile-actions");

  const selectBtn = document.createElement("button");
  selectBtn.innerText = "Select";
  selectBtn.classList.add("select-btn");
  selectBtn.addEventListener("click", () => handleSelect(profile.id));

  const removeBtn = document.createElement("button");
  removeBtn.innerText = "Remove";
  removeBtn.classList.add("remove-btn");
  removeBtn.addEventListener("click", () => handleRemove(profile.id));

  actions.appendChild(selectBtn);
  actions.appendChild(removeBtn);

  // Profile photo clickable -> profile page
  photo.style.cursor = "pointer";
  photo.addEventListener("click", () => goToProfile(profile.id));

  card.appendChild(photo);
  card.appendChild(video);
  card.appendChild(info);
  card.appendChild(score);
  card.appendChild(actions);

  return card;
}

// Go to profile page
function goToProfile(id) {
  window.location.href = `/profile.html?id=${id}`;
}

// Handle select
function handleSelect(id) {
  alert(`Profile ${id} selected`);
  // Here you can update Supabase to mark as selected
}

// Handle remove
function handleRemove(id) {
  alert(`Profile ${id} removed`);
  // Here you can update Supabase to mark as removed
}

// Load profiles on page load
document.addEventListener("DOMContentLoaded", loadProfiles);
