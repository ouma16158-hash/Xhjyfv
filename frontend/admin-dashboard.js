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

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const token = localStorage.getItem("admin_token");

if (!token) {
  alert("Access denied. Please login as admin.");
  window.location.href = "admin-login.html";
}

// Show admin email in top bar
try {
  const payload = JSON.parse(atob(token.split('.')[1]));
  const el = document.getElementById('adminEmailLabel');
  if (el) el.textContent = payload.email || '';
} catch(e) {}

// All loaded users (for search filter)
let allUsers = [];

(async () => {
  try {
    await Promise.all([
      loadUsers(),
      loadNotificationCounts(),
      loadDashboardStats(),
      loadLandingImages()
    ]);
  } catch (err) {
    console.error("Dashboard error:", err.message);
  }
})();

async function loadUsers() {
  try {
    const res = await fetch(`${config.API_BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();

    if (res.ok && Array.isArray(data.users)) {
      allUsers = data.users;
      renderUsers(allUsers);
    } else {
      document.getElementById("userTableBody").innerHTML =
        `<tr class="no-results-row"><td colspan="6">No users found.</td></tr>`;
    }
  } catch (err) {
    console.error("Load users error:", err.message);
    document.getElementById("userTableBody").innerHTML =
      `<tr class="no-results-row"><td colspan="6">Error loading users.</td></tr>`;
  }
}

function renderUsers(users) {
  const tableBody = document.getElementById("userTableBody");
  if (!users.length) {
    tableBody.innerHTML = `<tr class="no-results-row"><td colspan="6">No users match your search.</td></tr>`;
    return;
  }

  tableBody.innerHTML = '';
  users.forEach(user => {
    const displayName = extractField(user.full_name) || '—';
    const manualEnabled = user.smoking === 'manual_enabled';
    const row = document.createElement("tr");

    const isSuspended = user.status === 'suspended';
    row.innerHTML = `
      <td><strong style="color:#0f172a;">${esc(displayName)}</strong></td>
      <td style="color:#64748b;font-size:0.83rem;">${esc(user.email)}</td>
      <td>
        <span class="status-badge status-${user.status || 'pending'}">
          ${esc((user.status || 'pending'))}
        </span>
      </td>
      <td>
        <span class="subscription-badge subscription-${user.subscription || 'free'}">
          ${esc((user.subscription || 'free'))}
        </span>
      </td>
      <td style="color:#94a3b8;font-size:0.82rem;">${new Date(user.created_at).toLocaleDateString()}</td>
      <td>
        <button class="admin-action-btn view-btn"    data-id="${esc(String(user.id))}">View</button>
        <button class="admin-action-btn premium-btn manage-btn"
          data-email="${esc(user.email)}" data-name="${esc(displayName)}">Premium</button>
        <button class="admin-action-btn manual-btn ${manualEnabled ? 'active' : ''}"
          data-email="${esc(user.email)}" data-enabled="${manualEnabled ? '1' : '0'}"
          title="${manualEnabled ? 'Disable manual payment' : 'Enable manual payment'}">
          ${manualEnabled ? '✓ Manual ON' : 'Manual Pay'}
        </button>
        <button class="admin-action-btn message-btn"
          data-email="${esc(user.email)}" data-name="${esc(displayName)}">Message</button>
        <button class="admin-action-btn ${isSuspended ? 'restore-btn' : 'suspend-btn'}"
          data-id="${esc(String(user.id))}" data-email="${esc(user.email)}" data-name="${esc(displayName)}">
          ${isSuspended ? 'Restore' : 'Suspend'}
        </button>
        <button class="admin-action-btn delete-user-btn"
          data-id="${esc(String(user.id))}" data-email="${esc(user.email)}" data-name="${esc(displayName)}">
          Delete
        </button>
      </td>
    `;

    row.querySelector('.view-btn').addEventListener('click', function() {
      viewUser(this.dataset.id);
    });
    row.querySelector('.manage-btn').addEventListener('click', function() {
      managePremium(this.dataset.email, this.dataset.name);
    });
    row.querySelector('.manual-btn').addEventListener('click', function() {
      toggleManualPayment(this.dataset.email, this.dataset.enabled === '1', this);
    });
    row.querySelector('.message-btn').addEventListener('click', function() {
      openMsgModal(this.dataset.email, this.dataset.name);
    });
    row.querySelector('.suspend-btn, .restore-btn')?.addEventListener('click', function() {
      const isSusp = this.classList.contains('restore-btn');
      if (isSusp) restoreUser(this.dataset.id, this.dataset.email, this.dataset.name);
      else openSuspendModal(this.dataset.id, this.dataset.email, this.dataset.name);
    });
    row.querySelector('.delete-user-btn').addEventListener('click', function() {
      deleteUser(this.dataset.id, this.dataset.email, this.dataset.name);
    });

    tableBody.appendChild(row);
  });
}

// ── Search / filter ──
function filterUsers(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    renderUsers(allUsers);
    return;
  }
  const filtered = allUsers.filter(u =>
    (u.email || '').toLowerCase().includes(q) ||
    (extractField(u.full_name) || '').toLowerCase().includes(q)
  );
  renderUsers(filtered);
}

async function loadNotificationCounts() {
  try {
    const [mediaRes, premiumRes] = await Promise.all([
      fetch(`${config.API_BASE_URL}/api/admin/media-updates/stats`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${config.API_BASE_URL}/api/admin/premium-approvals/stats`, { headers: { Authorization: `Bearer ${token}` } })
    ]);

    if (mediaRes.ok) {
      const s = await mediaRes.json();
      if ((s.pending || 0) > 0) {
        const b = document.getElementById('mediaUpdatesBadge');
        if (b) { b.textContent = s.pending; b.style.display = 'inline-block'; }
      }
    }
    if (premiumRes.ok) {
      const s = await premiumRes.json();
      if ((s.pending || 0) > 0) {
        const b = document.getElementById('premiumApprovalsBadge');
        if (b) { b.textContent = s.pending; b.style.display = 'inline-block'; }
      }
    }
  } catch (e) { console.error('Notification counts error:', e); }
}

async function loadDashboardStats() {
  try {
    const res = await fetch(`${config.API_BASE_URL}/api/admin/dashboard-stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const s = await res.json();
      document.getElementById('totalUsers').textContent   = s.totalUsers   || 0;
      document.getElementById('pendingMedia').textContent = s.pendingMedia  || 0;
      document.getElementById('pendingPremium').textContent = s.pendingPremium || 0;
      document.getElementById('activePremium').textContent  = s.activePremium  || 0;
    }
  } catch (e) { console.error('Stats error:', e); }
}

function viewUser(userId) {
  window.location.href = `admin-user-view.html?id=${userId}`;
}

function managePremium(email, name) {
  window.location.href = `admin-premium-manager.html?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`;
}

// ── Toggle Manual Payment ──
async function toggleManualPayment(email, currentlyEnabled, btn) {
  const newState = !currentlyEnabled;
  try {
    const res = await fetch(`${config.API_BASE_URL}/api/admin/toggle-manual-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email, enabled: newState })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      btn.dataset.enabled = newState ? '1' : '0';
      btn.textContent = newState ? '✓ Manual ON' : 'Manual Pay';
      btn.className = `admin-action-btn manual-btn${newState ? ' active' : ''}`;
      // Also update allUsers in memory so search doesn't revert the UI
      const u = allUsers.find(x => x.email === email);
      if (u) u.smoking = newState ? 'manual_enabled' : null;
      showToast(newState ? `Manual payment enabled for ${email}` : `Manual payment disabled for ${email}`);
    } else {
      showToast('Error: ' + (data.message || 'Failed'), true);
    }
  } catch (e) {
    showToast('Network error', true);
  }
}

// ── Message Modal ──
let msgTargetEmail = '';

function openMsgModal(email, name) {
  msgTargetEmail = email;
  document.getElementById('msgRecipient').textContent = `To: ${name} <${email}>`;
  document.getElementById('msgText').value = '';
  document.getElementById('msgModal').classList.add('open');
}

function closeMsgModal() {
  document.getElementById('msgModal').classList.remove('open');
  msgTargetEmail = '';
}

async function sendUserMessage() {
  const message = document.getElementById('msgText').value.trim();
  if (!message) { showToast('Please type a message first.', true); return; }

  const btn = document.querySelector('.msg-send-btn');
  btn.disabled = true; btn.textContent = 'Sending…';

  try {
    const res = await fetch(`${config.API_BASE_URL}/api/admin/send-user-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: msgTargetEmail, message })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      closeMsgModal();
      showToast('Message sent successfully!');
    } else {
      showToast('Failed: ' + (data.message || 'Unknown error'), true);
    }
  } catch (e) {
    showToast('Network error', true);
  } finally {
    btn.disabled = false; btn.textContent = 'Send';
  }
}

// ── Suspend Modal ──
let suspendTargetId = '', suspendTargetEmail = '', suspendTargetName = '';

function openSuspendModal(id, email, name) {
  suspendTargetId = id; suspendTargetEmail = email; suspendTargetName = name;
  document.getElementById('suspendUserLabel').textContent = `${name} <${email}>`;
  document.getElementById('suspendReason').value = '';
  document.getElementById('suspendModal').classList.add('open');
}

function closeSuspendModal() {
  document.getElementById('suspendModal').classList.remove('open');
  suspendTargetId = ''; suspendTargetEmail = ''; suspendTargetName = '';
}

async function confirmSuspend() {
  const reason = document.getElementById('suspendReason').value.trim();
  const btn = document.querySelector('.suspend-confirm-btn');
  btn.disabled = true; btn.textContent = 'Suspending…';
  try {
    const res = await fetch(`${config.API_BASE_URL}/api/admin/users/${suspendTargetId}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      closeSuspendModal();
      showToast(`Account suspended: ${suspendTargetEmail}`);
      const u = allUsers.find(x => String(x.id) === String(suspendTargetId));
      if (u) u.status = 'suspended';
      renderUsers(allUsers);
    } else {
      showToast('Error: ' + (data.message || 'Failed'), true);
    }
  } catch(e) { showToast('Network error', true); }
  finally { btn.disabled = false; btn.textContent = 'Suspend Account'; }
}

async function restoreUser(id, email, name) {
  if (!confirm(`Restore account for ${name} (${email})?`)) return;
  try {
    const res = await fetch(`${config.API_BASE_URL}/api/admin/users/${id}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`Account restored: ${email}`);
      const u = allUsers.find(x => String(x.id) === String(id));
      if (u) u.status = 'approved';
      renderUsers(allUsers);
    } else {
      showToast('Error: ' + (data.message || 'Failed'), true);
    }
  } catch(e) { showToast('Network error', true); }
}

async function deleteUser(id, email, name) {
  if (!confirm(`⚠️ PERMANENTLY delete the account of ${name} (${email})?\n\nThis will erase ALL their data including jobs, applications, messages and cannot be undone.`)) return;
  try {
    const res = await fetch(`${config.API_BASE_URL}/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`Account deleted: ${email}`);
      allUsers = allUsers.filter(x => String(x.id) !== String(id));
      renderUsers(allUsers);
    } else {
      showToast('Error: ' + (data.message || 'Failed'), true);
    }
  } catch(e) { showToast('Network error', true); }
}

// ── Landing Images ──
async function loadLandingImages() {
  try {
    const res = await fetch(`${config.API_BASE_URL}/api/public/landing-images`);
    const data = await res.json();
    renderLandingImages(data.images || []);
  } catch (e) {
    document.getElementById('landingImgGrid').innerHTML =
      '<p class="no-photos-msg">Could not load images.</p>';
  }
}

function renderLandingImages(images) {
  const grid = document.getElementById('landingImgGrid');
  if (!images.length) {
    grid.innerHTML = '<p class="no-photos-msg">No photos uploaded yet.</p>';
    return;
  }
  grid.innerHTML = '';
  images.forEach((img, i) => {
    const item = document.createElement('div');
    item.className = 'landing-img-item';
    item.dataset.imgId = img.id;

    const image = document.createElement('img');
    image.src = img.url;
    image.alt = 'Landing photo';
    image.loading = 'lazy';

    const delBtn = document.createElement('button');
    delBtn.className = 'landing-img-del';
    delBtn.title = 'Remove photo';
    delBtn.textContent = '\u2715';
    delBtn.addEventListener('click', () => deleteLandingImage(img.id));

    item.appendChild(image);
    item.appendChild(delBtn);
    grid.appendChild(item);
  });
}

async function uploadLandingImage() {
  const fileInput = document.getElementById('landingImageFile');
  const file = fileInput.files[0];
  if (!file) { showToast('Please select an image file first.', true); return; }

  const btn = document.querySelector('.landing-upload-btn');
  btn.disabled = true; btn.textContent = 'Uploading…';

  try {
    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch(`${config.API_BASE_URL}/api/admin/landing-images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.success) {
      fileInput.value = '';
      await loadLandingImages();
      showToast('Photo uploaded!');
    } else {
      showToast('Upload failed: ' + (data.message || 'Unknown error'), true);
    }
  } catch (e) {
    showToast('Network error during upload', true);
  } finally {
    btn.disabled = false; btn.textContent = 'Upload Photo';
  }
}

async function deleteLandingImage(id) {
  if (!confirm('Remove this photo from the landing page?')) return;
  try {
    const res = await fetch(`${config.API_BASE_URL}/api/admin/landing-images/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      await loadLandingImages();
      showToast('Photo removed.');
    } else {
      showToast('Delete failed: ' + (data.message || 'Unknown error'), true);
    }
  } catch (e) {
    showToast('Network error', true);
  }
}

// ── Helpers ──
function showToast(msg, isError = false) {
  const t = document.getElementById('adminToast');
  t.textContent = msg;
  t.style.background = isError ? '#dc3545' : '#0f172a';
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 4000);
}

function logout() {
  localStorage.removeItem('admin_token');
  window.location.href = 'admin-login.html';
}

document.getElementById('msgModal').addEventListener('click', function(e) {
  if (e.target === this) closeMsgModal();
});

setInterval(loadNotificationCounts, 30000);
