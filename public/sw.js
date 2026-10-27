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
const VERSION = "v6";
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

// Background Sync (Android Chrome): a push to the account failed offline and
// the page asked to be woken when the network is back. The diff and the data
// live in the page, so the worker's whole job is to tell any open window to
// flush. With no window there is nothing to replay; the rows wait on the
// device for the next launch.
self.addEventListener("sync", (event) => {
  if (event.tag !== "push-changes") return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => windows.forEach((client) => client.postMessage({ type: "retry-sync" })))
  );
});

// The two keys on a "Rest done" notification. Android shows them; iPhone
// shows the notification without them.
const REST_ACTIONS = [
  { action: "extend", title: "+15s" },
  { action: "skip", title: "Skip" }
];

// Web Push from the server (supabase/functions/send-rest-alerts): the layer a
// locked phone still receives. A push must show a notification, or the
// browser shows a generic one in its place.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Not JSON: the defaults below say the right thing anyway.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Rest done", {
      body: data.body || "Time for your next set.",
      tag: data.tag || "rest",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      renotify: true,
      data: { url: data.url || "/" },
      actions: REST_ACTIONS
    })
  );
});

// "Rest done" (features/pwa/rest-alerts.tsx, or the push above): a tap brings
// the app back — the open window if there is one, else a new one on Today.
// "+15s" and "Skip" go to the open window as a message (the rest lives there);
// with no window, "+15s" opens one that starts a fresh fifteen, and "Skip" has
// nothing left to skip.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const action = event.action;
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (action === "extend" || action === "skip") {
        if (open) {
          open.postMessage({ type: "rest", action });
          return action === "extend" ? open.focus() : undefined;
        }
        return action === "extend" ? self.clients.openWindow("/?rest=extend") : undefined;
      }
      if (open) return open.focus();
      return self.clients.openWindow(target);
    })
  );
});
