
function extractField(raw) {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) return raw.find(v => v && String(v).trim()) || null;
  const s = String(raw).trim();
  if (!s || s === 'null' || s === '[]') return null;
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.find(v => v && String(v).trim()) || null;
    } catch (e) {}
  }
  return s;
}

function extractPhotoUrl(raw) {
  return extractField(raw) || null;
}

function extractJsonArray(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const first = raw.find(v => v && typeof v === 'object');
    return first ? raw : null;
  }
  const s = String(raw).trim();
  if (!s || s === '[]' || s === 'null') return null;
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch (e) {}
  }
  return null;
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const token = localStorage.getItem("admin_token");
const userId = new URLSearchParams(window.location.search).get("id");

const userInfoContainer = document.getElementById("userInfo");
const adminMessageInput = document.getElementById("adminMessage");
const approveBtn = document.getElementById("approveBtn");
const disapproveBtn = document.getElementById("disapproveBtn");
const statusText = document.getElementById("updateStatusText");

if (!token) {
  alert("Access denied. Please login.");
  window.location.href = "admin-login.html";
}

async function loadUser() {
  try {
    const res = await fetch(`${config.API_BASE_URL}/api/admin/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      if (res.status === 401) {
        alert("Session expired. Please login again.");
        window.location.href = "admin-login.html";
        return;
      }
      userInfoContainer.innerHTML = `❌ Error: ${res.status} - ${res.statusText}`;
      return;
    }

    const data = await res.json();

    if (!data.success || !data.user) {
      userInfoContainer.innerHTML = `❌ ${esc(data.message || "User not found")}`;
      return;
    }

    const user = data.user;

    const displayName  = extractField(user.full_name) || 'Unnamed User';
    const photoUrl     = extractPhotoUrl(user.profile_photo_url);
    const idFrontUrl   = extractPhotoUrl(user.id_front_url);

    // id_back_url may be a JSON array of document objects [{url, name}]
    const docVault = extractJsonArray(user.id_back_url);
    // liveness_video_url may be a JSON array of video objects [{url, name}]
    const videoList = extractJsonArray(user.liveness_video_url);
    const singleVideo = !videoList ? extractField(user.liveness_video_url) : null;

    // Build id_front section
    let idFrontHtml = idFrontUrl
      ? `<img src="${esc(idFrontUrl)}" alt="ID Front" style="max-width:400px;height:auto;"
             onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='block';" />
         <p style="display:none;color:red;">Image failed to load</p>`
      : '<p>No ID front image</p>';

    // Build id_back / documents section
    let idBackHtml = '';
    if (docVault && docVault.length > 0) {
      idBackHtml = docVault.map(doc => {
        const docUrl = doc.url || extractField(doc) || '';
        const docName = doc.name || 'Document';
        if (!docUrl) return '';
        const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(docUrl);
        return isImage
          ? `<div style="margin-bottom:10px;">
               <p style="font-size:13px;color:#555;margin-bottom:4px;">${esc(docName)}</p>
               <img src="${esc(docUrl)}" alt="${esc(docName)}" style="max-width:400px;height:auto;"
                    onerror="this.onerror=null;this.style.display='none';" />
             </div>`
          : `<p><a href="${esc(docUrl)}" target="_blank">📄 ${esc(docName)}</a></p>`;
      }).join('');
    } else {
      const singleDoc = extractPhotoUrl(user.id_back_url);
      idBackHtml = singleDoc
        ? `<img src="${esc(singleDoc)}" alt="ID Back" style="max-width:400px;height:auto;"
               onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='block';" />
           <p style="display:none;color:red;">Image failed to load</p>`
        : '<p>No ID back image</p>';
    }

    // Build liveness video section
    let videoHtml = '';
    if (videoList && videoList.length > 0) {
      videoHtml = videoList.map(v => {
        const vUrl = v.url || extractField(v) || '';
        const vName = v.name || 'Video';
        return vUrl ? `<div style="margin-bottom:10px;">
          <p style="font-size:13px;color:#555;margin-bottom:4px;">${esc(vName)}</p>
          <video src="${esc(vUrl)}" controls style="max-width:400px;height:auto;"
                 onerror="this.onerror=null;this.style.display='none';"></video>
        </div>` : '';
      }).join('');
    } else if (singleVideo) {
      videoHtml = `<video src="${esc(singleVideo)}" controls style="max-width:400px;height:auto;"
                          onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='block';"></video>
                   <p style="display:none;color:red;">Video failed to load</p>`;
    } else {
      videoHtml = '<p>No liveness video</p>';
    }

    // Build profile photo section
    let photoHtml = photoUrl
      ? `<img src="${esc(photoUrl)}" alt="Profile Photo" style="max-width:200px;height:auto;border-radius:8px;"
             onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='block';" />
         <p style="display:none;color:red;">Image failed to load</p>
         <p style="font-size:12px;color:#888;margin-top:4px;">URL: ${esc(photoUrl)}</p>`
      : '<p>No profile photo uploaded</p>';

    const liveness = user.liveness_instructions;
    let livenessText = 'Look up, Look left, Look right, Smile, Open your mouth';
    if (liveness) {
      livenessText = Array.isArray(liveness) ? liveness.join(', ') : String(liveness);
    }

    userInfoContainer.innerHTML = `
      <h3>${esc(displayName)}</h3>
      <p><strong>Email:</strong> ${esc(user.email)}</p>
      <p><strong>Status:</strong> ${esc(user.status || 'pending')}</p>
      <p><strong>User ID:</strong> ${esc(String(user.id))}</p>
      <p><strong>National ID Number:</strong> ${esc(user.national_id_number || '—')}</p>

      <h4>ID Front</h4>
      ${idFrontHtml}

      <h4>ID Back / Documents</h4>
      ${idBackHtml}

      <h4>Liveness Video</h4>
      <p><strong>Instructions followed during recording:</strong> ${esc(livenessText)}</p>
      ${videoHtml}

      <h4>Profile Photo</h4>
      ${photoHtml}
    `;
  } catch (err) {
    userInfoContainer.innerHTML = "⚠️ Error loading user.";
    console.error(err);
  }
}

async function updateStatus(newStatus) {
  try {
    const message = adminMessageInput.value.trim();
    if (!message) {
      alert("❌ Please enter a message to send to the user.");
      return;
    }

    const res = await fetch(`${config.API_BASE_URL}/api/admin/user/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ userId, status: newStatus, adminMessage: message })
    });

    const data = await res.json();

    if (res.ok) {
      if (newStatus === "approved") {
        statusText.innerHTML = `✅ User approved! User will be redirected to dashboard on next login.`;
        statusText.style.color = "#2ecc71";
      } else {
        statusText.innerHTML = `❌ User disapproved! User will see submission page with "Upload Again" button on next login.`;
        statusText.style.color = "#e74c3c";
      }
      approveBtn.disabled = true;
      disapproveBtn.disabled = true;
      adminMessageInput.disabled = true;
    } else {
      statusText.textContent = `❌ Error: ${data.message}`;
      statusText.style.color = "#e74c3c";
    }
  } catch (err) {
    statusText.textContent = "❌ Server error";
    statusText.style.color = "#e74c3c";
    console.error(err);
  }
}

async function triggerReset(endpoint) {
  try {
    const res = await fetch(`${config.API_BASE_URL}/api/user/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ Reset failed:`, errorText);
      alert(`❌ Reset failed: ${res.status} - ${res.statusText}`);
      return;
    }

    const data = await res.json();
    if (!data.success) {
      alert("❌ Reset failed: " + (data.message || "Unknown error"));
    } else {
      alert(`✅ ${endpoint} completed successfully`);
    }
  } catch (err) {
    console.error(`❌ Error triggering ${endpoint}:`, err);
    alert(`❌ Error: ${err.message}`);
  }
}

approveBtn.addEventListener("click", () => updateStatus("approved"));
disapproveBtn.addEventListener("click", () => updateStatus("disapproved"));

loadUser();
