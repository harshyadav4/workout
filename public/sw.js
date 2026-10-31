/*
 * Arise service worker. Lets the installed app open in a gym basement with no
 * signal: the app shell and its code come from the cache, and the data is
 * already on the phone (the store lives in localStorage and syncs when it can).
 *
 * Deliberately small:
 *   - pages:          network first, last good copy when offline
 *   - Next's tab data: network first, the tab's saved data when offline
 *   - /_next/static:  cache first (file names are content hashes, never stale)
 *   - exercises.json, foods.json, icons: stale while revalidate
 *   - /api/demo:      cache first (library demos never change under their
 *                     name; kept so a demo opens with no signal)
 *   - everything else, and every other origin (Supabase, the rest of /api):
 *     not touched at all, so no request is ever served stale data.
 *
 * Once per release the page asks this worker to save all the code and the tabs
 * in one go (saveOffline, below). Without that, a file was saved only when a
 * screen first needed it, and each release renames the files. So a tab or a
 * muscle map not opened since the last release was missing with no signal.
 *
 * Next asks for a tab's data (a request with an `RSC` header), not its page, when
 * the dock changes tab. With no answer it reloads the whole page, which flickers,
 * and an installed iPhone app seems to come back from that reload a status bar short.
 *
 * Bump VERSION only to drop every old cache on the next visit. A bump costs every
 * phone its saved code until the next save has finished, so a phone that loses
 * signal in that time cannot open the app. A new release does not need a bump.
 */
const VERSION = "v7";
const SHELL = `gymflow-shell-${VERSION}`;
const STATIC = `gymflow-static-${VERSION}`;
// Not versioned: the files are immutable, and re-downloading every demo on each
// release would cost the user's data for nothing.
const DEMOS = "gymflow-demos";
const PAGES = ["/", "/plan", "/skills", "/progress", "/profile"];
const PRECACHE = [...PAGES, "/manifest.webmanifest", "/icon-192.png"];
// Written by scripts/write-offline-list.mjs. A copy kept in the cache says which
// release has been saved, so it is only done once per release.
const OFFLINE_LIST = "/offline-files.json";
const CODE = /\.(js|css)$/;

// An address no page has, so the page lookups below can never answer with this.
const tabDataKey = (path) => `${path}?tab-data`;

/**
 * Every code file first, then the tabs. A tab's page names this release's files,
 * so it must never be saved before they are. Any failure leaves the list unsaved,
 * and the next open tries again.
 */
async function saveOffline() {
  const response = await fetch(OFFLINE_LIST, { cache: "no-store" });
  if (!response.ok) return;
  const text = await response.text();
  const files = JSON.parse(text);
  if (!Array.isArray(files) || files.length === 0) return;

  const code = await caches.open(STATIC);
  const shell = await caches.open(SHELL);
  const saved = await code.match(OFFLINE_LIST);
  // The tab data as well: an older worker saved this release without it.
  if (saved && (await saved.text()) === text && (await shell.match(tabDataKey("/")))) return;

  // One at a time: this runs behind whatever the person is doing.
  const saveFiles = async () => {
    for (const file of files) {
      if (await code.match(file)) continue;
      const download = await fetch(file);
      if (!download.ok) throw new Error(`Could not save ${file}`);
      await code.put(file, download);
    }

    for (const page of PAGES) {
      const download = await fetch(page);
      if (!download.ok) throw new Error(`Could not save ${page}`);
      await shell.put(page, download);

      const data = await fetch(page, { headers: { RSC: "1" } });
      if (!data.ok) throw new Error(`Could not save the data of ${page}`);
      await shell.put(tabDataKey(page), data);
    }
  };

  // The last release's code goes, or each release would add to the phone's storage.
  const current = new Set(files);
  const dropOldCode = async () => {
    for (const request of await code.keys()) {
      const { pathname } = new URL(request.url);
      if (pathname.startsWith("/_next/static/") && CODE.test(pathname) && !current.has(pathname)) {
        await code.delete(request);
      }
    }
  };

  try {
    await saveFiles();
  } catch (error) {
    // A full phone: the old code goes first after all. A file saved already is skipped.
    if (error?.name !== "QuotaExceededError") throw error;
    await dropOldCode();
    await saveFiles();
  }
  await dropOldCode();

  await code.put(OFFLINE_LIST, new Response(text));
}

let saving;
self.addEventListener("message", (event) => {
  if (event.data?.type !== "save-offline") return;
  saving ??= saveOffline()
    // With no signal, or a bad file, nothing is lost: the next open tries again.
    .catch(() => undefined)
    .finally(() => {
      saving = undefined;
    });
  event.waitUntil(saving);
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // One failed page must not abort the install. A saved page stays: the next
      // release's page names code not saved yet, and saveOffline replaces it in order.
      .then((cache) =>
        Promise.all(PRECACHE.map(async (url) => (await cache.match(url)) || cache.add(url).catch(() => undefined)))
      )
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

  // A tab change. A prefetch gets nothing here: its answer has another shape, and
  // when one fails Next simply asks again on the tap.
  if (request.headers.has("RSC") && !request.headers.has("Next-Router-Prefetch")) {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(tabDataKey(url.pathname))) || Response.error())
    );
    return;
  }

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
        .catch(
          async () =>
            (await caches.match(request)) ||
            // "/plan?mode=build" is still the Plan page, not Today.
            (await caches.match(url.pathname)) ||
            (await caches.match("/")) ||
            Response.error()
        )
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

  if (url.pathname === "/exercises.json" || url.pathname === "/foods.json" || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
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
