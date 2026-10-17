
const CACHE_VERSION = "v10";
const CACHE_NAME = `jumpingjack-${CACHE_VERSION}`;

// App shell: everything needed to run the game fully offline.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./main.js",
  "./manifest.webmanifest",
  "./ProfanityFilter.js",
  "./Leaderboard.js",
  "./NameEntry.js",
  "./leaderboardService.js",
  "./assets/jumpingjack-font.js",
  "./assets/jumpingjack-graphics.js",
  "./images/favicon.ico",
  "./images/favicon.png",
  "./images/icon-192.png",
  "./images/icon-512.png",
  "./images/icon-maskable-192.png",
  "./images/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Only handle same-origin GET requests; let everything else (e.g. the
  // goatcounter analytics script) go straight to the network.
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const responseClone = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => {
          // Offline and not cached: fall back to the app shell for
          // navigation requests so the game still loads.
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return undefined;
        });
    })
  );
});
