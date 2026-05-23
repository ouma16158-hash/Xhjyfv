
// Decode JWT role
function getRoleFromToken() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || 'seeker';
  } catch(e) { return 'seeker'; }
}

function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp && payload.exp < Math.floor(Date.now() / 1000);
  } catch(e) { return true; }
}

// Sub-major options per major
const subMajors = {
  "Engineering & Tech": ["Civil & Structural", "Software & Data", "Electrical", "Mechanical"],
  "Business & Admin": ["Finance & Accounting", "Marketing", "HR", "Operations"],
  "Health & Sciences": ["Clinical", "Laboratory", "Public Health", "Admin"],
  "Arts & Design": ["Graphic Design", "UI/UX", "Photography", "Fine Arts"],
  "Humanities/Social": ["Education", "Psychology", "Sociology", "Political Science"]
};

function populateSubMajors(selectId, major) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">Select Sub-Major</option>';
  if (subMajors[major]) {
    subMajors[major].forEach(sm => {
      const opt = document.createElement('option');
      opt.value = sm;
      opt.textContent = sm;
      sel.appendChild(opt);
    });
  }
}

// File upload arrays
let videoIntros = []; // [{url, name, cloudinary_id}]
let documentVault = []; // [{url, name, type, cloudinary_id}]

let role = 'seeker';

// Auth guard
(async () => {
  const token = localStorage.getItem("token");
  const overlay = document.getElementById("spinnerOverlay");

  if (!token || isTokenExpired(token)) {
    localStorage.removeItem("token");
    return (window.location.href = "login.html");
  }

  role = getRoleFromToken() || localStorage.getItem("userRole") || 'seeker';
  applyRole(role);

  try {
    if (overlay) overlay.style.display = "flex";

    const res = await fetch(`${config.API_BASE_URL}/api/user/progress`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const step = data.current_step || "personal";
    const status = data.status || "pending";

    // Use orientation from DB as the authoritative source for role
    if (data.orientation) {
      role = data.orientation;
      localStorage.setItem("userRole", role);
      applyRole(role);
    }

    if (status === "approved") return (window.location.href = "dashboard_page.html");
    if (status === "disapproved") return (window.location.href = "submission.html");

    // Only redirect if user is past the personal step.
    // Treat unknown/legacy steps (identity, subscription, null) as 'personal' so the form shows.
    const map = { preferences: "preferences.html", submission: "submission.html" };
    if (map[step]) {
      return (window.location.href = map[step]);
    }

    if (overlay) overlay.style.display = "none";
  } catch (err) {
    console.error("Progress check failed:", err.message);
    if (overlay) overlay.style.display = "none";
  }
})();

function applyRole(r) {
  const seekerEl = document.getElementById('seekerFields');
  const employerEl = document.getElementById('employerFields');
  const title = document.getElementById('formTitle');
  const subtitle = document.getElementById('formSubtitle');

  if (r === 'employer') {
    if (seekerEl) seekerEl.style.display = 'none';
    if (employerEl) employerEl.style.display = 'block';
    if (title) title.textContent = 'Company Profile Setup';
    if (subtitle) subtitle.textContent = 'Tell candidates about your company and job opportunity.';
    // Make seeker fields not required
    disableRequire('seekerFields');
  } else {
    if (seekerEl) seekerEl.style.display = 'block';
    if (employerEl) employerEl.style.display = 'none';
    if (title) title.textContent = 'Job Seeker Profile';
    if (subtitle) subtitle.textContent = 'Help employers discover you. Fill in your professional details.';
    disableRequire('employerFields');
  }
}

function disableRequire(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  section.querySelectorAll('[required]').forEach(el => el.removeAttribute('required'));
}

// Major → Sub-major cascade
document.addEventListener('DOMContentLoaded', () => {
  const majorSel = document.getElementById('majorCategory');
  if (majorSel) {
    majorSel.addEventListener('change', () => populateSubMajors('subMajor', majorSel.value));
  }

  const companyMajorSel = document.getElementById('companyMajorCategory');
  if (companyMajorSel) {
    companyMajorSel.addEventListener('change', () => populateSubMajors('companySubMajor', companyMajorSel.value));
  }

  // Profile photo upload (seeker)
  const photoInput = document.getElementById('profilePhotoInput');
  if (photoInput) {
    photoInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = await uploadFile(file, 'photoProgressBar', 'photoProgress');
      if (url) {
        document.getElementById('profilePhotoUrl').value = url;
        document.getElementById('photoPreviewWrap').innerHTML = `<img src="${url}" style="max-width:150px;max-height:150px;border-radius:8px;margin-top:6px;">`;
      }
    });
  }

  // Company logo upload (employer)
  const logoInput = document.getElementById('companyLogoInput');
  if (logoInput) {
    logoInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = await uploadFile(file, 'logoProgressBar', 'logoProgress');
      if (url) {
        document.getElementById('companyLogoUrl').value = url;
        document.getElementById('logoPreviewWrap').innerHTML = `<img src="${url}" style="max-width:150px;max-height:150px;border-radius:8px;margin-top:6px;">`;
      }
    });
  }

  const companyVideoInput = document.getElementById('companyVideoInput');
  if (companyVideoInput) {
    companyVideoInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = await uploadFile(file, 'companyVideoProgressBar', 'companyVideoProgress');
      if (url) {
        document.getElementById('companyVideoUrl').value = url;
        document.getElementById('companyVideoPreviewWrap').innerHTML = `<video src="${url}" controls style="max-width:100%;max-height:220px;border-radius:8px;margin-top:6px;"></video>`;
      }
    });
  }

  // Add video button
  const addVideoBtn = document.getElementById('addVideoBtn');
  if (addVideoBtn) {
    addVideoBtn.addEventListener('click', () => {
      if (videoIntros.length >= 10) return alert('Maximum 10 videos allowed.');
      addFileSlot('videosGroup_' + Date.now(), 'video', 'video/*', 180);
    });
  }

  // Add doc button
  const addDocBtn = document.getElementById('addDocBtn');
  if (addDocBtn) {
    addDocBtn.addEventListener('click', () => {
      if (documentVault.length >= 10) return alert('Maximum 10 documents allowed.');
      addFileSlot('doc_' + Date.now(), 'doc', '.pdf,.doc,.docx', null);
    });
  }

  // Form submit
  const form = document.getElementById("personalForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const token = localStorage.getItem("token");
      if (!token || isTokenExpired(token)) {
        alert("Session expired. Please log in again.");
        window.location.href = "login.html";
        return;
      }

      // Require at least one uploaded video for seekers
      if (role === 'seeker') {
        const uploadedVideos = videoIntros.filter(v => v.url && v.url.trim());
        if (uploadedVideos.length === 0) {
          const notice = document.getElementById('videoRequiredNotice');
          if (notice) {
            notice.style.display = 'block';
            notice.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            alert('A video showing what you do best (your Onraiser) is required. Companies use this to get to know you before reaching out.');
          }
          return;
        } else {
          const notice = document.getElementById('videoRequiredNotice');
          if (notice) notice.style.display = 'none';
        }
      }

      const submitBtn = document.getElementById("submitBtn");
      const spinner = document.getElementById("spinner");
      if (submitBtn) submitBtn.disabled = true;
      if (spinner) spinner.style.display = "block";

      try {
        // Disable the hidden role section so its fields don't get submitted alongside the visible section
        const hiddenSectionId = role === 'employer' ? 'seekerFields' : 'employerFields';
        const hiddenSection = document.getElementById(hiddenSectionId);
        const hiddenInputs = hiddenSection ? hiddenSection.querySelectorAll('input, select, textarea') : [];
        hiddenInputs.forEach(el => el.disabled = true);

        const formData = new FormData(form);

        // Re-enable hidden inputs so UI stays interactive if user goes back
        hiddenInputs.forEach(el => el.disabled = false);

        // Add video intros and document vault as JSON
        formData.set('video_intros', JSON.stringify(videoIntros));
        formData.set('document_vault', JSON.stringify(documentVault));
        // Store video intros JSON in liveness_video_url field
        formData.set('liveness_video_url', JSON.stringify(videoIntros));
        // Store doc vault JSON in id_back_url field
        formData.set('id_back_url', JSON.stringify(documentVault));

        const response = await fetch(`${config.API_BASE_URL}/api/user/personal`, {
          method: "POST",
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });

        const result = await response.json();

        if (response.ok && result.success) {
          window.location.href = "preferences.html";
        } else {
          alert(`Error: ${result.message || "Failed to save profile"}`);
        }
      } catch (error) {
        console.error("Submit error:", error);
        alert("An error occurred. Please try again.");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (spinner) spinner.style.display = "none";
      }
    });
  }
});

// Upload a file and return the URL
async function uploadFile(file, progressBarId, progressWrapId) {
  const token = localStorage.getItem("token");
  const progressWrap = document.getElementById(progressWrapId);
  const progressBar = document.getElementById(progressBarId);

  if (progressWrap) progressWrap.style.display = 'block';
  if (progressBar) { progressBar.style.width = '20%'; }

  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${config.API_BASE_URL}/api/user/upload-file`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    if (progressBar) progressBar.style.width = '100%';

    if (!res.ok) {
      const err = await res.json();
      alert('Upload failed: ' + (err.message || 'Unknown error'));
      return null;
    }

    const data = await res.json();
    setTimeout(() => { if (progressWrap) progressWrap.style.display = 'none'; }, 1000);
    return data.url;
  } catch (e) {
    console.error('Upload error:', e);
    alert('Upload failed. Please try again.');
    return null;
  }
}

// Add a file slot (for videos or docs)
function addFileSlot(id, type, accept, maxDurationSec) {
  const listId = type === 'video' ? 'videosList' : 'docsList';
  const list = document.getElementById(listId);
  if (!list) return;

  const slotIndex = type === 'video' ? videoIntros.length : documentVault.length;
  const entry = type === 'video' ? videoIntros : documentVault;
  entry.push({ url: '', name: '', uploading: false });

  const item = document.createElement('div');
  item.className = 'file-item';
  item.id = 'slot_' + id;
  item.innerHTML = `
    <input type="text" placeholder="${type === 'video' ? 'Video name (e.g. Introduction)' : 'Document name (e.g. CV, Degree)'}" 
           oninput="updateEntryName('${type}', ${slotIndex}, this.value)" style="flex:1;" />
    <input type="file" accept="${accept}" style="flex:1;" onchange="handleFileSelect(event, '${type}', ${slotIndex}, 'status_${id}')" />
    <span class="upload-status" id="status_${id}">Not uploaded</span>
    <button type="button" class="remove-file-btn" onclick="removeSlot('${type}', ${slotIndex}, 'slot_${id}')">Remove</button>
  `;
  list.appendChild(item);
  updateHiddenFields();
}

function updateEntryName(type, index, value) {
  const arr = type === 'video' ? videoIntros : documentVault;
  if (arr[index] !== undefined) arr[index].name = value;
  updateHiddenFields();
}

async function handleFileSelect(event, type, index, statusId) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById(statusId);
  if (statusEl) { statusEl.textContent = 'Uploading...'; statusEl.className = 'upload-status'; }

  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${config.API_BASE_URL}/api/user/upload-file`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      if (statusEl) { statusEl.textContent = 'Failed'; statusEl.className = 'upload-status error'; }
      return;
    }

    const data = await res.json();
    const arr = type === 'video' ? videoIntros : documentVault;
    if (arr[index] !== undefined) arr[index].url = data.url;

    if (statusEl) { statusEl.textContent = 'Uploaded'; statusEl.className = 'upload-status done'; }
    updateHiddenFields();
  } catch (e) {
    console.error('File upload error:', e);
    if (statusEl) { statusEl.textContent = 'Error'; statusEl.className = 'upload-status error'; }
  }
}

function removeSlot(type, index, slotId) {
  const arr = type === 'video' ? videoIntros : documentVault;
  arr.splice(index, 1);
  const slotEl = document.getElementById(slotId);
  if (slotEl) slotEl.remove();
  updateHiddenFields();
}

function updateHiddenFields() {
  const viField = document.getElementById('videoIntrosData');
  const dvField = document.getElementById('documentVaultData');
  if (viField) viField.value = JSON.stringify(videoIntros);
  if (dvField) dvField.value = JSON.stringify(documentVault);
}
