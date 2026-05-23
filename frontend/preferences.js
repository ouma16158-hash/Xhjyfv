
function getRoleFromToken() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || 'seeker';
  } catch(e) { return 'seeker'; }
}

const subMajors = {
  "Engineering & Tech": ["Civil & Structural", "Software & Data", "Electrical", "Mechanical"],
  "Business & Admin": ["Finance & Accounting", "Marketing", "HR", "Operations"],
  "Health & Sciences": ["Clinical", "Laboratory", "Public Health", "Admin"],
  "Arts & Design": ["Graphic Design", "UI/UX", "Photography", "Fine Arts"],
  "Humanities/Social": ["Education", "Psychology", "Sociology", "Political Science"]
};

function populateSubMajors(selectId, major) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">Any Sub-Major</option>';
  if (subMajors[major]) {
    subMajors[major].forEach(sm => {
      const opt = document.createElement('option');
      opt.value = sm;
      opt.textContent = sm;
      sel.appendChild(opt);
    });
  }
}

let currentRecency = 'any';

function setRecency(val) {
  currentRecency = val;
  // Seeker
  const any = document.getElementById('recencyAny');
  const today = document.getElementById('recencyToday');
  const val1 = document.getElementById('recencyValue');
  // Employer
  const anyE = document.getElementById('recencyAnyEmp');
  const todayE = document.getElementById('recencyTodayEmp');
  const val2 = document.getElementById('recencyValueEmp');

  [any, anyE].forEach(btn => btn && btn.classList.toggle('active', val === 'any'));
  [today, todayE].forEach(btn => btn && btn.classList.toggle('active', val === 'today'));
  if (val1) val1.value = val;
  if (val2) val2.value = val;
}

function toggleChip(label) {
  const cb = label.querySelector('input[type="checkbox"]');
  if (!cb) return;
  cb.checked = !cb.checked;
  label.classList.toggle('checked', cb.checked);
}

// Auth + role setup
(async () => {
  const token = localStorage.getItem("token");
  const overlay = document.getElementById("spinnerOverlay");

  if (!token) { window.location.href = "login.html"; return; }

  const role = getRoleFromToken() || localStorage.getItem("userRole") || 'seeker';

  // Show the right preference fields
  const seekerPrefs = document.getElementById('seekerPrefs');
  const employerPrefs = document.getElementById('employerPrefs');
  const prefTitle = document.getElementById('prefTitle');

  if (role === 'employer') {
    if (seekerPrefs) seekerPrefs.style.display = 'none';
    if (employerPrefs) employerPrefs.style.display = 'block';
    if (prefTitle) prefTitle.textContent = 'Post Your First Job';

    // Default deadline = 30 days from today (matching post-job page)
    const dl = document.getElementById('empDeadlineInput');
    if (dl) {
      const d = new Date(); d.setDate(d.getDate() + 30);
      dl.value = d.toISOString().slice(0, 10);
      dl.min = new Date().toISOString().slice(0, 10);
    }

    // Strict toggle live label
    const strict = document.getElementById('empExperienceStrict');
    const strictLbl = document.getElementById('empStrictLabel');
    if (strict && strictLbl) {
      strict.addEventListener('change', () => {
        strictLbl.textContent = strict.checked ? 'Strict' : 'Open';
        strictLbl.style.color = strict.checked ? '#00b894' : '#666';
      });
    }
  } else {
    if (seekerPrefs) seekerPrefs.style.display = 'block';
    if (employerPrefs) employerPrefs.style.display = 'none';
    if (prefTitle) prefTitle.textContent = 'Your Job Preferences';

    const targetIndustry = document.getElementById('targetIndustrySelect');
    if (targetIndustry) {
      targetIndustry.addEventListener('change', () => populateSubMajors('targetSubIndustrySelect', targetIndustry.value));
    }
  }

  // Employer job field → sub field population
  const empJobField = document.getElementById('empJobFieldSelect');
  if (empJobField) {
    empJobField.addEventListener('change', () => populateSubMajors('empJobSubFieldSelect', empJobField.value));
  }

  try {
    if (overlay) overlay.style.display = "flex";

    const res = await fetch(`${config.API_BASE_URL}/api/user/progress`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    const step = data.current_step || "personal";
    const status = data.status || "pending";

    if (status === "approved") { window.location.href = "dashboard_page.html"; return; }
    if (status === "disapproved") { window.location.href = "submission.html"; return; }

    if (step !== "preferences") {
      if (step === "submission") { window.location.href = "submission.html"; return; }
      // Treat identity/personal/subscription/unknown as needing the personal form first
      if (step === "identity" || step === "personal" || step === "subscription") {
        window.location.href = "personal.html";
        return;
      }
      // Unknown step → just show preferences instead of bouncing forever
    }

    if (overlay) overlay.style.display = "none";
  } catch (err) {
    console.error("Progress check failed:", err);
    if (overlay) overlay.style.display = "none";
  }
})();

// Form submission
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById("preferencesForm");
  const spinner = document.getElementById("spinner");
  const attachmentInput = document.getElementById('jobAttachmentInput');
  const attachmentStatus = document.getElementById('jobAttachmentStatus');
  const attachmentUrl = document.getElementById('jobAttachmentUrl');

  if (!form) return;

  if (attachmentInput) {
    attachmentInput.addEventListener('change', async () => {
      const file = attachmentInput.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        alert('File too large. Maximum size is 10MB.');
        attachmentInput.value = '';
        return;
      }

      const token = localStorage.getItem("token");
      if (attachmentStatus) attachmentStatus.textContent = 'Uploading attachment...';
      try {
        const uploadData = new FormData();
        uploadData.append('file', file);
        const uploadRes = await fetch(`${config.API_BASE_URL}/api/user/upload-file`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: uploadData
        });
        const uploadResult = await uploadRes.json();
        if (uploadRes.ok && uploadResult.url) {
          if (attachmentUrl) attachmentUrl.value = uploadResult.url;
          if (attachmentStatus) attachmentStatus.textContent = `${file.name} uploaded`;
        } else {
          if (attachmentStatus) attachmentStatus.textContent = 'Attachment upload failed. You can continue without it.';
        }
      } catch (error) {
        if (attachmentStatus) attachmentStatus.textContent = 'Attachment upload failed. You can continue without it.';
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (spinner) spinner.style.display = "block";

    const token = localStorage.getItem("token");
    if (!token) {
      alert("Session expired. Please log in again.");
      if (spinner) spinner.style.display = "none";
      return;
    }

    const role = getRoleFromToken() || localStorage.getItem("userRole") || 'seeker';
    const formData = new FormData(form);
    let payload = {};

    if (role === 'seeker') {
      const targetIndustry = formData.get('target_industry') || '';

      payload = {
        pref_languages: targetIndustry ? `{${targetIndustry}}` : '{}',
        pref_country_of_residence: formData.get('pref_country_of_residence') || '',
        pref_height: formData.get('pref_height') || null,
        pref_living_situation: formData.get('pref_location') || '',
        pref_religion: 'any',
        pref_age_min: 18,
        pref_age_max: 65
      };
    } else {
      const strictEl = document.getElementById('empExperienceStrict');
      const jobPayload = {
        position: formData.get('position')?.trim(),
        job_field: formData.get('job_field') || null,
        job_sub_field: formData.get('job_sub_field') || null,
        experience_required: formData.get('experience_required'),
        experience_strict: !!(strictEl && strictEl.checked),
        deadline: formData.get('deadline') || null,
        work_mode: formData.get('work_mode'),
        salary_min: formData.get('salary_min') || null,
        salary_max: formData.get('salary_max') || null,
        about_company: formData.get('about_company')?.trim(),
        job_functions: formData.get('job_functions')?.trim(),
        skills_required: formData.get('skills_required')?.trim(),
        attachment_url: formData.get('attachment_url') || null
      };

      const stopWithMessage = (message) => {
        if (spinner) spinner.style.display = "none";
        alert(message);
        return true;
      };

      if (!jobPayload.position && stopWithMessage('Please enter a job position.')) return;
      if (!jobPayload.job_field && stopWithMessage('Please select a job field / industry.')) return;
      if (!jobPayload.job_sub_field && stopWithMessage('Please select a sub field.')) return;
      if (!jobPayload.experience_required && stopWithMessage('Please select experience level.')) return;
      if (!jobPayload.deadline && stopWithMessage('Please choose an application deadline.')) return;
      if (!jobPayload.work_mode && stopWithMessage('Please select work mode.')) return;
      if (!jobPayload.job_functions && stopWithMessage('Please describe the job functions.')) return;
      if (!jobPayload.skills_required && stopWithMessage('Please list the skills required.')) return;

      const jobResponse = await fetch(`${config.API_BASE_URL}/api/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(jobPayload)
      });

      const jobResult = await jobResponse.json();
      if (!jobResponse.ok || !jobResult.success) {
        if (spinner) spinner.style.display = "none";
        return alert(jobResult.message || "Error posting the job.");
      }

      payload = {
        pref_religion: 'any',
        pref_age_min: 18,
        pref_age_max: 65
      };
    }

    try {
      const response = await fetch(`${config.API_BASE_URL}/api/user/preferences`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (spinner) spinner.style.display = "none";

      if (response.ok && result.success) {
        window.location.href = "submission.html";
      } else {
        alert(result.message || "Error saving preferences.");
      }
    } catch (error) {
      if (spinner) spinner.style.display = "none";
      alert("Network error. Try again.");
      console.error(error);
    }
  });
});
