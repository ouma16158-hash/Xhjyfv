const token = localStorage.getItem("token");

if (!token) {
  window.location.href = "login.html";
} else {
  setTimeout(() => {
    window.location.href = "dashboard_page.html";
  }, 2000);
}
