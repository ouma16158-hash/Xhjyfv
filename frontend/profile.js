
// profile.js

// Extract first non-empty string from a JSON-array field or plain string
function extractField(raw) {
  if (raw === null || raw === undefined) return '';
  if (Array.isArray(raw)) return raw.find(v => v && String(v).trim()) || '';
  const s = String(raw).trim();
  if (!s || s === 'null' || s === '[]') return '';
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.find(v => v && String(v).trim()) || '';
    } catch (e) {}
  }
  return s;
}

// Return EVERY non-empty value as an array (used to show ALL photos / videos).
function extractAll(raw) {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) {
    return raw.filter(v => v && String(v).trim()).map(v => (typeof v === 'string' ? v : (v && v.url) || ''));
  }
  const s = String(raw).trim();
  if (!s || s === 'null' || s === '[]') return [];
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr.filter(v => v && String(v).trim()).map(v => (typeof v === 'string' ? v : (v && v.url) || ''));
      }
    } catch (e) {}
  }
  return [s];
}

// Function to get the query string parameter 'id'
function getQueryParameter(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

// Fetch user data from the backend using the API base URL from config.js
async function fetchUserProfile(id) {
  try {
    // Use the config.js API base URL dynamically
    const apiUrl = `${config.API_BASE_URL}/api/user?id=${id}`;

    // Make the API request to fetch user data
    const response = await fetch(apiUrl);

    if (!response.ok) throw new Error('User not found!');
    
    const data = await response.json();
    displayUserProfile(data);
  } catch (error) {
    console.error(error);
    document.getElementById('profile-content').innerHTML = '<p>User not found</p>';
  }
}

// Function to display the user profile data
function displayUserProfile(data) {
  const profileContent = document.getElementById('profile-content');

  const { email, password, national_id_number, ...publicData } = data;
  const role = publicData.orientation === 'employer' ? 'employer' : 'seeker';

  // ALL photos (handles JSON array or single URL)
  const photos = extractAll(publicData.profile_photo_url);

  // ALL videos: combine the legacy single profile_video_url with the JSON list
  const legacyVideoUrl = extractField(publicData.profile_video_url);
  const videoIntros = parseMediaList(publicData.liveness_video_url);
  const documents = parseMediaList(publicData.id_back_url);

  const photosHtml = photos.length
    ? photos.map(url =>
        `<img src="${url}" alt="Profile Picture" onclick="openFullscreenImage('${url}')"
              onerror="this.onerror=null;this.src='https://via.placeholder.com/400?text=No+Photo';">`
      ).join('')
    : `<img src="https://via.placeholder.com/400?text=No+Photo" alt="No Profile Picture">`;

  let videosHtml = '';
  if (videoIntros.length) videosHtml += renderVideoIntros(videoIntros);
  if (legacyVideoUrl) {
    videosHtml += `
      <div style="margin-bottom:10px;">
        <video controls onclick="openFullscreenVideo('${legacyVideoUrl}')"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
          <source src="${legacyVideoUrl}" type="video/mp4">
          Your browser does not support the video tag.
        </video>
        <p style="display:none; color:red;">Video failed to load</p>
      </div>`;
  }
  if (!videosHtml) videosHtml = `<p>No video available</p>`;

  const profileHTML = `
    <div class="profile-info">
      <div class="profile-media">
        <div class="photo">${photosHtml}</div>
        <div class="video">${videosHtml}</div>
      </div>
      <div class="details">
        ${role === 'employer' ? renderEmployerProfile(publicData) : renderSeekerProfile(publicData)}
        ${role === 'seeker' ? renderDocuments(documents) : ''}
        <button>Contact</button>
      </div>
    </div>
  `;

  profileContent.innerHTML = profileHTML;
}

function parseMediaList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(item => item && item.url);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(item => item && item.url) : [];
  } catch (e) {
    return [];
  }
}

function renderVideoIntros(videos) {
  return videos.map(video => `
    <div style="margin-bottom:10px;">
      <p><strong>${video.name || 'Video'}</strong></p>
      <video controls onclick="openFullscreenVideo('${video.url}')">
        <source src="${video.url}" type="video/mp4">
        Your browser does not support the video tag.
      </video>
    </div>
  `).join('');
}

function renderDocuments(documents) {
  if (!documents.length) return '';
  return `
    <p><strong>CV & Supporting Documents:</strong></p>
    ${documents.map(doc => `<p><a href="${doc.url}" target="_blank">${doc.name || 'Document'}</a></p>`).join('')}
  `;
}

function renderSeekerProfile(publicData) {
  return `
    <h2>${extractField(publicData.full_name)}</h2>
    <p><strong>Academic Qualification:</strong> ${publicData.education || ''}</p>
    <p><strong>Location:</strong> ${extractField(publicData.country_of_residence)}</p>
    <p><strong>Area:</strong> ${extractField(publicData.occupation)}</p>
    <p><strong>Sub Area:</strong> ${extractField(publicData.employment_type)}</p>
    <p><strong>Small Bio:</strong> ${publicData.religion || ''}</p>
    <p><strong>Skills:</strong> ${publicData.skin_color || ''}</p>
    <p><strong>Address:</strong> ${publicData.body_type || ''}</p>
    <p><strong>Experience:</strong> ${publicData.religious_importance || ''}</p>
    <p><strong>Projects:</strong> ${publicData.political_views || ''}</p>
    <p><strong>Referees:</strong> ${publicData.children || ''}</p>
  `;
}

function renderEmployerProfile(publicData) {
  return `
    <h2>${extractField(publicData.full_name)}</h2>
    <p><strong>Main Area:</strong> ${extractField(publicData.occupation)}</p>
    <p><strong>Sub Area:</strong> ${extractField(publicData.employment_type)}</p>
    <p><strong>Location:</strong> ${extractField(publicData.country_of_residence)}</p>
    <p><strong>Bio:</strong> ${publicData.religion || ''}</p>
  `;
}

// Utility function to calculate age from the date of birth
function getAge(dob) {
  const birthDate = new Date(dob);
  const ageDifMs = Date.now() - birthDate.getTime();
  const ageDate = new Date(ageDifMs);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

// Fullscreen functions for image and video
function openFullscreenImage(url) {
  const fullscreen = document.createElement('div');
  fullscreen.classList.add('fullscreen');
  fullscreen.innerHTML = `
    <img src="${url}" alt="Fullscreen Image">
    <button class="fullscreen-close" onclick="closeFullscreen()">Close</button>
  `;
  document.body.appendChild(fullscreen);
}

function openFullscreenVideo(url) {
  const fullscreen = document.createElement('div');
  fullscreen.classList.add('fullscreen');
  fullscreen.innerHTML = `
    <video controls autoplay>
      <source src="${url}" type="video/mp4">
      Your browser does not support the video tag.
    </video>
    <button class="fullscreen-close" onclick="closeFullscreen()">Close</button>
  `;
  document.body.appendChild(fullscreen);
}

function closeFullscreen() {
  document.querySelector('.fullscreen').remove();
}

// Fetch and display profile based on ID from URL
const userId = getQueryParameter('id');
if (userId) {
  fetchUserProfile(userId);
} else {
  document.getElementById('profile-content').innerHTML = '<p>Invalid User ID</p>';
}
