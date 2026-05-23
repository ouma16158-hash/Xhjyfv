const subMajors = {
  "Engineering & Tech": ["Civil & Structural", "Software & Data", "Electrical", "Mechanical"],
  "Business & Admin": ["Finance & Accounting", "Marketing", "HR", "Operations"],
  "Health & Sciences": ["Clinical", "Laboratory", "Public Health", "Admin"],
  "Arts & Design": ["Graphic Design", "UI/UX", "Photography", "Fine Arts"],
  "Humanities/Social": ["Education", "Psychology", "Sociology", "Political Science"]
};

function getRoleFromToken() {
  const token = localStorage.getItem("token");
  if (!token) return 'seeker';
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || localStorage.getItem("userRole") || 'seeker';
  } catch (e) {
    return localStorage.getItem("userRole") || 'seeker';
  }
}

function populateSubMajors(selectId, major, selectedValue = '') {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">Any Sub Area</option>';
  if (subMajors[major]) {
    subMajors[major].forEach(sm => {
      const opt = document.createElement('option');
      opt.value = sm;
      opt.textContent = sm;
      if (sm === selectedValue) opt.selected = true;
      sel.appendChild(opt);
    });
  }
}

function parseFirstPreference(value) {
  if (!value) return '';
  if (Array.isArray(value)) return value[0] || '';
  return String(value).replace(/^\{|\}$/g, '').split(',').map(v => v.trim()).filter(Boolean)[0] || '';
}

let currentRole = 'seeker';

(async () => {
  const token = localStorage.getItem("token");
  const spinnerOverlay = document.getElementById("spinnerOverlay");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  currentRole = getRoleFromToken();
  setupRoleUi(currentRole);
  setupCascades();

  try {
    spinnerOverlay.style.display = "flex";
    const res = await fetch(`${config.API_BASE_URL}/api/user/current-preferences`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      const userData = await res.json();
      if (userData.orientation) {
        currentRole = userData.orientation;
        localStorage.setItem("userRole", currentRole);
        setupRoleUi(currentRole);
      }
      populateForm(userData);
    }

    spinnerOverlay.style.display = "none";
  } catch (err) {
    console.error("Failed to load preferences:", err);
    spinnerOverlay.style.display = "none";
    alert("Failed to load current preferences. Please try again.");
  }
})();

function setupRoleUi(role) {
  const seekerFields = document.getElementById('seekerPreferenceFields');
  const employerFields = document.getElementById('employerPreferenceFields');
  const title = document.getElementById('pageTitle');
  const note = document.getElementById('pageNote');

  if (role === 'employer') {
    seekerFields.style.display = 'none';
    employerFields.style.display = 'block';
    title.textContent = 'Adjust Company Preferences';
    note.textContent = 'Update the first-job style requirements used to show candidates.';
  } else {
    seekerFields.style.display = 'block';
    employerFields.style.display = 'none';
    title.textContent = 'Adjust Job Preferences';
    note.textContent = 'Update the preferences used to show companies on your dashboard.';
  }
}

function setupCascades() {
  const targetIndustry = document.getElementById('targetIndustrySelect');
  if (targetIndustry) {
    targetIndustry.addEventListener('change', () => populateSubMajors('targetSubIndustrySelect', targetIndustry.value));
  }

  const reqMajor = document.getElementById('reqMajor');
  if (reqMajor) {
    reqMajor.addEventListener('change', () => populateSubMajors('reqSubMajor', reqMajor.value));
  }
}

function populateForm(userData) {
  if (currentRole === 'employer') {
    const reqMajor = document.getElementById('reqMajor');
    const reqSub = document.getElementById('reqSubMajor');
    const education = document.getElementById('pref_body_type');
    if (reqMajor) reqMajor.value = userData.pref_country_of_birth || '';
    populateSubMajors('reqSubMajor', reqMajor ? reqMajor.value : '', userData.pref_country_of_residence || '');
    if (reqSub && userData.pref_country_of_residence) reqSub.value = userData.pref_country_of_residence;
    if (education) education.value = userData.pref_body_type || '';
    return;
  }

  const main = parseFirstPreference(userData.pref_languages);
  const mainEl = document.getElementById('targetIndustrySelect');
  if (mainEl) mainEl.value = main;
  populateSubMajors('targetSubIndustrySelect', main, userData.pref_country_of_residence || '');

  const subEl = document.getElementById('targetSubIndustrySelect');
  if (subEl) subEl.value = userData.pref_country_of_residence || '';

  const salary = document.getElementById('pref_height');
  if (salary) salary.value = userData.pref_height || '';

  const location = document.getElementById('pref_location');
  if (location) location.value = userData.pref_living_situation || '';
}

const form = document.getElementById("adjustPreferencesForm");
const spinner = document.getElementById("spinner");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  spinner.style.display = "block";

  const formData = new FormData(form);
  const token = localStorage.getItem("token");

  if (!token) {
    alert("Session expired. Please log in again.");
    spinner.style.display = "none";
    return;
  }

  let payload;
  if (currentRole === 'employer') {
    payload = {
      pref_country_of_birth: formData.get('pref_country_of_birth') || '',
      pref_country_of_residence: formData.get('pref_country_of_residence') || '',
      pref_body_type: formData.get('pref_body_type') || '',
      pref_age_min: 18,
      pref_age_max: 65
    };
  } else {
    const main = formData.get('target_industry') || '';
    payload = {
      pref_languages: main ? `{${main}}` : '{}',
      pref_country_of_residence: formData.get('pref_country_of_residence') || '',
      pref_height: formData.get('pref_height') || null,
      pref_living_situation: formData.get('pref_location') || '',
      pref_age_min: 18,
      pref_age_max: 65
    };
  }

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
    spinner.style.display = "none";

    if (response.ok && result.success) {
      alert("Preferences updated successfully!");
      window.location.href = "dashboard_page.html";
    } else {
      alert(result.message || "Error updating preferences.");
    }
  } catch (error) {
    spinner.style.display = "none";
    alert("Network error. Try again.");
    console.error(error);
  }
});
