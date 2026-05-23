
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem("token");
  const spinnerOverlay = document.getElementById("spinnerOverlay");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  try {
    spinnerOverlay.style.display = "flex";

    // Fetch current user preferences and profile data
    const res = await fetch(`${config.API_BASE_URL}/api/user/current-preferences`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      const userData = await res.json();
      populateForm(userData);
      loadCurrentMedia(userData);
      checkMediaUpdateCooldown(userData);
    }

    spinnerOverlay.style.display = "none";
  } catch (err) {
    console.error("Failed to load profile data:", err);
    spinnerOverlay.style.display = "none";
    alert("❌ Failed to load profile data. Please try again.");
  }
});

function populateForm(userData) {
  // Populate all form fields with current user data
  const fields = [
    'pref_gender', 'pref_age_min', 'pref_age_max', 'pref_country_of_birth',
    'pref_country_of_residence', 'pref_county_of_residence', 'pref_country',
    'pref_languages', 'pref_religion', 'pref_religion_importance', 'pref_height',
    'pref_weight', 'pref_body_type', 'pref_skin_color', 'pref_ethnicity',
    'pref_diet', 'pref_smoking', 'pref_drinking', 'pref_exercise', 'pref_pets',
    'pref_children', 'pref_living_situation', 'pref_willing_to_relocate',
    'pref_relationship_type'
  ];

  fields.forEach(field => {
    const element = document.getElementById(field);
    if (element && userData[field] !== null && userData[field] !== undefined) {
      element.value = userData[field];
    }
  });
}

function loadCurrentMedia(userData) {
  const currentPhoto = document.getElementById('currentPhoto');
  const currentVideo = document.getElementById('currentVideo');

  if (userData.profile_photo_url) {
    currentPhoto.src = userData.profile_photo_url;
  }

  if (userData.profile_video_url) {
    currentVideo.src = userData.profile_video_url;
    currentVideo.style.display = 'block';
  } else {
    currentVideo.style.display = 'none';
  }

  // Add file input change listeners for preview
  const photoInput = document.getElementById('profilePhoto');
  const videoInput = document.getElementById('profileVideo');

  if (photoInput) {
    photoInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
          currentPhoto.src = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (videoInput) {
    videoInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file && file.type.startsWith('video/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
          currentVideo.src = e.target.result;
          currentVideo.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

function checkMediaUpdateCooldown(userData) {
  const updateNotice = document.getElementById("updateNotice");
  const mediaButton = document.querySelector('button[onclick="updateMedia()"]');
  const isPremium = userData.subscription === 'premium';
  
  // Check if there's a last media update timestamp
  const lastUpdateDate = userData.last_media_update ? new Date(userData.last_media_update) : null;
  const now = new Date();
  
  if (lastUpdateDate) {
    const daysSinceUpdate = Math.floor((now - lastUpdateDate) / (1000 * 60 * 60 * 24));
    const cooldownPeriod = isPremium ? 7 : 30; // Premium: 7 days, Free: 30 days
    const daysRemaining = cooldownPeriod - daysSinceUpdate;
    
    if (daysRemaining > 0) {
      // User is still in cooldown period
      updateNotice.innerHTML = `
        <strong>Media Update Cooldown:</strong> You can update your media again in <span id="cooldownCounter">${daysRemaining}</span> days. 
        ${isPremium ? 'Premium users can update every week.' : 'Free users can update once per month.'} 
        You can still update preferences anytime.
      `;
      updateNotice.style.backgroundColor = '#ffebee';
      updateNotice.style.borderColor = '#f44336';
      
      // Disable media update button
      if (mediaButton) {
        mediaButton.disabled = true;
        mediaButton.style.opacity = '0.5';
        mediaButton.style.cursor = 'not-allowed';
      }
      
      // Start countdown timer
      startCooldownTimer(daysRemaining);
      return;
    }
  }
  
  // User can update media
  updateNotice.innerHTML = `
    <strong>Media Updates:</strong> ${isPremium ? 'Premium users can update media once per week.' : 'Free users can update media once per month.'} 
    Updates require admin approval. You can update preferences anytime.
  `;
  updateNotice.style.backgroundColor = '#e8f5e8';
  updateNotice.style.borderColor = '#4caf50';
  
  // Enable media update button
  if (mediaButton) {
    mediaButton.disabled = false;
    mediaButton.style.opacity = '1';
    mediaButton.style.cursor = 'pointer';
  }
}

function startCooldownTimer(daysRemaining) {
  const counter = document.getElementById('cooldownCounter');
  if (!counter) return;
  
  // Update countdown every hour
  const interval = setInterval(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearInterval(interval);
      return;
    }
    
    // Recalculate remaining time
    fetch(`${config.API_BASE_URL}/api/user/current-preferences`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(userData => {
      const lastUpdateDate = userData.last_media_update ? new Date(userData.last_media_update) : null;
      const now = new Date();
      const isPremium = userData.subscription === 'premium';
      const cooldownPeriod = isPremium ? 7 : 30;
      
      if (lastUpdateDate) {
        const daysSinceUpdate = Math.floor((now - lastUpdateDate) / (1000 * 60 * 60 * 24));
        const daysRemaining = cooldownPeriod - daysSinceUpdate;
        
        if (daysRemaining <= 0) {
          // Cooldown ended, refresh the page
          clearInterval(interval);
          location.reload();
        } else {
          // Update counter
          counter.textContent = daysRemaining;
        }
      }
    })
    .catch(err => {
      console.error('Error updating cooldown:', err);
    });
  }, 3600000); // Update every hour
}

function openFullscreen(src, type) {
  const overlay = document.getElementById('fullscreenOverlay');
  const content = document.getElementById('fullscreenContent');
  
  if (type === 'image') {
    content.innerHTML = `<img src="${src}" class="fullscreen-content" alt="Fullscreen Image">`;
  } else if (type === 'video') {
    content.innerHTML = `<video src="${src}" class="fullscreen-content" controls autoplay></video>`;
  }
  
  overlay.style.display = 'flex';
}

function closeFullscreen() {
  document.getElementById('fullscreenOverlay').style.display = 'none';
}

async function updatePreferences() {
  const form = document.getElementById("preferencesForm");
  const formData = new FormData(form);
  const token = localStorage.getItem("token");
  const spinnerOverlay = document.getElementById("spinnerOverlay");

  if (!token) {
    alert("Session expired. Please log in again.");
    return;
  }

  spinnerOverlay.style.display = "flex";

  const payload = {
    pref_gender: formData.get("pref_gender"),
    pref_age_min: parseInt(formData.get("pref_age_min")),
    pref_age_max: parseInt(formData.get("pref_age_max")),
    pref_country_of_birth: formData.get("pref_country_of_birth"),
    pref_country_of_residence: formData.get("pref_country_of_residence"),
    pref_county_of_residence: formData.get("pref_county_of_residence"),
    pref_country: formData.get("pref_country"),
    pref_languages: formData.get("pref_languages"),
    pref_religion: formData.get("pref_religion"),
    pref_religion_importance: formData.get("pref_religion_importance"),
    pref_height: parseInt(formData.get("pref_height")),
    pref_weight: parseInt(formData.get("pref_weight")),
    pref_body_type: formData.get("pref_body_type"),
    pref_skin_color: formData.get("pref_skin_color"),
    pref_ethnicity: formData.get("pref_ethnicity"),
    pref_diet: formData.get("pref_diet"),
    pref_smoking: formData.get("pref_smoking"),
    pref_drinking: formData.get("pref_drinking"),
    pref_exercise: formData.get("pref_exercise"),
    pref_pets: formData.get("pref_pets"),
    pref_children: formData.get("pref_children"),
    pref_living_situation: formData.get("pref_living_situation"),
    pref_willing_to_relocate: formData.get("pref_willing_to_relocate"),
    pref_relationship_type: formData.get("pref_relationship_type")
  };

  try {
    const response = await fetch(`${config.API_BASE_URL}/api/user/update-preferences`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    spinnerOverlay.style.display = "none";

    if (response.ok && result.success) {
      alert("✅ Preferences updated successfully!");
    } else {
      alert("❌ " + (result.message || "Error updating preferences."));
    }
  } catch (error) {
    spinnerOverlay.style.display = "none";
    alert("❌ Network error. Try again.");
    console.error(error);
  }
}

async function updateMedia() {
  const photoFile = document.getElementById('profilePhoto').files[0];
  const videoFile = document.getElementById('profileVideo').files[0];
  const token = localStorage.getItem("token");
  const spinnerOverlay = document.getElementById("spinnerOverlay");

  if (!photoFile && !videoFile) {
    alert("Please select at least one file to update.");
    return;
  }

  if (!token) {
    alert("Session expired. Please log in again.");
    return;
  }

  spinnerOverlay.style.display = "flex";

  const formData = new FormData();
  if (photoFile) formData.append('profilePhoto', photoFile);
  if (videoFile) formData.append('profileVideo', videoFile);

  try {
    const response = await fetch(`${config.API_BASE_URL}/api/user/update-media`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    const result = await response.json();
    spinnerOverlay.style.display = "none";

    if (response.ok && result.success) {
      alert("✅ Media update request submitted successfully! Admin will review and approve your changes within 24 hours.");
      
      // Update the last media update timestamp in the database
      await fetch(`${config.API_BASE_URL}/api/user/set-media-update-timestamp`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ timestamp: new Date().toISOString() })
      });
      
      // Refresh the page to show new cooldown
      location.reload();
    } else {
      alert("❌ " + (result.message || "Error updating media."));
    }
  } catch (error) {
    spinnerOverlay.style.display = "none";
    alert("❌ Network error. Try again.");
    console.error(error);
  }
}

// Close fullscreen when clicking outside content
document.getElementById('fullscreenOverlay').addEventListener('click', function(e) {
  if (e.target === this) {
    closeFullscreen();
  }
});
