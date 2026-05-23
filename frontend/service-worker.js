// ⚡ Cache name
const CACHE_NAME = "onraiser-cache-v1";

// ✅ Files to cache for offline use
const STATIC_ASSETS = [
  "/styles.css",
  "/images/favicon.png"
];

// 🧹 Install: clear old caches and cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(cacheNames.map((name) => caches.delete(name)))
    ).then(() => {
      return caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      });
    })
  );
});

// 🌍 Fetch:
// - Always fetch fresh HTML from network
// - Cache-first for static assets
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match("/index.html")
      )
    );
  } else {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});

// 🔄 Activate: claim clients immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
