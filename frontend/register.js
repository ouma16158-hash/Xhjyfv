function toggleVisibility(id) {
  const input = document.getElementById(id);
  const toggleBtn = input.nextElementSibling;
  if (input.type === "password") {
    input.type = "text";
    toggleBtn.innerText = "Hide";
  } else {
    input.type = "password";
    toggleBtn.innerText = "Show";
  }
}

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const msg = document.getElementById("registerMsg");
  const loader = document.getElementById("loadingMsg");
  msg.innerText = "";
  loader.style.display = "block";

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (password !== confirmPassword) {
    loader.style.display = "none";
    msg.innerText = "❌ Passwords do not match.";
    return;
  }

  try {
    console.log(`🔄 Attempting to send OTP to: ${email}`);
    console.log(`🔄 Using API endpoint: ${config.API_BASE_URL}/api/send-otp`);
    
    const res = await fetch(`${config.API_BASE_URL}/api/send-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    console.log(`📡 Response status: ${res.status}`);
    console.log(`📡 Response headers:`, res.headers);
    
    const data = await res.json();
    console.log(`📦 Response data:`, data);
    
    loader.style.display = "none";

    if (res.ok) {
      console.log(`✅ OTP request successful for: ${email}`);
      localStorage.setItem("email", email);
      localStorage.setItem("password", password);
      window.location.href = "confirm.html";
    } else {
      console.log(`❌ OTP request failed for: ${email}, Error: ${data.error}`);
      msg.innerText = `❌ ${data.error || "Failed to send OTP."}`;
    }
  } catch (error) {
    console.error(`🚨 Network error during OTP request:`, error);
    loader.style.display = "none";
    msg.innerText = "❌ Network error. Try again later.";
  }
});