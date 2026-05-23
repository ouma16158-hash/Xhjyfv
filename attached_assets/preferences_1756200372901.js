
(async () => {
  const token = localStorage.getItem("token");
  const spinnerOverlay = document.getElementById("spinnerOverlay");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  try {
    spinnerOverlay.style.display = "flex";

    const res = await fetch(`${config.API_BASE_URL}/api/user/progress`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    const step = data.current_step || "identity";
    const status = data.status || "pending";

    if (status === "approved") {
      window.location.href = "dashboard_page.html";
      return;
    }

    if (status === "disapproved") {
      window.location.href = "submission.html";
      return;
    }

    if (step !== "preferences") {
      if (step === "identity") window.location.href = "identity-verification.html";
      else if (step === "personal") window.location.href = "personal.html";
      else if (step === "submission") window.location.href = "submission.html";
      else window.location.href = "identity-verification.html";
      return;
    }

    spinnerOverlay.style.display = "none";
  } catch (err) {
    console.error("Progress check failed:", err);
    spinnerOverlay.style.display = "none";
    window.location.href = "login.html";
  }
})();

const form = document.getElementById("preferencesForm");
const spinner = document.getElementById("spinner");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  spinner.style.display = "block";

  const formData = new FormData(form);
  const token = localStorage.getItem("token");

  if (!token) {
    alert("Session expired. Please log in again.");
    spinner.style.display = "none";
    return;
  }

  const payload = {
    pref_gender: formData.get("pref_gender"),
    pref_age_min: parseInt(formData.get("pref_age_min")),
    pref_age_max: parseInt(formData.get("pref_age_max")),
    pref_country_of_birth: formData.get("pref_country_of_birth"),
    pref_country_of_residence: formData.get("pref_country_of_residence"),
    pref_county_of_residence: formData.get("pref_county_of_residence"),
    pref_country: formData.get("pref_country"),
    pref_languages: formData.getAll("pref_languages"),
    pref_religion: formData.get("pref_religion"),
    pref_religion_importance: formData.get("pref_religion_importance"),
    pref_height: parseInt(formData.get("pref_height")),
    pref_weight: parseInt(formData.get("pref_weight")),
    pref_body_type: formData.get("pref_body_type"),
    pref_skin_color: formData.get("pref_skin_color"),
    pref_ethnicity: formData.get("pref_ethnicity"),
    pref_diet: formData.get("pref_diet"),
    pref_smoking: formData.get("pref_smoking"),
    pref_drinking: formData.get("pref_drinking"),
    pref_exercise: formData.get("pref_exercise"),
    pref_pets: formData.get("pref_pets"),
    pref_children: formData.get("pref_children"),
    pref_living_situation: formData.get("pref_living_situation"),
    pref_willing_to_relocate: formData.get("pref_willing_to_relocate"),
    pref_relationship_type: formData.get("pref_relationship_type")
  };

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
    spinner.style.display = "none";

    if (response.ok && result.success) {
      window.location.href = "submission.html";
    } else {
      alert("❌ " + (result.message || "Error saving preferences."));
    }
  } catch (error) {
    spinner.style.display = "none";
    alert("❌ Network error. Try again.");
    console.error(error);
  }
});
