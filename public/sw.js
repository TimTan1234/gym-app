// GymPal service worker.
// Caches only static build assets and an offline page. Personal data pages
// and API responses are never cached, so nothing private is stored on disk.
const VERSION = "v2";
const STATIC_CACHE = `gympal-static-${VERSION}`;
// Build assets are kept apart from the offline page, so trimming them never removes it.
const ASSET_CACHE = `gympal-assets-${VERSION}`;
// Each build brings new hashed files; keep the newest ones and let older builds' files go.
const MAX_ASSETS = 200;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("gympal-") && k !== STATIC_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache keys come back in the order they were added: drop the oldest past the cap.
async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Immutable, content-hashed build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(request, copy).then(() => trim(c)));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Page navigations: always network; show the offline page when it fails.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});

// Reminders sent by /api/reminders/send: { title, body, url, tag }.
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "GymPal", {
      body: data.body,
      tag: data.tag,
      icon: "/icons/icon-192.png",
      data: { url: data.url || "/today" },
    }),
  );
});

// Tapping one opens its page: in a GymPal window that's already open, or a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/today", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (!open) return self.clients.openWindow(url);
      // navigate() only works on a window this worker controls; otherwise open a fresh one.
      return open.focus().then((w) => w.navigate(url)).catch(() => self.clients.openWindow(url));
    }),
  );
});
