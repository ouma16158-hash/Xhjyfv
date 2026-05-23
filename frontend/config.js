const config = {
  // Local development
  LOCAL_API_BASE_URL: "http://localhost:5000",

  // GitHub Codespaces
  CODESPACE_API_BASE_URL: "https://opulent-broccoli-wrjq6q4j7757c5gqg-5000.app.github.dev",

  // Render deployment
  RENDER_API_BASE_URL: "https://onraiser.replit.app",

  // Replit environment
  REPLIT_API_BASE_URL: window.location.origin,

  // ✅ Dynamically select API base URL depending on where app is running
  get API_BASE_URL() {
    if (window.location.hostname.includes("github.dev")) {
      return this.CODESPACE_API_BASE_URL;
    } else if (window.location.hostname.includes("onrender.com")) {
      return this.RENDER_API_BASE_URL;
    } else if (
      window.location.hostname.includes("replit.dev") ||
      window.location.hostname.includes("replit.co") ||
      window.location.hostname.includes("repl.co") ||
      window.location.hostname.includes("replit.app")
    ) {
      return this.REPLIT_API_BASE_URL;
    } else {
      return this.LOCAL_API_BASE_URL;
    }
  }
};
