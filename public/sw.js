/*
 * Arise service worker. Lets the installed app open in a gym basement with no
 * signal: the app shell and its code come from the cache, and the data is
 * already on the phone (the store lives in localStorage and syncs when it can).
 *
 * Deliberately small:
 *   - pages:          network first, last good copy when offline
 *   - /_next/static:  cache first (file names are content hashes, never stale)
 *   - exercises.json, icons: stale while revalidate
 *   - /api/demo:      cache first (library demos never change under their
 *                     name; kept so a demo opens with no signal)
 *   - everything else, and every other origin (Supabase, the rest of /api):
 *     not touched at all, so no request is ever served stale data.
 *
 * Bump VERSION to drop every old cache on the next visit.
 */
const VERSION = "v4";
const SHELL = `gymflow-shell-${VERSION}`;
const STATIC = `gymflow-static-${VERSION}`;
// Not versioned: the files are immutable, and re-downloading every demo on each
// release would cost the user's data for nothing.
const DEMOS = "gymflow-demos";
const PRECACHE = ["/", "/plan", "/skills", "/progress", "/profile", "/manifest.webmanifest", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // One failed page must not abort the install.
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL && key !== STATIC && key !== DEMOS).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/demo/")) {
    event.respondWith(
      caches.open(DEMOS).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/")) || Response.error())
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  if (url.pathname === "/exercises.json" || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => hit);
        return hit || network;
      })
    );
  }
});
