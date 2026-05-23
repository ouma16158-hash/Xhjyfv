/* ── my-profile.js ── */

const subMajors = {
  "Engineering & Tech": ["Civil & Structural", "Software & Data", "Electrical", "Mechanical"],
  "Business & Admin":   ["Finance & Accounting", "Marketing", "HR", "Operations"],
  "Health & Sciences":  ["Clinical", "Laboratory", "Public Health", "Admin"],
  "Arts & Design":      ["Graphic Design", "UI/UX", "Photography", "Fine Arts"],
  "Humanities/Social":  ["Education", "Psychology", "Sociology", "Political Science"]
};

function getToken() { return localStorage.getItem("token"); }

function getRoleFromToken() {
  const t = getToken();
  if (!t) return "seeker";
  try { return JSON.parse(atob(t.split(".")[1])).role || "seeker"; }
  catch(e) { return "seeker"; }
}

function showToast(msg, type = "success") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show " + type;
  setTimeout(() => { el.className = "toast"; }, 3200);
}

function setSpinner(on) {
  document.getElementById("spinnerOverlay").style.display = on ? "flex" : "none";
}

function populateSubMajorSelect(selectId, major, selected = "") {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">Select Sub Area</option>';
  if (major && subMajors[major]) {
    subMajors[major].forEach(sm => {
      const o = document.createElement("option");
      o.value = sm; o.textContent = sm;
      if (sm === selected) o.selected = true;
      sel.appendChild(o);
    });
  }
}

/* ──────── Media state ──────── */
let videoIntros   = [];  // [{url, name}]
let documentVault = [];  // [{url, name}]
let profilePhotoUrl  = "";
let companyLogoUrl   = "";
let companyVideoUrl  = "";

/* ──────── Upload helper ──────── */
async function uploadFile(file, progressBarId, progressWrapId) {
  const wrap = progressBarId ? document.getElementById(progressWrapId) : null;
  const bar  = progressBarId ? document.getElementById(progressBarId)  : null;
  if (wrap) { wrap.style.display = "block"; bar.style.width = "20%"; }

  const fd = new FormData();
  fd.append("file", file);
  try {
    const r = await fetch(`${config.API_BASE_URL}/api/user/upload-file`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: fd
    });
    if (bar) bar.style.width = "100%";
    if (!r.ok) { showToast("Upload failed", "error"); return null; }
    const d = await r.json();
    setTimeout(() => { if (wrap) wrap.style.display = "none"; }, 800);
    return d.url;
  } catch(e) {
    showToast("Upload error", "error");
    return null;
  }
}

/* ──────── Render video list ──────── */
function renderVideos() {
  const list = document.getElementById("videosList");
  list.innerHTML = "";
  videoIntros.forEach((v, i) => {
    if (v._slot) { list.appendChild(v._slot); return; }
    const item = document.createElement("div");
    item.className = "media-item";
    item.innerHTML = `
      <div style="font-size:26px;flex-shrink:0;">🎬</div>
      <div class="media-info">
        <div class="media-name">${escHtml(v.name || "Video " + (i+1))}</div>
        <div class="media-type">Video</div>
      </div>
      <div class="media-actions">
        <a href="${v.url}" target="_blank" class="btn-view">▶ Play</a>
        <button class="btn-delete" data-idx="${i}" data-type="video">🗑 Delete</button>
      </div>`;
    list.appendChild(item);
  });
  list.querySelectorAll(".btn-delete[data-type='video']").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      videoIntros.splice(idx, 1);
      renderVideos();
    });
  });
}

/* ──────── Render docs list ──────── */
function renderDocs() {
  const list = document.getElementById("docsList");
  list.innerHTML = "";
  documentVault.forEach((d, i) => {
    if (d._slot) { list.appendChild(d._slot); return; }
    const item = document.createElement("div");
    item.className = "media-item";
    const ext = (d.name || "").split(".").pop().toUpperCase() || "DOC";
    item.innerHTML = `
      <div style="font-size:26px;flex-shrink:0;">📄</div>
      <div class="media-info">
        <div class="media-name">${escHtml(d.name || "Document " + (i+1))}</div>
        <div class="media-type">${ext}</div>
      </div>
      <div class="media-actions">
        <a href="https://docs.google.com/viewer?url=${encodeURIComponent(d.url)}" target="_blank" class="btn-view">👁 View</a>
        <button class="btn-delete" data-idx="${i}" data-type="doc">🗑 Delete</button>
      </div>`;
    list.appendChild(item);
  });
  list.querySelectorAll(".btn-delete[data-type='doc']").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      documentVault.splice(idx, 1);
      renderDocs();
    });
  });
}

/* ──────── Add new video slot ──────── */
function addVideoSlot() {
  if (videoIntros.length >= 10) { showToast("Maximum 10 videos allowed.", "error"); return; }
  const slotId = "vslot_" + Date.now();
  const idx = videoIntros.length;
  videoIntros.push({ url: "", name: "", _uploading: false });

  const slot = document.createElement("div");
  slot.className = "upload-slot";
  slot.id = slotId;
  const statusId = "vstatus_" + slotId;
  slot.innerHTML = `
    <input type="text" placeholder="Video name (e.g. Introduction)" id="vname_${slotId}" />
    <div class="slot-row">
      <input type="file" accept="video/*" id="vfile_${slotId}" style="flex:1;" />
      <span class="upload-status" id="${statusId}">Not uploaded</span>
      <button type="button" class="btn-delete" id="vremove_${slotId}">Remove</button>
    </div>`;

  slot.querySelector(`#vname_${slotId}`).addEventListener("input", e => {
    if (videoIntros[idx]) videoIntros[idx].name = e.target.value;
  });

  slot.querySelector(`#vfile_${slotId}`).addEventListener("change", async e => {
    const file = e.target.files[0]; if (!file) return;
    const statusEl = document.getElementById(statusId);
    statusEl.textContent = "Uploading…"; statusEl.className = "upload-status uploading";
    const url = await uploadFile(file, null, null);
    if (url) {
      if (videoIntros[idx]) videoIntros[idx].url = url;
      statusEl.textContent = "✓ Uploaded"; statusEl.className = "upload-status done";
    } else {
      statusEl.textContent = "Failed"; statusEl.className = "upload-status error";
    }
  });

  slot.querySelector(`#vremove_${slotId}`).addEventListener("click", () => {
    videoIntros.splice(idx, 1);
    slot.remove();
  });

  videoIntros[idx]._slot = slot;
  document.getElementById("videosList").appendChild(slot);
}

/* ──────── Add new doc slot ──────── */
function addDocSlot() {
  if (documentVault.length >= 10) { showToast("Maximum 10 documents allowed.", "error"); return; }
  const slotId = "dslot_" + Date.now();
  const idx = documentVault.length;
  documentVault.push({ url: "", name: "", _uploading: false });

  const slot = document.createElement("div");
  slot.className = "upload-slot";
  slot.id = slotId;
  const statusId = "dstatus_" + slotId;
  slot.innerHTML = `
    <input type="text" placeholder="Document name (e.g. CV, Degree)" id="dname_${slotId}" />
    <div class="slot-row">
      <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" id="dfile_${slotId}" style="flex:1;" />
      <span class="upload-status" id="${statusId}">Not uploaded</span>
      <button type="button" class="btn-delete" id="dremove_${slotId}">Remove</button>
    </div>`;

  slot.querySelector(`#dname_${slotId}`).addEventListener("input", e => {
    if (documentVault[idx]) documentVault[idx].name = e.target.value;
  });

  slot.querySelector(`#dfile_${slotId}`).addEventListener("change", async e => {
    const file = e.target.files[0]; if (!file) return;
    const statusEl = document.getElementById(statusId);
    statusEl.textContent = "Uploading…"; statusEl.className = "upload-status uploading";
    const url = await uploadFile(file, null, null);
    if (url) {
      if (documentVault[idx]) documentVault[idx].url = url;
      statusEl.textContent = "✓ Uploaded"; statusEl.className = "upload-status done";
    } else {
      statusEl.textContent = "Failed"; statusEl.className = "upload-status error";
    }
  });

  slot.querySelector(`#dremove_${slotId}`).addEventListener("click", () => {
    documentVault.splice(idx, 1);
    slot.remove();
  });

  documentVault[idx]._slot = slot;
  document.getElementById("docsList").appendChild(slot);
}

/* ──────── Parse JSON array from DB ──────── */
function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; }
  catch(e) { return []; }
}

function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/* ──────── Populate seeker form ──────── */
function populateSeeker(d) {
  setVal("s_fullName",   d.full_name || "");
  setVal("s_experience", d.religious_importance || "");
  setVal("s_location",   d.country_of_residence || "");
  setVal("s_address",    d.body_type || "");
  setVal("s_skills",     d.skin_color || "");
  setVal("s_bio",        d.religion || "");
  setVal("s_projects",   d.political_views || "");
  setVal("s_referees",   d.children || "");
  setVal("s_education",  d.education || "");

  const major = d.occupation || "";
  setVal("s_majorCategory", major);
  populateSubMajorSelect("s_subMajor", major, d.employment_type || "");

  // Photo
  profilePhotoUrl = d.profile_photo_url || "";
  if (profilePhotoUrl) {
    const wrap = document.getElementById("seekerPhotoPreview");
    wrap.outerHTML = `<img src="${profilePhotoUrl}" class="photo-preview" id="seekerPhotoPreview" alt="Profile photo" />`;
  }

  // Videos
  videoIntros = parseJsonArray(d.liveness_video_url).filter(v => v && v.url);
  renderVideos();

  // Docs
  documentVault = parseJsonArray(d.id_back_url).filter(v => v && v.url);
  renderDocs();

  // Preferences
  const prefMain = parseFirstPref(d.pref_languages);
  setVal("p_industry", prefMain);
  populateSubMajorSelect("p_subIndustry", prefMain, d.pref_country_of_residence || "");
  setVal("p_salary",   d.pref_height || "");
  setVal("p_location", d.pref_living_situation || "");
}

/* ──────── Populate employer form ──────── */
function populateEmployer(d) {
  setVal("e_companyName",    d.full_name || "");
  setVal("e_location",       d.country_of_residence || "");
  setVal("e_bio",            d.religion || "");

  const major = d.occupation || "";
  setVal("e_majorCategory", major);
  populateSubMajorSelect("e_subMajor", major, d.employment_type || "");

  // Logo
  companyLogoUrl = d.profile_photo_url || "";
  if (companyLogoUrl) {
    const wrap = document.getElementById("employerLogoPreview");
    wrap.outerHTML = `<img src="${companyLogoUrl}" style="width:90px;height:90px;border-radius:10px;object-fit:cover;border:3px solid #e8f4ff;" id="employerLogoPreview" alt="Logo" />`;
  }

  // Video
  companyVideoUrl = d.profile_video_url || "";
  const vWrap = document.getElementById("employerVideoPreviewWrap");
  if (companyVideoUrl) {
    vWrap.innerHTML = `<video src="${companyVideoUrl}" controls style="max-width:100%;max-height:180px;border-radius:6px;"></video>`;
  }
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function parseFirstPref(val) {
  if (!val) return "";
  if (Array.isArray(val)) return val[0] || "";
  return String(val).replace(/^\{|\}$/g, "").split(",").map(v => v.trim()).filter(Boolean)[0] || "";
}

/* ──────── Save personal (seeker) ──────── */
async function savePersonalInfo() {
  const btn = document.getElementById("savePersonalBtn");
  btn.disabled = true;
  btn.innerHTML = 'Saving… <span class="inline-spinner"></span>';

  // Strip _slot references before saving
  const cleanVideos = videoIntros.map(v => ({ url: v.url, name: v.name })).filter(v => v.url);
  const cleanDocs   = documentVault.map(d => ({ url: d.url, name: d.name })).filter(d => d.url);

  const major = document.getElementById("s_majorCategory").value;
  const body = {
    full_name:          document.getElementById("s_fullName").value.trim(),
    occupation:         major,
    employment_type:    document.getElementById("s_subMajor").value,
    education:          document.getElementById("s_education").value,
    religion:           document.getElementById("s_bio").value.trim(),
    skin_color:         document.getElementById("s_skills").value.trim(),
    religious_importance: document.getElementById("s_experience").value.trim(),
    political_views:    document.getElementById("s_projects").value.trim(),
    children:           document.getElementById("s_referees").value.trim(),
    country_of_residence: document.getElementById("s_location").value.trim(),
    body_type:          document.getElementById("s_address").value.trim(),
    profile_photo_url:  profilePhotoUrl,
    liveness_video_url: JSON.stringify(cleanVideos),
    id_back_url:        JSON.stringify(cleanDocs)
  };

  try {
    const r = await fetch(`${config.API_BASE_URL}/api/user/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (r.ok && data.success) {
      showToast("Personal info saved!", "success");
    } else {
      showToast(data.message || "Save failed", "error");
    }
  } catch(e) {
    showToast("Network error", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Personal Info";
  }
}

/* ──────── Save preferences (seeker) ──────── */
async function savePreferences() {
  const btn = document.getElementById("savePrefBtn");
  btn.disabled = true;
  btn.innerHTML = 'Saving… <span class="inline-spinner"></span>';

  const main = document.getElementById("p_industry").value;
  const payload = {
    pref_languages:             main ? `{${main}}` : "{}",
    pref_country_of_residence:  document.getElementById("p_subIndustry").value,
    pref_height:                document.getElementById("p_salary").value || null,
    pref_living_situation:      document.getElementById("p_location").value.trim(),
    pref_age_min: 18, pref_age_max: 65
  };

  try {
    const r = await fetch(`${config.API_BASE_URL}/api/user/update-preferences`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (r.ok && data.success) {
      showToast("Preferences saved!", "success");
    } else {
      showToast(data.message || "Save failed", "error");
    }
  } catch(e) {
    showToast("Network error", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Preferences";
  }
}

/* ──────── Save company info (employer) ──────── */
async function saveEmployerInfo() {
  const btn = document.getElementById("saveEmployerBtn");
  btn.disabled = true;
  btn.innerHTML = 'Saving… <span class="inline-spinner"></span>';

  const major = document.getElementById("e_majorCategory").value;
  const body = {
    full_name:           document.getElementById("e_companyName").value.trim(),
    occupation:          major,
    employment_type:     document.getElementById("e_subMajor").value,
    country_of_residence: document.getElementById("e_location").value.trim(),
    religion:            document.getElementById("e_bio").value.trim(),
    profile_photo_url:   companyLogoUrl,
    profile_video_url:   companyVideoUrl
  };

  try {
    const r = await fetch(`${config.API_BASE_URL}/api/user/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (r.ok && data.success) {
      showToast("Company info saved!", "success");
    } else {
      showToast(data.message || "Save failed", "error");
    }
  } catch(e) {
    showToast("Network error", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Company Info";
  }
}

/* ──────── Bootstrap ──────── */
(async () => {
  const token = getToken();
  if (!token) { window.location.href = "login.html"; return; }

  setSpinner(true);

  try {
    const r = await fetch(`${config.API_BASE_URL}/api/user/current-preferences`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) throw new Error("Auth failed");
    const d = await r.json();

    const role = d.orientation || getRoleFromToken();
    localStorage.setItem("userRole", role);

    if (role === "employer") {
      document.getElementById("employerProfile").style.display = "block";
      document.getElementById("pageTitle").textContent = "Company Profile";
      populateEmployer(d);
      setupEmployerHandlers();
    } else {
      document.getElementById("seekerProfile").style.display = "block";
      populateSeeker(d);
      setupSeekerHandlers();
    }
  } catch(e) {
    showToast("Failed to load profile. Please try again.", "error");
    console.error(e);
  } finally {
    setSpinner(false);
  }
})();

/* ──────── Event wiring ──────── */
function setupSeekerHandlers() {
  // Cascade major → sub
  document.getElementById("s_majorCategory").addEventListener("change", e => {
    populateSubMajorSelect("s_subMajor", e.target.value, "");
  });
  document.getElementById("p_industry").addEventListener("change", e => {
    populateSubMajorSelect("p_subIndustry", e.target.value, "");
  });

  // Photo upload
  document.getElementById("seekerPhotoInput").addEventListener("change", async e => {
    const file = e.target.files[0]; if (!file) return;
    const url = await uploadFile(file, "photoProgressBar", "photoProgressWrap");
    if (url) {
      profilePhotoUrl = url;
      const old = document.getElementById("seekerPhotoPreview");
      if (old.tagName === "DIV") {
        old.outerHTML = `<img src="${url}" class="photo-preview" id="seekerPhotoPreview" alt="Profile photo" />`;
      } else {
        old.src = url;
      }
      showToast("Photo uploaded!");
    }
  });

  // Videos
  document.getElementById("addVideoBtn").addEventListener("click", addVideoSlot);
  // Docs
  document.getElementById("addDocBtn").addEventListener("click", addDocSlot);

  // Save buttons
  document.getElementById("savePersonalBtn").addEventListener("click", savePersonalInfo);
  document.getElementById("savePrefBtn").addEventListener("click", savePreferences);
}

function setupEmployerHandlers() {
  // Cascade
  document.getElementById("e_majorCategory").addEventListener("change", e => {
    populateSubMajorSelect("e_subMajor", e.target.value, "");
  });

  // Logo upload
  document.getElementById("employerLogoInput").addEventListener("change", async e => {
    const file = e.target.files[0]; if (!file) return;
    const url = await uploadFile(file, "logoProgressBar", "logoProgressWrap");
    if (url) {
      companyLogoUrl = url;
      const old = document.getElementById("employerLogoPreview");
      if (old.tagName === "DIV") {
        old.outerHTML = `<img src="${url}" style="width:90px;height:90px;border-radius:10px;object-fit:cover;border:3px solid #e8f4ff;" id="employerLogoPreview" alt="Logo" />`;
      } else {
        old.src = url;
      }
      showToast("Logo uploaded!");
    }
  });

  // Company video upload
  document.getElementById("employerVideoInput").addEventListener("change", async e => {
    const file = e.target.files[0]; if (!file) return;
    const url = await uploadFile(file, "videoProgressBar", "videoProgressWrap");
    if (url) {
      companyVideoUrl = url;
      document.getElementById("employerVideoPreviewWrap").innerHTML =
        `<video src="${url}" controls style="max-width:100%;max-height:180px;border-radius:6px;"></video>`;
      showToast("Video uploaded!");
    }
  });

  // Save
  document.getElementById("saveEmployerBtn").addEventListener("click", saveEmployerInfo);
}
