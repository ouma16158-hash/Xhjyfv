// public-jobs.js — anonymous browsing of all open positions
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatSalary(min, max) {
  const fmt = n => Number(n).toLocaleString();
  if (min && max) return `${fmt(min)}–${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  if (max) return `Up to ${fmt(max)}`;
  return '';
}

function deadlineMeta(deadline) {
  if (!deadline) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dl = new Date(deadline); dl.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dl - today) / 86400000);
  if (diffDays < 0) return `<span class="deadline-soon">⏱ Closed ${formatDate(deadline)}</span>`;
  if (diffDays === 0) return `<span class="deadline-soon">⏱ Closes today</span>`;
  if (diffDays <= 3) return `<span class="deadline-soon">⏱ Closes in ${diffDays}d</span>`;
  return `<span class="deadline-ok">⏱ Apply by ${formatDate(deadline)}</span>`;
}

const listEl = document.getElementById('pjList');
const searchEl = document.getElementById('pjSearch');
let allCompanies = [];

async function load() {
  try {
    const res = await fetch(`${config.API_BASE_URL}/api/public/jobs`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      listEl.innerHTML = `<div class="empty">${esc(data.message || 'Could not load jobs.')}</div>`;
      return;
    }
    allCompanies = data.companies || [];
    if (allCompanies.length === 0) {
      listEl.innerHTML = `<div class="empty"><h3>No open positions yet</h3><p>Check back soon — new roles are posted regularly.</p></div>`;
      return;
    }
    render(allCompanies);
  } catch (err) {
    listEl.innerHTML = `<div class="empty">Network error: ${esc(err.message)}</div>`;
  }
}

function render(companies) {
  listEl.classList.remove('loading');
  if (companies.length === 0) {
    listEl.innerHTML = `<div class="empty"><h3>No matches</h3><p>Try a different search term.</p></div>`;
    return;
  }

  listEl.innerHTML = companies.map(c => {
    const logo = extractField(c.profile_photo_url) || 'https://via.placeholder.com/120?text=Logo';
    const name = extractField(c.full_name) || 'Unknown Company';
    const industry = extractField(c.occupation) || '';
    const subIndustry = extractField(c.employment_type) || '';
    const location = extractField(c.country_of_residence) || '';
    const bio = (c.religion || '').toString().trim();

    const jobsHtml = (c.jobs || []).map(j => {
      const salary = formatSalary(j.salary_min, j.salary_max);
      return `
        <div class="job-card">
          <h3>${esc(j.position || 'Position')}</h3>
          <div class="job-meta">
            ${j.experience_required ? `<span>${esc(j.experience_required)}</span>` : ''}
            ${j.work_mode ? `<span class="mode">${esc(j.work_mode)}</span>` : ''}
            ${salary ? `<span class="salary">${esc(salary)}</span>` : ''}
            ${j.posted_at ? `<span class="posted">📅 Posted ${formatDate(j.posted_at)}</span>` : ''}
            ${deadlineMeta(j.deadline)}
          </div>
          ${j.about_company ? `<p><strong>About:</strong> ${esc(j.about_company)}</p>` : ''}
          ${j.job_functions ? `<p><strong>Functions:</strong> ${esc(j.job_functions)}</p>` : ''}
          ${j.skills_required ? `<p><strong>Skills:</strong> ${esc(j.skills_required)}</p>` : ''}
          ${j.attachment_url ? `<p><a href="${esc(j.attachment_url)}" target="_blank" style="color:#0984e3;">📎 Attachment</a></p>` : ''}
          <a class="apply-btn" href="login.html?next=apply&amp;job=${j.id}">Apply</a>
        </div>`;
    }).join('');

    return `
      <section class="company-block">
        <div class="company-head">
          <img src="${esc(logo)}" alt="logo" onerror="this.src='https://via.placeholder.com/120?text=Logo'" />
          <div>
            <h2>${esc(name)}</h2>
            ${industry ? `<p><strong>Industry:</strong> ${esc(industry)}${subIndustry ? ' / ' + esc(subIndustry) : ''}</p>` : ''}
            ${location ? `<p><strong>Location:</strong> ${esc(location)}</p>` : ''}
          </div>
        </div>
        ${bio ? `<p class="company-bio">${esc(bio)}</p>` : ''}
        <div class="jobs-grid">${jobsHtml}</div>
      </section>`;
  }).join('');
}

if (searchEl) {
  let debId = null;
  searchEl.addEventListener('input', () => {
    clearTimeout(debId);
    debId = setTimeout(() => {
      const q = searchEl.value.trim().toLowerCase();
      if (!q) return render(allCompanies);
      const filtered = allCompanies
        .map(c => {
          const haystack = [
            c.full_name, c.occupation, c.employment_type, c.country_of_residence, c.religion
          ].map(v => extractField(v).toLowerCase()).join(' ');
          if (haystack.includes(q)) return c;
          // also match jobs by position / skills
          const jobsMatch = (c.jobs || []).filter(j =>
            (j.position || '').toLowerCase().includes(q) ||
            (j.skills_required || '').toLowerCase().includes(q) ||
            (j.work_mode || '').toLowerCase().includes(q)
          );
          return jobsMatch.length ? { ...c, jobs: jobsMatch } : null;
        })
        .filter(Boolean);
      render(filtered);
    }, 200);
  });
}

load();
