// ── State ──
let _adminToken = null;
let _currentStatus = 'pending';

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => {
    _adminToken = localStorage.getItem('admin_token');
    if (!_adminToken) {
        window.location.href = 'admin-login.html';
        return;
    }
    try {
        const payload = JSON.parse(atob(_adminToken.split('.')[1]));
        const el = document.getElementById('adminEmailLabel');
        if (el) el.textContent = payload.email || '';
    } catch(e) {}
    loadSubscriptions();
    loadStats();
});

// ── Filter switch (called by onclick on buttons) ──
window.switchFilter = function(status) {
    _currentStatus = status;
    document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.status === status);
    });
    loadSubscriptions();
};

// ── Load subscriptions list ──
function loadSubscriptions() {
    const container = document.getElementById('subscriptionsContainer');
    if (!container) return;
    container.innerHTML = '<p style="color:#888;padding:20px;">Loading…</p>';

    fetch(`${config.API_BASE_URL}/api/admin/premium-subscriptions?status=${_currentStatus}`, {
        headers: { Authorization: `Bearer ${_adminToken}` }
    })
    .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
    .then(data => renderSubscriptions(Array.isArray(data) ? data : []))
    .catch(err => {
        console.error('Load subscriptions error:', err);
        container.innerHTML = `<p style="color:#c0392b;padding:20px;">Error: ${err.message || 'Failed to load. Check connection.'}</p>`;
    });
}

// ── Load stats ──
function loadStats() {
    fetch(`${config.API_BASE_URL}/api/admin/premium-approvals/stats`, {
        headers: { Authorization: `Bearer ${_adminToken}` }
    })
    .then(r => r.ok ? r.json() : null)
    .then(stats => {
        if (!stats) return;
        const pe = document.getElementById('pendingCount');
        const ae = document.getElementById('approvedCount');
        const re = document.getElementById('rejectedCount');
        if (pe) pe.textContent = stats.pending  || 0;
        if (ae) ae.textContent = stats.approved || 0;
        if (re) re.textContent = stats.rejected || 0;
    })
    .catch(e => console.error('Stats error:', e));
}

// ── Render list ──
function renderSubscriptions(subscriptions) {
    const container = document.getElementById('subscriptionsContainer');
    if (!container) return;

    if (!subscriptions.length) {
        container.innerHTML = `<p style="color:#888;padding:20px;text-align:center;">No ${_currentStatus} subscription requests found.</p>`;
        return;
    }

    container.innerHTML = subscriptions.map(sub => {
        const requestedDate = sub.requested_at ? new Date(sub.requested_at).toLocaleString() : 'N/A';
        const reviewedDate  = sub.reviewed_at  ? new Date(sub.reviewed_at).toLocaleString()  : null;
        const paymentMethod = (sub.payment_method || 'manual').toUpperCase();
        const isManual = !sub.payment_method
            || sub.payment_method.toLowerCase().includes('manual')
            || sub.payment_method.toLowerCase().includes('mpesa')
            || sub.payment_method.toLowerCase().includes('bank');
        const isPending = sub.status === 'pending';

        const proofHtml = sub.payment_proof_url
            ? `<div style="margin-top:12px;">
                <p style="font-weight:700;font-size:13px;color:#444;margin-bottom:8px;">📸 Payment Screenshot</p>
                <a href="${sub.payment_proof_url}" target="_blank" rel="noopener">
                  <img src="${sub.payment_proof_url}" alt="Payment Proof"
                       style="max-width:100%;max-height:300px;border-radius:8px;border:2px solid #e0ecff;display:block;cursor:pointer;"
                       onerror="this.style.display='none';this.nextElementSibling.style.display='block';" />
                  <span style="display:none;color:#c0392b;font-size:13px;">Image failed to load — <a href="${sub.payment_proof_url}" target="_blank">open directly</a></span>
                </a>
                <a href="${sub.payment_proof_url}" target="_blank" rel="noopener"
                   style="display:inline-block;margin-top:6px;font-size:12px;color:#0984e3;">Open full image ↗</a>
               </div>`
            : `<p style="color:#888;font-size:13px;margin-top:8px;">No screenshot uploaded.</p>`;

        const adminMsgDisplay = sub.admin_message
            ? `<div style="background:#fffbea;border-left:3px solid #f39c12;padding:10px 14px;border-radius:4px;margin-top:12px;font-size:13px;">
                <strong>Admin Message:</strong> ${sub.admin_message}
               </div>`
            : '';

        const actionsHtml = isPending
            ? `<div style="margin-top:16px;">
                <textarea id="msg-${sub.id}" placeholder="Optional message to user (sent by email)…"
                          style="width:100%;padding:10px;border:1.5px solid #d0dce8;border-radius:6px;font-size:13px;resize:vertical;min-height:70px;margin-bottom:10px;box-sizing:border-box;"></textarea>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                  <button id="approve-btn-${sub.id}" onclick="reviewSubscription(${sub.id}, 'approved', 'approve-btn-${sub.id}')"
                          style="flex:1;min-width:140px;padding:12px 16px;background:linear-gradient(135deg,#00b894,#00cec9);color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;">
                    ✅ Activate Premium
                  </button>
                  <button id="reject-btn-${sub.id}" onclick="reviewSubscription(${sub.id}, 'rejected', 'reject-btn-${sub.id}')"
                          style="flex:1;min-width:140px;padding:12px 16px;background:linear-gradient(135deg,#d63031,#e17055);color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;">
                    ❌ Disapprove
                  </button>
                </div>
               </div>`
            : '';

        const borderColor = sub.status === 'approved' ? '#00b894' : sub.status === 'rejected' ? '#d63031' : '#007bff';
        const badgeBg    = sub.status === 'approved' ? '#d4edda' : sub.status === 'rejected' ? '#f8d7da' : '#cce5ff';
        const badgeColor = sub.status === 'approved' ? '#155724' : sub.status === 'rejected' ? '#721c24' : '#004085';

        return `
        <div style="background:#fff;border-radius:10px;padding:20px 22px;margin-bottom:16px;box-shadow:0 2px 10px rgba(0,0,0,0.08);border-left:4px solid ${borderColor};">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
            <div>
              <h3 style="font-size:16px;font-weight:700;color:#222;margin-bottom:6px;">${sub.user_email || 'Unknown User'}</h3>
              <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:13px;color:#555;">
                <span>📋 Plan: <strong>${sub.plan || 'Premium'}</strong></span>
                <span>💰 Amount: <strong>${sub.amount ? '$' + sub.amount : 'N/A'}</strong></span>
                <span>💳 Method: <strong style="color:${isManual ? '#6c5ce7' : '#007bff'};">${paymentMethod}</strong></span>
                <span>📅 Requested: <strong>${requestedDate}</strong></span>
                ${reviewedDate ? `<span>✅ Reviewed: <strong>${reviewedDate}</strong></span>` : ''}
              </div>
            </div>
            <span style="padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;background:${badgeBg};color:${badgeColor};">
              ${(sub.status || 'pending').toUpperCase()}
            </span>
          </div>

          <div style="margin-top:14px;padding:12px;background:#f8fbff;border-radius:8px;border:1px solid #e0ecff;">
            <p style="font-weight:700;font-size:13px;color:#444;margin-bottom:8px;">📞 Payment Details</p>
            <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:13px;color:#333;">
              ${sub.phone_number ? `<span>📱 Phone: <strong>${sub.phone_number}</strong></span>` : '<span style="color:#aaa;">No phone number</span>'}
              ${sub.transaction_reference ? `<span>🔖 Ref: <strong>${sub.transaction_reference}</strong></span>` : ''}
            </div>
            ${proofHtml}
          </div>

          ${adminMsgDisplay}
          ${actionsHtml}
        </div>`;
    }).join('');
}

// ── Review action (Activate / Disapprove) ──
window.reviewSubscription = function(subscriptionId, status, btnId) {
    const btn = btnId ? document.getElementById(btnId) : null;
    const originalText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = status === 'approved' ? 'Activating…' : 'Disapproving…'; }

    const msgEl = document.getElementById(`msg-${subscriptionId}`);
    const adminMessage = msgEl ? msgEl.value.trim() : '';

    fetch(`${config.API_BASE_URL}/api/admin/premium-subscriptions/review`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${_adminToken}`
        },
        body: JSON.stringify({ subscriptionId, status, adminMessage })
    })
    .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
    .then(() => {
        loadSubscriptions();
        loadStats();
        alert(status === 'approved'
            ? '✅ Premium activated! Email sent to user.'
            : '❌ Request disapproved. User notified by email.');
    })
    .catch(err => {
        console.error('Review error:', err);
        alert('Error: ' + (err.error || err.message || 'Please try again.'));
        if (btn) { btn.disabled = false; btn.textContent = originalText; }
    });
};

// ── Logout ──
window.logout = function() {
    localStorage.removeItem('admin_token');
    window.location.href = 'admin-login.html';
};
