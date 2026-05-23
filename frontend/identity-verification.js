
function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const now = Math.floor(Date.now() / 1000);
    return payload.exp && payload.exp < now;
  } catch (e) {
    console.error("Token check failed:", e);
    return true;
  }
}

(async () => {
  const token = localStorage.getItem("token");
  const spinnerOverlay = document.getElementById("spinnerOverlay");

  if (!token || isTokenExpired(token)) {
    localStorage.removeItem("token");
    return (window.location.href = "login.html");
  }

  // This page is no longer in use — redirect all logged-in users to subscriptions
  return (window.location.href = "subscriptions.html");

  // --- Code below is preserved for job seeker and employee reference ---
  try {
    spinnerOverlay.style.display = "flex";

    const res = await fetch(`${config.API_BASE_URL}/api/user/progress`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    const step = data.current_step || "identity";
    const status = data.status || "pending";

    if (status === "approved") return (window.location.href = "dashboard_page.html");
    if (status === "disapproved") return (window.location.href = "submission.html");

    if (step !== "identity") {
      const map = {
        personal: "personal.html",
        preferences: "preferences.html",
        submission: "submission.html"
      };
      return (window.location.href = map[step] || "identity-verification.html");
    }

    spinnerOverlay.style.display = "none";
  } catch (err) {
    console.error("Progress check failed:", err);
    spinnerOverlay.style.display = "none";
    window.location.href = "login.html";
  }
})();

const startBtn = document.getElementById("startBtn");
const retakeBtn = document.getElementById("retakeBtn");
const uploadBtn = document.getElementById("uploadBtn");
const submitBtn = document.getElementById("submitBtn");
const preview = document.getElementById("preview");
const progressBar = document.getElementById("progressBar");
const statusText = document.getElementById("statusText");
const instructionText = document.getElementById("ty-instruction");
const spinner = document.getElementById("uploadSpinner");

const idFrontInput = document.getElementById("idFront");
const idBackInput = document.getElementById("idBack");

let mediaRecorder;
let recordedChunks = [];
let videoBlob = null;
let currentInterval;
let stream = null;

const instructions = ["Look up", "Look left", "Look right", "Smile", "Open your mouth"];
let instructionsFollowed = [];

function getRandomInstruction(prev) {
  let newInstruction;
  do {
    newInstruction = instructions[Math.floor(Math.random() * instructions.length)];
  } while (newInstruction === prev);
  return newInstruction;
}

startBtn.onclick = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    preview.srcObject = stream;
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      videoBlob = new Blob(recordedChunks, { type: "video/webm" });
      uploadBtn.disabled = false;
      retakeBtn.disabled = false;
      stopStream();
    };

    mediaRecorder.start();
    startBtn.disabled = true;
    instructionText.textContent = "Recording started...";
    updateProgressBar();
  } catch (err) {
    console.error("Camera Error:", err);
    statusText.textContent = `Camera error: ${err.message}`;
  }
};

function updateProgressBar() {
  let progress = 0;
  let lastInstruction = "";
  const step = 50; // Changed from 20 to 50 (100/2 = 50 for 2 steps)
  const durationPerStep = 8000; // Increased from 6000 to 8000 (8 seconds per instruction)
  instructionsFollowed = []; // Reset instructions

  currentInterval = setInterval(() => {
    progress += step;
    progressBar.style.width = `${progress}%`;
    const newInstruction = getRandomInstruction(lastInstruction);
    instructionText.textContent = newInstruction;
    instructionsFollowed.push(newInstruction); // Track instruction
    lastInstruction = newInstruction;

    if (progress >= 100) {
      clearInterval(currentInterval);
      mediaRecorder.stop();
      instructionText.textContent = "Recording complete. Click Upload.";
    }
  }, durationPerStep);
}

retakeBtn.onclick = () => {
  resetVideo();
};

function resetVideo() {
  videoBlob = null;
  recordedChunks = [];
  preview.srcObject = null;
  progressBar.style.width = "0%";
  instructionText.textContent = "Please follow instructions during recording";
  startBtn.disabled = false;
  uploadBtn.disabled = true;
  retakeBtn.disabled = true;
}

function stopStream() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
}

uploadBtn.onclick = () => {
  if (!videoBlob) return;
  uploadBtn.dataset.uploaded = "true";
  statusText.textContent = "Video ready. Submit to upload.";
};

submitBtn.onclick = async () => {
  const front = idFrontInput.files[0];
  const back = idBackInput.files[0];
  const videoReady = uploadBtn.dataset.uploaded === "true";
  const token = localStorage.getItem("token");

  if (!front || !back || !videoBlob || !videoReady) {
    statusText.textContent = "All fields are required (Front, Back, Video).";
    return;
  }

  if (!token || isTokenExpired(token)) {
    statusText.textContent = "Session expired. Please log in again.";
    return;
  }

  // Extract email from token
  let userEmail;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    userEmail = payload.email;
    if (!userEmail) {
      statusText.textContent = "Invalid token. Please log in again.";
      return;
    }
  } catch (e) {
    statusText.textContent = "Invalid token. Please log in again.";
    return;
  }

  statusText.textContent = "Uploading...";
  spinner.style.display = "block";
  submitBtn.disabled = true;

  const formData = new FormData();
  formData.append("idFront", front);
  formData.append("idBack", back);
  formData.append("video", videoBlob, `liveness_${Date.now()}.webm`);
  formData.append("userEmail", userEmail);
  formData.append("livenessInstructions", JSON.stringify(instructionsFollowed));

  try {
    const response = await fetch(`${config.API_BASE_URL}/api/upload-identity`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    const data = await response.json();
    spinner.style.display = "none";
    console.log("Upload Response:", data);

    if (response.ok && data.success) {
      statusText.textContent = "✅ Identity uploaded. Redirecting...";
      setTimeout(() => {
        window.location.href = "personal.html";
      }, 1500);
    } else {
      submitBtn.disabled = false;
      statusText.textContent = `❌ Upload failed: ${data.message || "Unknown error"}`;
    }
  } catch (err) {
    spinner.style.display = "none";
    submitBtn.disabled = false;
    console.error("Upload Error:", err);
    statusText.textContent = `❌ Submission error: ${err.message}`;
  }
};
