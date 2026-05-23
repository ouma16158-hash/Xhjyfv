const form = document.getElementById("adminLoginForm");
const errorText = document.getElementById("adminLoginError");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorText.style.display = "none";

  const formData = new FormData(form);
  const email = formData.get("email");
  const password = formData.get("password");

  console.log("Attempting login with:", { email, password: "***" });

  try {
    const response = await fetch(`${config.API_BASE_URL}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    console.log("Response status:", response.status);
    console.log("Response headers:", response.headers.get("content-type"));

    const responseText = await response.text();
    console.log("Raw response:", responseText);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Response was:", responseText);
      throw new Error("Server returned invalid response");
    }

    if (response.ok && result.token) {
      localStorage.setItem("admin_token", result.token);
      window.location.href = "admin-dashboard.html";
    } else {
      errorText.textContent = result.message || "Login failed";
      errorText.style.display = "block";
    }
  } catch (err) {
    console.error("Login error:", err);
    errorText.textContent = "Server error. Please try again.";
    errorText.style.display = "block";
  }
});