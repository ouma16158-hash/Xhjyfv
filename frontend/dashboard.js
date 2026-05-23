document.addEventListener("DOMContentLoaded", function () {
  const menuIcon = document.querySelector(".menu-icon");
  const sidebar = document.querySelector(".sidebar");
  const mainContent = document.querySelector(".main-content");

  menuIcon.addEventListener("click", function () {
    sidebar.classList.toggle("sidebar-visible");

    // On mobile, push content right by sidebar width
    if (window.innerWidth <= 768) {
      if (sidebar.classList.contains("sidebar-visible")) {
        mainContent.style.marginLeft = "25vw"; // Push content right
      } else {
        mainContent.style.marginLeft = "0";
      }
    } else {
      // Desktop already handled by CSS
      if (sidebar.classList.contains("sidebar-visible")) {
        mainContent.style.marginLeft = "220px";
      } else {
        mainContent.style.marginLeft = "0";
      }
    }
  });

  // Reset position when resizing
  window.addEventListener("resize", function () {
    if (window.innerWidth > 768) {
      mainContent.style.marginLeft = sidebar.classList.contains("sidebar-visible") ? "220px" : "0";
    } else {
      mainContent.style.marginLeft = sidebar.classList.contains("sidebar-visible") ? "25vw" : "0";
    }
  });
});
