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

  // Dismiss all current activation notifications so the dashboard banner/badge clears
  try {
    const countRes = await fetch(`${config.API_BASE_URL}/api/messages/unread-count`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (countRes.ok) {
      const countData = await countRes.json();
      const activations = countData.activation_details || [];
      if (activations.length > 0) {
        let dismissed = JSON.parse(localStorage.getItem('dismissedActivations') || '[]');
        activations.forEach(a => { if (!dismissed.includes(a.employer_id)) dismissed.push(a.employer_id); });
        localStorage.setItem('dismissedActivations', JSON.stringify(dismissed));
      }
    }
  } catch (e) {}

  await loadConversations();

  // Refresh every 15 s when the tab is active
  setInterval(() => { if (!document.hidden) loadConversations(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadConversations(); });
});

async function loadConversations() {
  const token = localStorage.getItem('token');
  const loadingBox = document.getElementById('loadingBox');
  const convList   = document.getElementById('convList');
  const emptyBox   = document.getElementById('emptyBox');

  try {
    const res = await fetch(`${config.API_BASE_URL}/api/messages/conversations`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Request failed');
    const data = await res.json();
    const convs = data.conversations || [];

    loadingBox.style.display = 'none';

    if (convs.length === 0) {
      convList.style.display = 'none';
      emptyBox.style.display = 'block';
      return;
    }

    emptyBox.style.display = 'none';
    convList.style.display = 'block';
    convList.innerHTML = '';

    let totalUnread = 0;

    convs.forEach(conv => {
      totalUnread += conv.unread_count || 0;

      const item = document.createElement('a');
      item.className = 'conv-item' + (conv.unread_count > 0 ? ' unread' : '');
      item.href = `chat.html?user=${conv.user_id}&name=${encodeURIComponent(conv.user_name || '')}`;

      const avatarSrc = conv.profile_photo_url || '';
      const initials  = (conv.user_name || '?').charAt(0).toUpperCase();

      const timeStr = conv.last_message_time
        ? formatTime(new Date(conv.last_message_time))
        : '';

      const preview = conv.last_message
        ? (conv.is_last_message_mine ? 'You: ' : '') + conv.last_message
        : 'Start a conversation…';

      item.innerHTML = `
        <div class="conv-avatar">
          ${avatarSrc
            ? `<img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(conv.user_name)}"
                    onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : ''}
          <div style="
            width:46px;height:46px;border-radius:50%;background:#dbe4f0;
            display:${avatarSrc ? 'none' : 'flex'};align-items:center;justify-content:center;
            font-weight:700;font-size:17px;color:#4a6fa5;">
            ${initials}
          </div>
        </div>
        <div class="conv-body">
          <div class="conv-name">${escapeHtml(conv.user_name || 'Unknown')}</div>
          <div class="conv-preview">${escapeHtml(preview)}</div>
        </div>
        <div class="conv-meta">
          <span class="conv-time">${timeStr}</span>
          ${conv.unread_count > 0
            ? `<span class="conv-unread-count">${conv.unread_count}</span>`
            : ''}
        </div>`;

      convList.appendChild(item);
    });

    const badge = document.getElementById('unreadTotalBadge');
    if (totalUnread > 0) {
      badge.textContent = `${totalUnread} unread`;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }

  } catch (err) {
    console.error('Error loading conversations:', err);
    document.getElementById('loadingBox').style.display = 'none';
    document.getElementById('emptyBox').style.display = 'block';
  }
}

function formatTime(date) {
  const now  = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
