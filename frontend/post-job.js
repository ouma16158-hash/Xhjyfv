const BASE_URL = window.CONFIG?.BASE_URL || '';

const token = localStorage.getItem('token');
if (!token) { window.location.href = 'index.html'; }

const form = document.getElementById('postJobForm');
const spinner = document.getElementById('spinner');
const submitBtn = document.getElementById('submitBtn');
const alertBox = document.getElementById('alertBox');
const fileInput = document.getElementById('fileInput');
const uploadStatus = document.getElementById('uploadStatus');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const attachmentUrlInput = document.getElementById('attachmentUrl');
const strictToggle = document.getElementById('experienceStrict');
const strictLabel = document.getElementById('strictLabel');
const deadlineInput = document.getElementById('deadlineInput');

const subMajors = {
  "Engineering & Tech": ["Civil & Structural", "Software & Data", "Electrical", "Mechanical"],
  "Business & Admin": ["Finance & Accounting", "Marketing", "HR", "Operations"],
  "Health & Sciences": ["Clinical", "Laboratory", "Public Health", "Admin"],
  "Arts & Design": ["Graphic Design", "UI/UX", "Photography", "Fine Arts"],
  "Humanities/Social": ["Education", "Psychology", "Sociology", "Political Science"]
};

const jobFieldSelect = document.getElementById('jobFieldSelect');
const jobSubFieldSelect = document.getElementById('jobSubFieldSelect');

function populateSubFields(major) {
  if (!jobSubFieldSelect) return;
  jobSubFieldSelect.innerHTML = '<option value="">Select sub field</option>';
  if (subMajors[major]) {
    subMajors[major].forEach(sm => {
      const opt = document.createElement('option');
      opt.value = sm; opt.textContent = sm;
      jobSubFieldSelect.appendChild(opt);
    });
  }
}

if (jobFieldSelect) {
  jobFieldSelect.addEventListener('change', () => populateSubFields(jobFieldSelect.value));
}

// Default deadline: 30 days from today
if (deadlineInput) {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  deadlineInput.value = d.toISOString().slice(0, 10);
  // Don't allow picking dates in the past
  deadlineInput.min = new Date().toISOString().slice(0, 10);
}

if (strictToggle && strictLabel) {
  strictToggle.addEventListener('change', () => {
    strictLabel.textContent = strictToggle.checked ? 'Strict' : 'Open';
    strictLabel.style.color = strictToggle.checked ? '#007bff' : '#666';
  });
}

function showAlert(msg, type = 'error') {
  alertBox.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
  alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearAlert() { alertBox.innerHTML = ''; }

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showAlert('File too large. Maximum size is 10MB.');
    fileInput.value = '';
    return;
  }

  uploadStatus.textContent = 'Uploading…';
  progressWrap.style.display = 'block';
  progressBar.style.width = '30%';

  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${BASE_URL}/api/upload-identity`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    progressBar.style.width = '80%';
    const data = await res.json();
    progressBar.style.width = '100%';

    if (data.success && data.url) {
      attachmentUrlInput.value = data.url;
      uploadStatus.textContent = `✓ ${file.name} uploaded`;
    } else {
      const cloudRes = await uploadToCloudinary(file);
      if (cloudRes) {
        attachmentUrlInput.value = cloudRes;
        uploadStatus.textContent = `✓ ${file.name} uploaded`;
      } else {
        uploadStatus.textContent = '';
        showAlert('Upload failed. You can still post the job without an attachment.');
      }
    }
  } catch (err) {
    progressBar.style.width = '100%';
    uploadStatus.textContent = '';
    showAlert('Upload error. You can still post the job without an attachment.');
  } finally {
    setTimeout(() => { progressWrap.style.display = 'none'; progressBar.style.width = '0'; }, 800);
  }
});

async function uploadToCloudinary(file) {
  try {
    const cloudName = 'dvgo2opxr';
    const uploadPreset = 'onraiser_unsigned';
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', uploadPreset);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, { method: 'POST', body: fd });
    const d = await r.json();
    return d.secure_url || null;
  } catch { return null; }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert();

  const fd = new FormData(form);
  const payload = {
    position: fd.get('position')?.trim(),
    job_field: fd.get('job_field') || null,
    job_sub_field: fd.get('job_sub_field') || null,
    experience_required: fd.get('experience_required'),
    experience_strict: !!(strictToggle && strictToggle.checked),
    deadline: fd.get('deadline') || null,
    work_mode: fd.get('work_mode'),
    salary_min: fd.get('salary_min') || null,
    salary_max: fd.get('salary_max') || null,
    about_company: fd.get('about_company')?.trim(),
    job_functions: fd.get('job_functions')?.trim(),
    skills_required: fd.get('skills_required')?.trim(),
    attachment_url: fd.get('attachment_url') || null
  };

  if (!payload.position) return showAlert('Please enter a job position.');
  if (!payload.job_field) return showAlert('Please select a job field / industry.');
  if (!payload.job_sub_field) return showAlert('Please select a sub field.');
  if (!payload.experience_required) return showAlert('Please select experience level.');
  if (!payload.deadline) return showAlert('Please choose an application deadline.');
  if (!payload.work_mode) return showAlert('Please select work mode.');
  if (!payload.job_functions) return showAlert('Please describe the job functions.');
  if (!payload.skills_required) return showAlert('Please list the skills required.');

  spinner.style.display = 'block';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Posting…';

  try {
    const res = await fetch(`${BASE_URL}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      showAlert('Job posted successfully! Redirecting…', 'success');
      setTimeout(() => { window.location.href = 'dashboard_page.html'; }, 1500);
    } else {
      showAlert(data.message || 'Failed to post job. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post Job';
    }
  } catch (err) {
    showAlert('Network error. Please check your connection.');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Post Job';
  } finally {
    spinner.style.display = 'none';
  }
});
