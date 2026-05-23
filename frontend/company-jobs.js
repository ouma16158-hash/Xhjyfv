function extractField(raw) {
  if (raw === null || raw === undefined) return '';
  if (Array.isArray(raw)) return raw.find(v => v && String(v).trim()) || '';
  const s = String(raw).trim();
  if (!s || s === 'null' || s === '[]') return '';
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.find(v => v && String(v).trim()) || '';
    } catch (e) {}
  }
  return s;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function formatSalary(min, max) {
  const fmt = n => Number(n).toLocaleString();
  if (min && max) return `${fmt(min)}–${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  if (max) return `Up to ${fmt(max)}`;
  return '';
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function deadlineMeta(deadline) {
  if (!deadline) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const dl = new Date(deadline); dl.setHours(0,0,0,0);
  const diffDays = Math.round((dl - today) / 86400000);
  if (diffDays < 0) return `<span style="background:#ffe1e1;color:#c0392b;">⏱ Closed ${formatDate(deadline)}</span>`;
  if (diffDays === 0) return `<span style="background:#fff3cd;color:#8a6d3b;">⏱ Closes today</span>`;
  if (diffDays <= 3) return `<span style="background:#fff3cd;color:#8a6d3b;">⏱ Closes in ${diffDays}d (${formatDate(deadline)})</span>`;
  return `<span style="background:#f0f8ff;color:#0056b3;">⏱ Apply by ${formatDate(deadline)}</span>`;
}

const token = localStorage.getItem('token');
const main = document.getElementById('cjMain');
const companyId = getQueryParam('id');

if (!token) {
  window.location.href = 'login.html';
} else if (!companyId) {
  main.innerHTML = '<p class="empty">No company selected.</p>';
} else {
  loadCompanyJobs();
}

async function loadCompanyJobs() {
  try {
    const res = await fetch(`${config.API_BASE_URL}/api/jobs/company/${companyId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success) {
      main.innerHTML = `<p class="empty">${esc(data.message || 'Could not load company.')}</p>`;
      return;
    }
    render(data.company, data.jobs || []);
  } catch (err) {
    main.innerHTML = `<p class="empty">Error: ${esc(err.message)}</p>`;
  }
}

function render(company, jobs) {
  const logo = extractField(company.profile_photo_url) || 'https://via.placeholder.com/120?text=Logo';
  const name = extractField(company.full_name) || 'Unknown Company';
  const main_area = extractField(company.occupation) || '';
  const sub_area = extractField(company.employment_type) || '';
  const location = extractField(company.country_of_residence) || '';
  const bio = (company.religion || '').toString().trim();

  let html = `
    <div class="company-card">
      <img class="logo" src="${esc(logo)}" alt="logo" onerror="this.src='https://via.placeholder.com/120?text=Logo'" />
      <div style="flex:1;">
        <h2>${esc(name)}</h2>
        ${main_area ? `<p><strong>Industry:</strong> ${esc(main_area)}${sub_area ? ' / ' + esc(sub_area) : ''}</p>` : ''}
        ${location ? `<p><strong>Location:</strong> ${esc(location)}</p>` : ''}
        ${bio ? `<p style="margin-top:6px;color:#444;">${esc(bio)}</p>` : ''}
        <p style="margin-top:8px;"><a href="profile.html?id=${company.id}" style="color:#007bff;font-size:13px;">View full company profile →</a></p>
      </div>
    </div>
    <h3 style="margin:14px 4px 8px;color:#333;">Open Positions (${jobs.length})</h3>
  `;

  if (jobs.length === 0) {
    html += `<div class="empty">This company has no open positions right now.</div>`;
  } else {
    html += jobs.map(j => `
      <div class="job-card" data-jobid="${j.id}">
        <h3>${esc(j.position || 'Position')}</h3>
        <div class="job-meta">
          ${j.experience_required ? `<span>${esc(j.experience_required)}</span>` : ''}
          ${j.work_mode ? `<span style="background:#e8fff5;color:#00b894;">${esc(j.work_mode)}</span>` : ''}
          ${(j.salary_min || j.salary_max) ? `<span style="background:#f0f8ff;color:#0056b3;">${esc(formatSalary(j.salary_min, j.salary_max))}</span>` : ''}
          ${(j.posted_at || j.created_at) ? `<span style="background:#f1f3f5;color:#555;">📅 Posted ${formatDate(j.posted_at || j.created_at)}</span>` : ''}
          ${deadlineMeta(j.deadline)}
        </div>
        ${j.about_company ? `<p><strong>About:</strong> ${esc(j.about_company)}</p>` : ''}
        ${j.job_functions ? `<p><strong>Functions:</strong> ${esc(j.job_functions)}</p>` : ''}
        ${j.skills_required ? `<p><strong>Skills:</strong> ${esc(j.skills_required)}</p>` : ''}
        ${j.attachment_url ? `<p><a href="${esc(j.attachment_url)}" target="_blank" style="color:#0984e3;">📎 Attachment</a></p>` : ''}
        ${j.alreadyApplied
          ? `<div class="applied-badge">✓ Applied</div>`
          : `<button class="apply-btn" data-jobid="${j.id}">Apply</button>`}
      </div>
    `).join('');
  }

  main.innerHTML = html;

  main.querySelectorAll('.apply-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Applying...';
      try {
        const res = await fetch(`${config.API_BASE_URL}/api/jobs/${btn.dataset.jobid}/apply`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          // Also record interaction so it appears under Applied tab
          try {
            await fetch(`${config.API_BASE_URL}/api/users/interact`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ targetUserId: companyId, action: 'applied', originalLocation: 'matches' })
            });
          } catch (e) {}
          const badge = document.createElement('div');
          badge.className = 'applied-badge';
          badge.textContent = '✓ Applied';
          btn.replaceWith(badge);
        } else {
          btn.disabled = false;
          btn.textContent = 'Apply';
          alert(data.message || 'Could not apply.');
        }
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Apply';
        alert('Network error. Try again.');
      }
    });
  });
}
