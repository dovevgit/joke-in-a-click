// Service worker בגישת network-first: קודם רשת, ואם אין רשת, מהמטמון.
// בקשות ל-/api לא נשמרות אף פעם: כל בדיחה צריכה להגיע מהשרת.

const CACHE = "joke-v1";

const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/assets/logo.svg",
  "/assets/mascot-idle.svg",
  "/assets/mascot-think.svg",
  "/assets/mascot-joke.svg",
  "/assets/mascot-error.svg",
  "/assets/bg-dots.svg",
  "/assets/bg-doodles.svg",
  "/assets/icon.svg",
  "/assets/icon-maskable.svg",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // מוחקים מטמונים של גרסאות קודמות
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api")) {
    return; // לא נוגעים
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
