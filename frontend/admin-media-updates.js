document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
        window.location.href = 'admin-login.html';
        return;
    }

    let currentStatus = 'pending';

    // Load initial data
    await loadMediaUpdates();
    await loadStats();

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentStatus = btn.dataset.status;
            await loadMediaUpdates();
        });
    });

    async function loadMediaUpdates() {
        try {
            const response = await fetch(`${config.API_BASE_URL}/api/admin/media-updates?status=${currentStatus}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load media updates');

            const updates = await response.json();
            renderMediaUpdates(updates);
        } catch (error) {
            console.error('Error loading media updates:', error);
            document.getElementById('mediaUpdatesContainer').innerHTML = '<p>Error loading media updates</p>';
        }
    }

    async function loadStats() {
        try {
            const response = await fetch(`${config.API_BASE_URL}/api/admin/media-updates/stats`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load stats');

            const stats = await response.json();
            document.getElementById('pendingCount').textContent = stats.pending || 0;
            document.getElementById('approvedCount').textContent = stats.approved || 0;
            document.getElementById('rejectedCount').textContent = stats.rejected || 0;
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    function renderMediaUpdates(updates) {
        const container = document.getElementById('mediaUpdatesContainer');

        if (!updates || updates.length === 0) {
            container.innerHTML = '<p>No media updates found</p>';
            return;
        }

        container.innerHTML = updates.map(update => `
            <div class="update-card">
                <div class="update-header">
                    <div class="user-info">
                        <h3>${update.user_email}</h3>
                        <p>Requested: ${new Date(update.requested_at).toLocaleDateString()}</p>
                        ${update.reviewed_at ? `<p>Reviewed: ${new Date(update.reviewed_at).toLocaleDateString()}</p>` : ''}
                    </div>
                    <span class="status-badge status-${update.status}">${update.status.toUpperCase()}</span>
                </div>

                <div class="media-content">
                    ${update.pending_photo_url ? `
                        <div class="media-item">
                            <h4>Profile Photo</h4>
                            <img src="${update.pending_photo_url}" alt="Profile Photo" />
                        </div>
                    ` : ''}

                    ${update.pending_video_url ? `
                        <div class="media-item">
                            <h4>Profile Video</h4>
                            <video src="${update.pending_video_url}" controls></video>
                        </div>
                    ` : ''}
                </div>

                ${update.admin_message ? `
                    <div class="admin-message-display">
                        <strong>Admin Message:</strong> ${update.admin_message}
                    </div>
                ` : ''}

                ${update.status === 'pending' ? `
                    <div class="actions">
                        <textarea class="admin-message" placeholder="Admin message (optional)..." id="message-${update.id}"></textarea>
                        <button class="btn btn-approve" onclick="reviewUpdate(${update.id}, 'approved')">Approve</button>
                        <button class="btn btn-reject" onclick="reviewUpdate(${update.id}, 'rejected')">Reject</button>
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    window.reviewUpdate = async (updateId, status) => {
        try {
            const messageTextarea = document.getElementById(`message-${updateId}`);
            const adminMessage = messageTextarea ? messageTextarea.value : '';

            const response = await fetch(`${config.API_BASE_URL}/api/admin/media-updates/review`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    updateId,
                    status,
                    adminMessage
                })
            });

            if (!response.ok) throw new Error('Failed to review update');

            await loadMediaUpdates();
            await loadStats();

            alert(`Media update ${status} successfully!`);
        } catch (error) {
            console.error('Error reviewing update:', error);
            alert('Error reviewing update');
        }
    };
});

window.logout = function() {
    localStorage.removeItem('admin_token');
    window.location.href = 'admin-login.html';
};