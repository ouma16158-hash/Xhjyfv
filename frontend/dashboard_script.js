// Return a viewable URL for a document — PDFs are opened via Google Docs viewer
function docViewUrl(url) {
  if (!url) return '#';
  const lower = url.toLowerCase();
  if (lower.includes('.pdf') || lower.includes('/raw/') || lower.includes('pdf')) {
    return 'https://docs.google.com/viewer?embedded=false&url=' + encodeURIComponent(url);
  }
  return url;
}

// Extract first non-empty string from a field that may be a JSON array or plain string
function extractField(raw) {
  if (raw === null || raw === undefined) return null;
  // Already a JS array (Supabase auto-parses JSON text columns)
  if (Array.isArray(raw)) {
    return raw.find(v => v && String(v).trim()) || null;
  }
  const s = String(raw).trim();
  if (!s || s === 'null' || s === '[]') return null;
  // JSON array stored as string
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.find(v => v && String(v).trim()) || null;
    } catch (e) {}
  }
  return s;
}

// Safely extract a photo URL – handles JSON-array stored values
function extractPhotoUrl(raw) {
  return extractField(raw) || null;
}

function decodeJWT(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1]));
  } catch (e) {
    console.error("Error decoding token:", e);
    return null;
  }
}

function getCurrentUserFromToken() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  return decodeJWT(token);
}

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('user-container');
  const loadingSpinner = document.getElementById('loadingSpinner');
  const token = localStorage.getItem("token");

  if (!token) {
    if (container) container.innerHTML = "<p>Please log in first!</p>";
    if (loadingSpinner) loadingSpinner.style.display = 'none';
    return;
  }

  // Subscription gate: only premium users can access the dashboard
  try {
    const subRes = await fetch(`${config.API_BASE_URL}/api/user/subscription-status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (subRes.ok) {
      const subData = await subRes.json();
      if (subData.subscription !== 'premium') {
        window.location.href = 'subscriptions.html?reason=no_subscription';
        return;
      }
    }
  } catch (e) {
    console.error('Subscription gate error:', e);
  }

  const currentUser = getCurrentUserFromToken();
  const currentUserEmail = currentUser ? currentUser.email : null;
  const userRole = currentUser ? (currentUser.role || localStorage.getItem("userRole") || 'seeker') : 'seeker';

  if (!currentUserEmail) {
    if (container) container.innerHTML = "<p>Unable to retrieve user info.</p>";
    if (loadingSpinner) loadingSpinner.style.display = 'none';
    return;
  }

  // Show role badge
  const roleBadge = document.getElementById('sidebarRoleBadge');
  if (roleBadge) roleBadge.textContent = userRole === 'employer' ? 'Employer' : 'Job Seeker';

  // Show correct filter tabs
  const seekerFilters = document.getElementById('seekerFilters');
  const employerFilters = document.getElementById('employerFilters');
  if (userRole === 'employer') {
    if (seekerFilters) seekerFilters.style.display = 'none';
    if (employerFilters) employerFilters.style.display = 'flex';

    // Show employer-only UI
    const addJobBtn = document.getElementById('addJobBtn');
    if (addJobBtn) addJobBtn.style.display = 'inline-block';
    const jobBar = document.getElementById('employerJobBar');
    if (jobBar) jobBar.style.display = 'block';
  } else {
    // Seekers get the company-search bar (visible only on Companies tab)
    const searchBar = document.getElementById('companySearchBar');
    if (searchBar) searchBar.style.display = 'block';
  }

  // Company search state (seeker only)
  let searchActive = false;
  let searchResults = [];
  let lastSearchQuery = '';

  let matchProfiles = [];
  let appliedProfiles = [];
  let shortlistedProfiles = [];
  let applicationProfiles = [];
  let shortlistedByMeProfiles = [];
  let chatEnabledProfiles = [];

  let activeSection = userRole === 'employer' ? 'applications' : 'matches';

  if (loadingSpinner) loadingSpinner.style.display = 'flex';
  if (container) container.style.display = 'none';

  try {
    // Fetch current user profile photo
    const photoRes = await fetch(`${config.API_BASE_URL}/api/user/profile-photo/${currentUserEmail}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (photoRes.ok) {
      const photoData = await photoRes.json();
      const profileIcon = document.querySelector('.profile-icon img');
      const iconUrl = extractPhotoUrl(photoData.profile_photo_url);
      if (profileIcon && iconUrl) {
        profileIcon.src = iconUrl;
        profileIcon.onerror = () => { profileIcon.onerror = null; profileIcon.src = 'https://via.placeholder.com/100?text=No+Photo'; };
      }
    }

    const profileIcon = document.querySelector('.profile-icon img');
    if (profileIcon) {
      profileIcon.addEventListener('click', () => showFloatingProfile(currentUser, 'edit'));
    }

    if (userRole === 'seeker') {
      const matchRes = await fetch(`${config.API_BASE_URL}/api/users/${currentUserEmail}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (matchRes.ok) {
        const matchData = await matchRes.json();
        matchProfiles = matchData.users || matchData || [];
      }
    } else {
      const appsRes = await fetch(`${config.API_BASE_URL}/api/jobs/all-applicants`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (appsRes.ok) {
        const appsData = await appsRes.json();
        const applicants = appsData.applicants || [];
        applicationProfiles = applicants.filter(app => (app.applicationStatus || 'applied') === 'applied');
        shortlistedByMeProfiles = applicants.filter(app => app.applicationStatus === 'shortlisted');
        chatEnabledProfiles = applicants.filter(app => app.applicationStatus === 'chat_enabled');
      }
    }

    // Fetch interactions
    const interactRes = await fetch(`${config.API_BASE_URL}/api/users/interactions/${currentUserEmail}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    let myInteractions = [];
    if (interactRes.ok) {
      myInteractions = await interactRes.json();
    }

    if (userRole === 'seeker') {
      // Applied = companies the seeker has applied to (with the actual position names)
      try {
        const appliedRes = await fetch(`${config.API_BASE_URL}/api/seeker/applied-companies`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (appliedRes.ok) {
          const appliedData = await appliedRes.json();
          appliedProfiles = (appliedData.companies || []).map(c => ({ ...c, action: 'applied' }));
        }
      } catch (e) { console.error('Applied fetch error:', e); }

      // Shortlisted = companies who shortlisted this seeker (via selected-you equivalent)
      const shortlistRes = await fetch(`${config.API_BASE_URL}/api/users/shortlisted-me/${currentUserEmail}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (shortlistRes.ok) {
        shortlistedProfiles = await shortlistRes.json();
      }

      // Backend already hides companies where every position has been applied to,
      // so a company with at least one open position remains visible under Companies.

    } else {
      myInteractions = [];
    }

  } catch (error) {
    console.error('Dashboard load error:', error);
    if (container) {
      container.innerHTML = `<p>Error loading dashboard: ${error.message}</p>`;
      container.style.display = 'block';
    }
  }

  if (loadingSpinner) loadingSpinner.style.display = 'none';
  if (container) container.style.display = 'block';

  // ── Chat badge + seeker activation notifications ──────────────────────────
  async function pollChatNotifications() {
    try {
      const res = await fetch(`${config.API_BASE_URL}/api/messages/unread-count`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();

      const allActivations = data.activation_details || [];
      const allActivationIds = allActivations.map(a => a.employer_id);

      // Clean up dismissed list — remove entries no longer in server activations
      let dismissed = JSON.parse(localStorage.getItem('dismissedActivations') || '[]');
      dismissed = dismissed.filter(id => allActivationIds.includes(id));
      localStorage.setItem('dismissedActivations', JSON.stringify(dismissed));

      // Only show activations the seeker has not dismissed yet
      const visibleActivations = allActivations.filter(a => !dismissed.includes(a.employer_id));
      const visibleCount = visibleActivations.length;

      // Badge matches charts.html: only unread messages count
      const unreadMessages = data.unread_messages || 0;
      const badge = document.getElementById('chatNavBadge');
      if (badge) {
        if (unreadMessages > 0) {
          badge.textContent = unreadMessages > 99 ? '99+' : unreadMessages;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }

      // Keep header chat button badge in sync
      const headerCount = document.getElementById('headerChatCount');
      if (headerCount) {
        if (unreadMessages > 0) {
          headerCount.textContent = unreadMessages > 99 ? '99+' : unreadMessages;
          headerCount.style.display = 'inline-flex';
        } else {
          headerCount.style.display = 'none';
        }
      }

      const banner = document.getElementById('chatActivationBanner');
      // Seeker only: show banner for visible (non-dismissed) activations
      if (userRole === 'seeker' && visibleCount > 0 && banner) {
        const list = document.getElementById('chatActivationList');
        if (list) {
          list.textContent = visibleActivations.map(a => a.employer_name).join(', ') + ' can now chat with you.';
        }
        banner.style.display = 'block';

        // Dismiss saves the employer IDs so the banner won't reappear — badge is unaffected
        const dismissAll = () => {
          let d = JSON.parse(localStorage.getItem('dismissedActivations') || '[]');
          visibleActivations.forEach(a => { if (!d.includes(a.employer_id)) d.push(a.employer_id); });
          localStorage.setItem('dismissedActivations', JSON.stringify(d));
          banner.style.display = 'none';
        };

        const dismissBtn = banner.querySelector('.activation-dismiss-btn');
        const viewBtn = banner.querySelector('.activation-view-btn');
        if (dismissBtn) dismissBtn.onclick = dismissAll;
        if (viewBtn) viewBtn.onclick = dismissAll;
      } else if (banner && visibleCount === 0) {
        banner.style.display = 'none';
      }
    } catch (e) { /* silent */ }
  }

  // Run immediately then every 30 s
  pollChatNotifications();
  setInterval(pollChatNotifications, 30000);
  // ─────────────────────────────────────────────────────────────────────────

  // Set up filter buttons
  const filterBtns = document.querySelectorAll('.filters button');
  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      filterBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeSection = btn.dataset.section;
      // Hide search bar on tabs other than Companies
      const sb = document.getElementById('companySearchBar');
      if (sb && userRole === 'seeker') {
        sb.style.display = (activeSection === 'matches') ? 'block' : 'none';
      }
      renderProfiles();
    });
  });

  // ---- Company search (seeker only): overrides match rules on Companies tab ----
  const searchInput = document.getElementById('companySearchInput');
  const clearSearchBtn = document.getElementById('clearCompanySearch');
  const searchStatus = document.getElementById('searchStatus');

  function setSearchStatus(text) {
    if (!searchStatus) return;
    if (!text) { searchStatus.style.display = 'none'; searchStatus.textContent = ''; return; }
    searchStatus.style.display = 'block';
    searchStatus.textContent = text;
  }

  async function runCompanySearch(q) {
    lastSearchQuery = q;
    if (!q) {
      searchActive = false;
      searchResults = [];
      setSearchStatus('');
      if (clearSearchBtn) clearSearchBtn.style.display = 'none';
      renderProfiles();
      return;
    }
    if (clearSearchBtn) clearSearchBtn.style.display = 'inline-block';
    setSearchStatus('Searching…');
    try {
      const res = await fetch(`${config.API_BASE_URL}/api/seeker/companies/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      // Bail if the user has typed something else in the meantime
      if (q !== lastSearchQuery) return;
      if (!res.ok || !data.success) {
        searchResults = [];
        setSearchStatus(data.message || 'Search failed.');
      } else {
        searchResults = data.companies || [];
        setSearchStatus(`Showing ${searchResults.length} compan${searchResults.length === 1 ? 'y' : 'ies'} matching "${q}" (match rules ignored).`);
      }
      searchActive = true;
      renderProfiles();
    } catch (err) {
      if (q !== lastSearchQuery) return;
      searchResults = [];
      searchActive = true;
      setSearchStatus('Network error. Try again.');
      renderProfiles();
    }
  }

  if (searchInput) {
    let debounceId = null;
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim();
      clearTimeout(debounceId);
      debounceId = setTimeout(() => runCompanySearch(q), 300);
    });
  }
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      runCompanySearch('');
    });
  }

  renderProfiles();

  function renderProfiles() {
    if (!container) return;
    container.innerHTML = "";

    let profiles = [];
    if (userRole === 'seeker') {
      if (activeSection === 'matches') {
        // When the seeker is searching, show those results instead of the matches
        profiles = searchActive ? searchResults : matchProfiles;
      }
      else if (activeSection === 'applied') profiles = appliedProfiles;
      else if (activeSection === 'shortlisted') profiles = shortlistedProfiles;
    } else {
      if (activeSection === 'applications') profiles = applicationProfiles;
      else if (activeSection === 'shortlisted_by_me') profiles = shortlistedByMeProfiles;
      else if (activeSection === 'chat_enabled') profiles = chatEnabledProfiles;
    }

    if (profiles.length === 0) {
      let emptyMsg;
      if (userRole === 'seeker' && activeSection === 'matches' && searchActive) {
        emptyMsg = { title: 'No Companies Found', body: `No companies matched "${lastSearchQuery}". Try a different name.` };
      } else {
        emptyMsg = getEmptyMessage(activeSection, userRole);
      }
      container.innerHTML = `<div class="no-matches-message"><h3>${emptyMsg.title}</h3><p>${emptyMsg.body}</p></div>`;
      return;
    }

    profiles.forEach(profile => {
      const card = userRole === 'employer' ? createJobApplicantCard(profile) : createProfileCard(profile, activeSection, userRole);
      container.appendChild(card);
    });
  }

  function getEmptyMessage(section, role) {
    const msgs = {
      matches: { title: 'No Matching Companies', body: 'No companies match your preferences yet. Update your preferences to find more opportunities.' },
      applied: { title: 'No Applications', body: "You haven't applied to any companies yet. Browse matches and apply!" },
      shortlisted: { title: 'Not Shortlisted Yet', body: 'No companies have shortlisted you yet. Keep your profile strong!' },
      applications: { title: 'No Applications', body: 'No job seekers have applied yet. Ensure your job post preferences match candidates.' },
      shortlisted_by_me: { title: 'No Shortlisted Candidates', body: 'You have not shortlisted any candidates yet. Browse applications.' },
      chat_enabled: { title: 'No Chat Connections', body: 'Shortlist candidates and activate chat to connect with them.' }
    };
    return msgs[section] || { title: 'Nothing Here', body: '' };
  }

  function createProfileCard(user, section, role) {
    const photoUrl = extractPhotoUrl(user.profile_photo_url) || 'https://via.placeholder.com/100?text=No+Photo';

    const matchCount = Number.isFinite(Number(user.matchCount)) ? Number(user.matchCount) : null;
    const matchTotal = Number.isFinite(Number(user.matchTotal)) ? Number(user.matchTotal) : 3;
    const matchText = matchCount !== null ? `${matchCount}/${matchTotal} match${matchCount === 1 ? '' : 'es'}` : '';

    // Determine display fields based on role
    let displayName, displaySub1, displaySub2, displayDesc, displayExtra;
    const otherRole = user.orientation === 'employer' ? 'employer' : 'seeker';

    if (otherRole === 'employer') {
      displayName = extractField(user.full_name) || 'Unknown Company';
      displaySub1 = extractField(user.occupation) || 'Unknown Industry';
      displaySub2 = extractField(user.employment_type) || '';
      displayExtra = extractField(user.country_of_residence) || '';
      displayDesc = (user.religion || '').toString().trim();
    } else {
      displayName = extractField(user.full_name) || 'Unknown Candidate';
      displaySub1 = extractField(user.occupation) || 'No Major';
      displaySub2 = extractField(user.employment_type) || '';
      const expYears = (user.religious_importance || '').toString().trim();
      displayExtra = expYears ? `Experience: ${expYears}` : '';
      displayDesc = (user.religion || '').toString().trim();
    }

    // Parse video intros from liveness_video_url
    let videoIntros = [];
    try {
      if (user.liveness_video_url && user.liveness_video_url.startsWith('[')) {
        videoIntros = JSON.parse(user.liveness_video_url);
      }
    } catch(e) {}

    // Parse docs from id_back_url
    let docVault = [];
    try {
      if (user.id_back_url && user.id_back_url.startsWith('[')) {
        docVault = JSON.parse(user.id_back_url);
      }
    } catch(e) {}

    const card = document.createElement("div");
    card.classList.add("profile-card");

    let actionsHtml = '';
    if (role === 'seeker') {
      if (section === 'matches') {
        const allJobs = Array.isArray(user.matchedJobs) ? user.matchedJobs : [];
        const unappliedCount = Number.isFinite(Number(user.unappliedJobsCount))
          ? Number(user.unappliedJobsCount)
          : allJobs.length;
        const label = unappliedCount > 0
          ? `View ${unappliedCount} Position${unappliedCount === 1 ? '' : 's'}`
          : (allJobs.length > 0 ? `View ${allJobs.length} Position${allJobs.length === 1 ? '' : 's'}` : 'View Company');
        actionsHtml = `
          <button class="select-btn view-positions-action" data-companyid="${user.id}">${label}</button>
          <button class="remove-btn remove-company-action" data-id="${user.id}">Remove</button>`;
      } else if (section === 'applied') {
        const appliedPos = Array.isArray(user.appliedPositions) ? user.appliedPositions.filter(Boolean) : [];
        const positionsHtml = appliedPos.length
          ? `<div style="margin-bottom:6px;"><strong style="font-size:0.85rem;color:#444;">Applied for:</strong>` +
              appliedPos.map(p => `<span style="display:inline-block;background:#e8f4ff;color:#007bff;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;margin:2px 4px 2px 0;">${esc(p)}</span>`).join('') +
            `</div>`
          : '';
        actionsHtml = `${positionsHtml}<span style="color:#00b894;font-weight:600;">✓ Applied</span>
          <button class="select-btn view-positions-action" data-companyid="${user.id}" style="margin-left:10px;">View All Positions</button>`;
      } else if (section === 'shortlisted') {
        const chatAllowed = user.action === 'chat_enabled';
        actionsHtml = chatAllowed
          ? `<button class="match-btn chat-action" data-id="${user.id}" data-name="${encodeURIComponent(displayName)}">Chat</button>`
          : `<span style="color:#888;">Shortlisted – awaiting chat</span>`;
      }
    } else {
      // Employer
      if (section === 'applications') {
        actionsHtml = `
          <button class="select-btn shortlist-action" data-id="${user.id}">Shortlist</button>
          <button class="remove-btn ignore-action" data-id="${user.id}">Ignore</button>`;
      } else if (section === 'shortlisted_by_me') {
        actionsHtml = `
          <button class="match-btn activate-chat-action" data-id="${user.id}" data-name="${encodeURIComponent(displayName)}">Activate Chat</button>
          <button class="remove-btn unshortlist-action" data-id="${user.id}">Remove</button>`;
      } else if (section === 'chat_enabled') {
        actionsHtml = `<button class="match-btn chat-action" data-id="${user.id}" data-name="${encodeURIComponent(displayName)}">Open Chat</button>`;
      }
    }

    // Build videos section
    let videosHtml = '';
    if (videoIntros.length > 0) {
      videosHtml = videoIntros.map(v => `
        <div style="margin-bottom:8px;">
          <p style="font-size:0.8rem;color:#555;margin-bottom:4px;">${v.name || 'Video'}</p>
          <video src="${v.url}" controls preload="metadata" style="max-width:100%;height:auto;border-radius:6px;"></video>
        </div>`).join('');
    } else if (user.profile_video_url) {
      videosHtml = `<video src="${user.profile_video_url}" controls preload="metadata" style="max-width:100%;height:auto;border-radius:6px;"></video>`;
    } else {
      videosHtml = '<p style="color:#888;font-size:0.9rem;">No videos uploaded</p>';
    }

    // Build docs section – visible whenever documents exist
    let docsHtml = '';
    if (docVault.length > 0) {
      docsHtml = `<div style="margin-top:10px;"><p style="font-weight:600;font-size:0.9rem;">Documents:</p>` +
        docVault.map(d => `
          <div style="display:flex;align-items:center;gap:6px;background:#f0f8ff;border:1px solid #c5dff8;border-radius:5px;padding:6px 8px;margin-bottom:6px;">
            <span style="font-size:1rem;">📄</span>
            <span style="flex:1;font-size:0.85rem;color:#333;">${d.name || 'Document'}</span>
            <a href="${docViewUrl(d.url)}" target="_blank" rel="noopener"
               style="font-size:11px;color:#0984e3;text-decoration:none;padding:3px 8px;border:1px solid #0984e3;border-radius:4px;white-space:nowrap;">Open ↗</a>
            <a href="${d.url}" download="${d.name || 'document'}" target="_blank" rel="noopener"
               style="font-size:11px;color:#00b894;text-decoration:none;padding:3px 8px;border:1px solid #00b894;border-radius:4px;white-space:nowrap;">⬇ Download</a>
          </div>`).join('') +
        `</div>`;
    }

    const isNew = role === 'seeker' && section === 'matches' && user.hasNewJobs;
    const newBadgeHtml = isNew
      ? `<span class="new-badge" style="display:inline-block;background:linear-gradient(135deg,#ff6b6b,#ee5253);color:#fff;border-radius:10px;padding:2px 9px;font-size:10px;font-weight:700;letter-spacing:0.5px;margin-left:6px;vertical-align:middle;box-shadow:0 1px 3px rgba(238,82,83,0.4);">NEW</span>`
      : '';

    card.innerHTML = `
      <div class="profile-info">
        <img src="${photoUrl}" alt="Profile" class="profile-pic profile-pic-click" data-id="${user.id}"
             onerror="this.onerror=null;this.src='https://via.placeholder.com/100?text=No+Photo';">
        <div class="profile-details">
          <h3>${displayName}</h3>
          <p>${displaySub1}</p>
          ${displaySub2 ? `<p>${displaySub2}</p>` : ''}
          ${displayExtra ? `<p style="color:#666;">${esc(displayExtra)}</p>` : ''}
          ${matchText ? `<p class="match-count-label">${matchText}${newBadgeHtml}</p>` : (newBadgeHtml ? `<p>${newBadgeHtml}</p>` : '')}
        </div>
        ${matchText ? `<span class="score" data-score="${matchCount}">${matchCount}/${matchTotal}</span>` : ''}
      </div>
      ${displayDesc ? `<p class="profile-desc" style="margin:8px 0;color:#444;font-size:0.9rem;">${esc(displayDesc)}</p>` : ''}
      <div class="profile-video">${videosHtml}</div>
      ${docsHtml}
      <div class="profile-actions">${actionsHtml}</div>
    `;

    // Wire up action buttons
    const viewPositionsBtn = card.querySelector('.view-positions-action');
    if (viewPositionsBtn) {
      viewPositionsBtn.addEventListener('click', () => {
        window.location.href = `company-jobs.html?id=${viewPositionsBtn.dataset.companyid}`;
      });
    }

    const removeCompanyBtn = card.querySelector('.remove-company-action');
    if (removeCompanyBtn) {
      removeCompanyBtn.addEventListener('click', async () => {
        if (!confirm(`Remove "${displayName}" from your company list?`)) return;
        removeCompanyBtn.disabled = true;
        await interactWithProfile(user.id, 'removed');
        matchProfiles = matchProfiles.filter(p => p.id !== user.id);
        renderProfiles();
      });
    }

    const shortlistBtn = card.querySelector('.shortlist-action');
    if (shortlistBtn) {
      shortlistBtn.addEventListener('click', async () => {
        shortlistBtn.disabled = true; shortlistBtn.textContent = 'Shortlisting...';
        await interactWithProfile(user.id, 'shortlisted');
        applicationProfiles = applicationProfiles.filter(u => u.id !== user.id);
        shortlistedByMeProfiles.push({ ...user, action: 'shortlisted' });
        renderProfiles();
      });
    }

    const ignoreBtn = card.querySelector('.ignore-action');
    if (ignoreBtn) {
      ignoreBtn.addEventListener('click', async () => {
        await interactWithProfile(user.id, 'removed');
        applicationProfiles = applicationProfiles.filter(u => u.id !== user.id);
        renderProfiles();
      });
    }

    const activateChatBtn = card.querySelector('.activate-chat-action');
    if (activateChatBtn) {
      activateChatBtn.addEventListener('click', async () => {
        activateChatBtn.disabled = true; activateChatBtn.textContent = 'Activating...';
        await interactWithProfile(user.id, 'chat_enabled');
        shortlistedByMeProfiles = shortlistedByMeProfiles.filter(u => u.id !== user.id);
        chatEnabledProfiles.push({ ...user, action: 'chat_enabled' });
        renderProfiles();
      });
    }

    const unshortlistBtn = card.querySelector('.unshortlist-action');
    if (unshortlistBtn) {
      unshortlistBtn.addEventListener('click', async () => {
        await interactWithProfile(user.id, 'removed');
        shortlistedByMeProfiles = shortlistedByMeProfiles.filter(u => u.id !== user.id);
        renderProfiles();
      });
    }

    const chatBtns = card.querySelectorAll('.chat-action');
    chatBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.href = `chat.html?user=${btn.dataset.id}&name=${btn.dataset.name}`;
      });
    });

    const profilePicClick = card.querySelector('.profile-pic-click');
    if (profilePicClick) {
      profilePicClick.addEventListener('click', () => showFloatingProfile(user));
    }

    return card;
  }

  async function interactWithProfile(targetUserId, action) {
    try {
      const res = await fetch(`${config.API_BASE_URL}/api/users/interact`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ targetUserId, action, originalLocation: activeSection })
      });
      if (!res.ok) throw new Error('Interaction failed');
    } catch (e) {
      console.error('Interact error:', e);
    }
  }

  async function applyToJob(jobId) {
    try {
      const res = await fetch(`${config.API_BASE_URL}/api/jobs/${jobId}/apply`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error('Application failed');
      return true;
    } catch (e) {
      console.error('Apply to job error:', e);
      alert('Could not apply to this position. Please try again.');
      return false;
    }
  }

  function showFloatingProfile(user, action = 'view') {
    const floatingEl = document.getElementById('floatingProfilePhoto');
    const floatingPic = document.getElementById('floatingProfilePic');
    const viewBtn = document.getElementById('viewProfileBtn');
    const closeBtn = document.getElementById('closeProfileBtn');

    if (!floatingEl || !floatingPic || !viewBtn || !closeBtn) return;

    floatingPic.src = extractPhotoUrl(user.profile_photo_url) || 'https://via.placeholder.com/170?text=No+Photo';
    floatingPic.onerror = () => { floatingPic.onerror = null; floatingPic.src = 'https://via.placeholder.com/170?text=No+Photo'; };

    const nameEl = document.getElementById('floatingProfileName');
    const roleEl = document.getElementById('floatingProfileRole');
    if (nameEl) nameEl.textContent = user.full_name || user.name || '';
    if (roleEl) {
      const roleText = (user.role || user.orientation || 'seeker') === 'employer' ? 'Employer' : 'Job Seeker';
      roleEl.textContent = roleText;
    }

    floatingEl.style.display = 'flex';
    floatingEl.style.alignItems = 'center';
    floatingEl.style.justifyContent = 'center';
    document.body.style.overflow = 'hidden';

    closeBtn.onclick = () => {
      floatingEl.style.display = 'none';
      document.body.style.overflow = '';
    };

    if (action === 'edit') {
      viewBtn.textContent = '⚙️ My Profile';
      viewBtn.onclick = () => {
        floatingEl.style.display = 'none';
        document.body.style.overflow = '';
        window.location.href = "my-profile.html";
      };
    } else {
      viewBtn.textContent = 'View Profile';
      viewBtn.onclick = () => {
        floatingEl.style.display = 'none';
        document.body.style.overflow = '';
        window.location.href = `profile.html?id=${user.id}`;
      };
    }
  }

  window.checkChartsAccess = async function(event) {
    event.preventDefault();
    window.location.href = 'charts.html';
  };

  // -------------------------------------------------------
  // JOB PANEL — employer side
  // -------------------------------------------------------
  let selectedJobId = null;
  let selectedJobTitle = '';
  let jobApplicantsMode = false;
  let jobApplicants = [];

  window.toggleJobsPanel = async function() {
    const panel = document.getElementById('jobsPanel');
    if (!panel) return;
    if (panel.style.display === 'none' || panel.style.display === '') {
      panel.style.display = 'block';
      await loadMyJobs();
    } else {
      panel.style.display = 'none';
    }
  };

  window.closeJobsPanel = function() {
    const panel = document.getElementById('jobsPanel');
    if (panel) panel.style.display = 'none';
  };

  window.clearJobFilter = function() {
    selectedJobId = null;
    selectedJobTitle = '';
    jobApplicantsMode = false;
    jobApplicants = [];
    const label = document.getElementById('selectedJobLabel');
    if (label) label.textContent = '';
    const clearBtn = document.getElementById('clearJobFilterBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    if (employerFilters) employerFilters.style.display = 'flex';
    if (container) container.style.display = 'block';
    renderProfiles();
  };

  async function loadMyJobs() {
    const list = document.getElementById('jobsPanelList');
    if (!list) return;
    list.innerHTML = '<p style="color:#999;font-size:13px;text-align:center;padding:10px;">Loading...</p>';

    try {
      const res = await fetch(`${config.API_BASE_URL}/api/jobs/my-jobs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (!data.success) {
        list.innerHTML = `<p style="color:#dc3545;font-size:13px;padding:8px;">${data.message || 'Error loading jobs.'}</p>`;
        return;
      }

      const jobs = data.jobs || [];
      if (jobs.length === 0) {
        list.innerHTML = `<div style="text-align:center;padding:16px;">
          <p style="color:#999;font-size:13px;margin-bottom:12px;">No job posts yet.</p>
          <a href="post-job.html" style="background:linear-gradient(135deg,#007bff,#00b894);color:white;
            padding:8px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">
            + Post Your First Job
          </a></div>`;
        return;
      }

      list.innerHTML = jobs.map(job => `
        <div onclick="selectJob(${job.id}, '${escAttr(job.position)}')"
          style="padding:10px 12px;border-radius:6px;margin-bottom:6px;cursor:pointer;
                 border:1.5px solid ${selectedJobId === job.id ? '#007bff' : '#e0ecff'};
                 background:${selectedJobId === job.id ? '#e8f4ff' : '#f8fbff'};
                 transition:background 0.15s;">
          <div style="font-size:14px;font-weight:700;color:#007bff;">${esc(job.position)}</div>
          <div style="font-size:12px;color:#555;margin-top:2px;">
            ${esc(job.experience_required || '')} &bull; ${esc(job.work_mode || '')}
            ${job.salary_min ? ' &bull; ' + formatSalary(job.salary_min, job.salary_max) : ''}
          </div>
          <div style="font-size:11px;color:#999;margin-top:2px;">${esc(job.status === 'active' ? 'Active' : 'Closed')} &bull; ${formatDate(job.created_at)}</div>
        </div>`).join('');
    } catch (err) {
      list.innerHTML = `<p style="color:#dc3545;font-size:13px;padding:8px;">Failed to load jobs: ${err.message}</p>`;
    }
  }

  window.selectJob = async function(jobId, position) {
    selectedJobId = jobId;
    selectedJobTitle = position;
    jobApplicantsMode = true;

    window.closeJobsPanel();

    const label = document.getElementById('selectedJobLabel');
    if (label) label.textContent = `Showing applicants for: ${position}`;

    const clearBtn = document.getElementById('clearJobFilterBtn');
    if (clearBtn) clearBtn.style.display = 'inline-block';

    if (employerFilters) employerFilters.style.display = 'none';
    if (loadingSpinner) loadingSpinner.style.display = 'flex';
    if (container) container.style.display = 'none';

    try {
      const res = await fetch(`${config.API_BASE_URL}/api/jobs/${jobId}/applicants`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (!data.success) {
        if (container) {
          container.innerHTML = `<div class="no-matches-message"><h3>Error</h3><p>${data.message || 'Could not load applicants.'}</p></div>`;
          container.style.display = 'block';
        }
        return;
      }

      jobApplicants = data.applicants || [];
      renderJobApplicants(data.job);
    } catch (err) {
      if (container) {
        container.innerHTML = `<div class="no-matches-message"><h3>Error</h3><p>${err.message}</p></div>`;
        container.style.display = 'block';
      }
    } finally {
      if (loadingSpinner) loadingSpinner.style.display = 'none';
      if (container) container.style.display = 'block';
    }
  };

  function renderJobApplicants(job) {
    if (!container) return;
    container.innerHTML = '';

    if (!job) return;

    const jobInfoEl = document.createElement('div');
    jobInfoEl.style.cssText = 'background:white;border-radius:8px;padding:14px 16px;margin-bottom:14px;box-shadow:0 1px 6px rgba(0,0,0,0.08);border-left:4px solid #007bff;';
    jobInfoEl.innerHTML = `
      <div style="font-size:16px;font-weight:700;color:#007bff;">${esc(job.position)}</div>
      <div style="font-size:12px;color:#555;margin-top:4px;">
        ${job.experience_required ? `<span style="background:#e8f4ff;color:#007bff;border-radius:4px;padding:2px 7px;font-size:11px;margin-right:5px;">${esc(job.experience_required)}</span>` : ''}
        ${job.work_mode ? `<span style="background:#e8fff5;color:#00b894;border-radius:4px;padding:2px 7px;font-size:11px;margin-right:5px;">${esc(job.work_mode)}</span>` : ''}
        ${job.salary_min ? `<span style="background:#f0f8ff;color:#0056b3;border-radius:4px;padding:2px 7px;font-size:11px;">${formatSalary(job.salary_min, job.salary_max)}</span>` : ''}
      </div>
      ${job.skills_required ? `<div style="font-size:12px;color:#777;margin-top:6px;">Skills: ${esc(job.skills_required)}</div>` : ''}
    `;
    container.appendChild(jobInfoEl);

    if (jobApplicants.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'no-matches-message';
      emptyEl.innerHTML = `<h3>No Applicants Yet</h3><p>No one has applied to this position yet. Share the job to attract candidates.</p>`;
      container.appendChild(emptyEl);
      return;
    }

    jobApplicants.forEach(applicant => {
      const card = createJobApplicantCard(applicant);
      container.appendChild(card);
    });
  }

  function createJobApplicantCard(applicant) {
    const photoUrl = extractPhotoUrl(applicant.profile_photo_url) || 'https://via.placeholder.com/100?text=No+Photo';
    const displayName = extractField(applicant.full_name) || 'Unknown Candidate';
    const displaySub1 = extractField(applicant.occupation) || 'No Major';
    const displaySub2 = extractField(applicant.employment_type) || '';
    const expYears = (applicant.religious_importance || '').toString().trim();
    const displayExtra = expYears ? `Experience: ${expYears}` : '';
    const displayDesc = (applicant.religion || '').toString().trim();
    const appStatus = applicant.applicationStatus || 'applied';

    let videoIntros = [];
    try {
      if (applicant.liveness_video_url && applicant.liveness_video_url.startsWith('['))
        videoIntros = JSON.parse(applicant.liveness_video_url);
    } catch(e) {}

    let docVault = [];
    try {
      if (applicant.id_back_url && applicant.id_back_url.startsWith('['))
        docVault = JSON.parse(applicant.id_back_url);
    } catch(e) {}

    let videosHtml = '';
    if (videoIntros.length > 0) {
      videosHtml = videoIntros.map(v => `
        <div style="margin-bottom:8px;">
          <p style="font-size:0.8rem;color:#555;margin-bottom:4px;">${v.name || 'Video'}</p>
          <video src="${v.url}" controls preload="metadata" style="max-width:100%;height:auto;border-radius:6px;"></video>
        </div>`).join('');
    } else if (applicant.profile_video_url) {
      videosHtml = `<video src="${applicant.profile_video_url}" controls preload="metadata" style="max-width:100%;height:auto;border-radius:6px;"></video>`;
    } else {
      videosHtml = '<p style="color:#888;font-size:0.9rem;">No videos uploaded</p>';
    }

    let docsHtml = '';
    if (docVault.length > 0) {
      docsHtml = `<div style="margin-top:10px;"><p style="font-weight:600;font-size:0.9rem;">Documents:</p>` +
        docVault.map(d => `
          <div style="display:flex;align-items:center;gap:6px;background:#f0f8ff;border:1px solid #c5dff8;border-radius:5px;padding:6px 8px;margin-bottom:6px;">
            <span style="font-size:1rem;">📄</span>
            <span style="flex:1;font-size:0.85rem;color:#333;">${d.name || 'Document'}</span>
            <a href="${docViewUrl(d.url)}" target="_blank" rel="noopener"
               style="font-size:11px;color:#0984e3;text-decoration:none;padding:3px 8px;border:1px solid #0984e3;border-radius:4px;white-space:nowrap;">Open ↗</a>
            <a href="${d.url}" download="${d.name || 'document'}" target="_blank" rel="noopener"
               style="font-size:11px;color:#00b894;text-decoration:none;padding:3px 8px;border:1px solid #00b894;border-radius:4px;white-space:nowrap;">⬇ Download</a>
          </div>`).join('') +
        `</div>`;
    }

    const jobPos = (applicant.jobPosition || '').toString().trim();
    const positionLabel = jobPos
      ? `<div style="font-size:11px;color:#007bff;font-weight:600;margin-bottom:4px;text-align:right;">for ${esc(jobPos)}</div>`
      : '';

    let statusBadge = '';
    if (appStatus === 'shortlisted') statusBadge = `${positionLabel}<span style="background:#e8f4ff;color:#007bff;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;">Shortlisted</span>`;
    else if (appStatus === 'chat_enabled') statusBadge = `${positionLabel}<span style="background:#e8fff5;color:#00b894;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;">Chat Enabled</span>`;
    else statusBadge = `${positionLabel}<span style="background:#f0f0f0;color:#666;border-radius:4px;padding:2px 8px;font-size:11px;">Applied</span>`;

    let actionsHtml = '';
    if (appStatus === 'applied') {
      actionsHtml = `
        <button class="select-btn job-shortlist-action" data-appid="${applicant.applicationId}">Shortlist</button>
        <button class="remove-btn job-reject-action" data-appid="${applicant.applicationId}">Ignore</button>`;
    } else if (appStatus === 'shortlisted') {
      actionsHtml = `
        <button class="match-btn job-chat-action" data-appid="${applicant.applicationId}" data-id="${applicant.id}" data-name="${encodeURIComponent(displayName)}">Activate Chat</button>
        <button class="remove-btn job-reject-action" data-appid="${applicant.applicationId}">Remove</button>`;
    } else if (appStatus === 'chat_enabled') {
      actionsHtml = `<button class="match-btn job-open-chat-action" data-id="${applicant.id}" data-name="${encodeURIComponent(displayName)}">Open Chat</button>`;
    }

    const card = document.createElement('div');
    card.className = 'profile-card';
    card.innerHTML = `
      <div class="profile-info">
        <img src="${photoUrl}" alt="Profile" class="profile-pic profile-pic-click" data-id="${applicant.id}"
             onerror="this.onerror=null;this.src='https://via.placeholder.com/100?text=No+Photo';">
        <div class="profile-details">
          <h3>${displayName}</h3>
          <p>${displaySub1}</p>
          ${displaySub2 ? `<p>${displaySub2}</p>` : ''}
          ${displayExtra ? `<p style="color:#666;">${esc(displayExtra)}</p>` : ''}
        </div>
        <div style="margin-left:auto;">${statusBadge}</div>
      </div>
      ${displayDesc ? `<p class="profile-desc" style="margin:8px 0;color:#444;font-size:0.9rem;">${esc(displayDesc)}</p>` : ''}
      <div class="profile-video">${videosHtml}</div>
      ${docsHtml}
      <div class="profile-actions">${actionsHtml}</div>`;

    const shortlistBtn = card.querySelector('.job-shortlist-action');
    if (shortlistBtn) {
      shortlistBtn.addEventListener('click', async () => {
        shortlistBtn.disabled = true; shortlistBtn.textContent = 'Shortlisting...';
        await jobApplicationAction(applicant.applicationId, 'shortlisted');
        applicant.applicationStatus = 'shortlisted';
        const updatedCard = createJobApplicantCard(applicant);
        card.replaceWith(updatedCard);
      });
    }

    const rejectBtns = card.querySelectorAll('.job-reject-action');
    rejectBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        await jobApplicationAction(applicant.applicationId, 'rejected');
        jobApplicants = jobApplicants.filter(a => a.applicationId !== applicant.applicationId);
        card.remove();
        if (jobApplicants.length === 0) {
          const emptyEl = document.createElement('div');
          emptyEl.className = 'no-matches-message';
          emptyEl.innerHTML = '<h3>No More Applicants</h3><p>All applicants for this position have been processed.</p>';
          container.appendChild(emptyEl);
        }
      });
    });

    const chatActivateBtn = card.querySelector('.job-chat-action');
    if (chatActivateBtn) {
      chatActivateBtn.addEventListener('click', async () => {
        chatActivateBtn.disabled = true; chatActivateBtn.textContent = 'Activating...';
        await jobApplicationAction(applicant.applicationId, 'chat_enabled');
        applicant.applicationStatus = 'chat_enabled';
        const updatedCard = createJobApplicantCard(applicant);
        card.replaceWith(updatedCard);
      });
    }

    const openChatBtn = card.querySelector('.job-open-chat-action');
    if (openChatBtn) {
      openChatBtn.addEventListener('click', () => {
        window.location.href = `chat.html?user=${openChatBtn.dataset.id}&name=${openChatBtn.dataset.name}`;
      });
    }

    const picClick = card.querySelector('.profile-pic-click');
    if (picClick) {
      picClick.addEventListener('click', () => showFloatingProfile(applicant));
    }

    return card;
  }

  async function confirmDeleteAccount() {
    if (!confirm('Are you sure you want to permanently delete your account?\n\nThis will erase ALL your data — profile, applications, messages, subscriptions — and cannot be undone.')) return;
    if (!confirm('Last chance: this is irreversible. Delete account?')) return;
    try {
      const res = await fetch(`${config.API_BASE_URL}/api/user/delete-account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.removeItem('token');
        window.location.replace('register.html');
      } else {
        alert('Failed to delete account: ' + (data.message || 'Unknown error'));
      }
    } catch(e) {
      alert('Network error. Please try again.');
    }
  }
  window.confirmDeleteAccount = confirmDeleteAccount;

  async function jobApplicationAction(applicationId, action) {
    try {
      await fetch(`${config.API_BASE_URL}/api/jobs/applications/${applicationId}/action`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
    } catch (err) { console.error('Job action error:', err); }
  }

  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escAttr(str) {
    return String(str || '').replace(/'/g, "\\'");
  }
  function formatSalary(min, max) {
    const fmt = n => Number(n).toLocaleString();
    if (min && max) return `${fmt(min)}–${fmt(max)}`;
    if (min) return `From ${fmt(min)}`;
    if (max) return `Up to ${fmt(max)}`;
    return '';
  }
  function formatDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return ''; }
  }
});
