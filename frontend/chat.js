let currentUserId = null;
let currentUserName = null;
let currentUserDbId = null;
let heartbeatInterval = null;
let onlineCheckInterval = null;
let messageRefreshTimeout = null;

document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = 'login.html'; return; }

  // Subscription gate
  try {
    const subRes = await fetch(`${config.API_BASE_URL}/api/user/subscription-status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (subRes.ok) {
      const sub = await subRes.json();
      if (sub.subscription !== 'premium') {
        window.location.href = 'subscriptions.html?reason=no_subscription';
        return;
      }
    }
  } catch (e) {}

  const params = new URLSearchParams(window.location.search);
  currentUserId = params.get('user');
  currentUserName = decodeURIComponent(params.get('name') || '');

  if (!currentUserId) { window.location.href = 'charts.html'; return; }

  await initChatHeader();
  setupInput();
  loadMessages();

  sendHeartbeat();
  heartbeatInterval = setInterval(sendHeartbeat, 20000);

  checkOnlineStatus();
  onlineCheckInterval = setInterval(checkOnlineStatus, 10000);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(heartbeatInterval);
      clearInterval(onlineCheckInterval);
    } else {
      sendHeartbeat();
      checkOnlineStatus();
      heartbeatInterval = setInterval(sendHeartbeat, 20000);
      onlineCheckInterval = setInterval(checkOnlineStatus, 10000);
    }
  });

  window.addEventListener('beforeunload', () => {
    clearInterval(heartbeatInterval);
    clearInterval(onlineCheckInterval);
    if (messageRefreshTimeout) clearTimeout(messageRefreshTimeout);
  });

  // Lightbox
  const avatar = document.getElementById('chatAvatar');
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const closeLightbox = document.getElementById('closeLightbox');

  if (avatar && lightbox) {
    avatar.addEventListener('click', () => {
      lightboxImg.src = avatar.src;
      lightbox.classList.add('open');
    });
    closeLightbox.addEventListener('click', () => lightbox.classList.remove('open'));
    lightbox.addEventListener('click', e => { if (e.target === lightbox) lightbox.classList.remove('open'); });
  }
});

// ── Heartbeat ──────────────────────────────────────────────────────────────────
async function sendHeartbeat() {
  const token = localStorage.getItem('token');
  if (!token) return;
  try {
    await fetch(`${config.API_BASE_URL}/api/user/heartbeat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (e) {}
}

// ── Online status ──────────────────────────────────────────────────────────────
async function checkOnlineStatus() {
  const token = localStorage.getItem('token');
  if (!token || !currentUserId) return;
  try {
    const res = await fetch(`${config.API_BASE_URL}/api/user/online-status/${currentUserId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const dot   = document.getElementById('onlineDot');
    const label = document.getElementById('onlineLabel');
    if (!dot || !label) return;
    if (data.online) {
      dot.className   = 'online-dot online';
      label.textContent = 'Online';
    } else {
      dot.className   = 'online-dot offline';
      if (data.last_seen) {
        const mins = Math.round((Date.now() - data.last_seen) / 60000);
        label.textContent = mins < 2 ? 'Last seen just now' : `Last seen ${mins}m ago`;
      } else {
        label.textContent = 'Offline';
      }
    }
  } catch (e) {}
}

// ── Init header ────────────────────────────────────────────────────────────────
async function initChatHeader() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${config.API_BASE_URL}/api/user?id=${currentUserId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const user = await res.json();

    document.getElementById('chatUserName').textContent =
      user.full_name || currentUserName || 'Unknown';

    const avatar = document.getElementById('chatAvatar');
    let photoUrl = user.profile_photo_url || '';
    if (photoUrl.startsWith('[')) {
      try { const arr = JSON.parse(photoUrl); photoUrl = arr[0] || ''; } catch (e) {}
    }
    if (photoUrl) {
      avatar.src = photoUrl;
      avatar.onerror = () => { avatar.src = `https://via.placeholder.com/38?text=${encodeURIComponent((user.full_name || '?').charAt(0))}`; };
    }
  } catch (e) {}
}

// ── Input wiring ───────────────────────────────────────────────────────────────
function setupInput() {
  const input   = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');

  input.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  sendBtn.addEventListener('click', sendMessage);
}

// ── Send ───────────────────────────────────────────────────────────────────────
async function sendMessage() {
  const input   = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const text    = input.value.trim();
  if (!text) return;

  sendBtn.disabled = true;
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${config.API_BASE_URL}/api/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ receiverId: currentUserId, message: text })
    });
    if (res.ok) {
      appendBubble(text, 'sent', new Date().toISOString());
      input.value = '';
      input.style.height = 'auto';
    } else {
      const err = await res.json().catch(() => ({}));
      alert('Could not send: ' + (err.message || 'Unknown error'));
    }
  } catch (e) {
    alert('Network error. Please try again.');
  } finally {
    sendBtn.disabled = false;
  }
}

// ── Append a single bubble ─────────────────────────────────────────────────────
function appendBubble(text, type, timestamp) {
  const container = document.getElementById('chatMessages');
  const placeholder = container.querySelector('.no-messages');
  if (placeholder) placeholder.remove();

  const wrap = document.createElement('div');
  wrap.className = `message ${type}`;

  const ts  = new Date(timestamp);
  const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = ts.toLocaleDateString([], { month: 'short', day: 'numeric' });

  wrap.innerHTML = `
    <div class="message-bubble">${escapeHtml(text)}</div>
    <div class="message-time">${dateStr} · ${timeStr}</div>`;

  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
}

// ── Load / refresh all messages ────────────────────────────────────────────────
async function loadMessages() {
  try {
    const token = localStorage.getItem('token');

    // Resolve own DB id once
    if (!currentUserDbId) {
      const email = getEmailFromToken();
      if (email) {
        const me = await fetch(`${config.API_BASE_URL}/api/user?email=${email}`, {
          headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.ok ? r.json() : null).catch(() => null);
        if (me) currentUserDbId = me.id;
      }
    }

    const res = await fetch(`${config.API_BASE_URL}/api/messages/conversation/${currentUserId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;

    const data = await res.json();
    const msgs = data.messages || [];
    const container = document.getElementById('chatMessages');
    const atBottom  = container.scrollHeight - container.scrollTop - container.clientHeight < 80;

    container.innerHTML = '';

    if (msgs.length === 0) {
      container.innerHTML = '<p class="no-messages">Start the conversation…</p>';
    } else {
      let lastDate = '';
      msgs.forEach(msg => {
        const isMine = msg.sender_id === currentUserDbId;
        const ts     = new Date(msg.created_at || msg.sent_at);
        const dateKey = ts.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

        if (dateKey !== lastDate) {
          const sep = document.createElement('div');
          sep.className = 'date-sep';
          sep.textContent = dateKey;
          container.appendChild(sep);
          lastDate = dateKey;
        }

        const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        const wrap = document.createElement('div');
        wrap.className = `message ${isMine ? 'sent' : 'received'}`;
        wrap.innerHTML = `
          <div class="message-bubble">${escapeHtml(msg.message)}</div>
          <div class="message-time">${timeStr}</div>`;
        container.appendChild(wrap);
      });

      if (atBottom) container.scrollTop = container.scrollHeight;
    }
  } catch (e) {
    console.error('loadMessages error:', e);
  }

  await markRead();
  messageRefreshTimeout = setTimeout(loadMessages, 3000);
}

async function markRead() {
  try {
    const token = localStorage.getItem('token');
    await fetch(`${config.API_BASE_URL}/api/messages/mark-read/${currentUserId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
  } catch (e) {}
}

function getEmailFromToken() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try { return JSON.parse(atob(token.split('.')[1])).email; } catch (e) { return null; }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
