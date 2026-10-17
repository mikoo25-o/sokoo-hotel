/* SokoHotel service worker (v2).
 *
 * 1. Static files (scripts, icons, photos) are cached so the app opens fast.
 * 2. Pages you have opened are kept as a "last seen" copy. With no internet
 *    you can still open them and read the screen. Anything you do (send an
 *    order, take a payment) still needs a connection, and the app says so.
 *    The copy is only used when the network fails; online, you always get the
 *    live page.
 * 3. The copies belong to the person using the phone. They are deleted when
 *    that person signs out. Pages that are not part of the signed-in app
 *    (login, sign-up, downloads, API calls) are never stored. */
const VERSION = "sh-v2";
const STATIC_CACHE = `static-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;
const MAX_PAGES = 40;
const PRECACHE = ["/offline", "/icons/icon-192.png", "/brand/logo-mark.png", "/brand/logo-mark-white.png"];

const APP_PATHS = ["/waiter", "/kitchen", "/cashier", "/manager", "/account", "/workspace"];
const NEVER_CACHE = ["/manager/reports/export", "/auth", "/api", "/join"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear-pages") event.waitUntil(caches.delete(PAGE_CACHE));
});

const isStaticAsset = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/icons/") ||
  url.pathname.startsWith("/brand/") ||
  url.pathname.startsWith("/landing/");

const isAppPage = (url) =>
  APP_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(p + "/")) &&
  !NEVER_CACHE.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"));

const pageKey = (url) => url.origin + url.pathname + url.search;

async function remember(url, response) {
  const cache = await caches.open(PAGE_CACHE);
  await cache.put(pageKey(url), response);
  const keys = await cache.keys();
  if (keys.length > MAX_PAGES) await Promise.all(keys.slice(0, keys.length - MAX_PAGES).map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Only a normal page from the signed-in app is kept. Redirects (for
          // example to /login after the session ended) are never stored.
          if (res.ok && !res.redirected && isAppPage(url)) event.waitUntil(remember(url, res.clone()));
          return res;
        })
        .catch(async () => {
          const page = isAppPage(url) ? await (await caches.open(PAGE_CACHE)).match(pageKey(url)) : undefined;
          return page || (await caches.match("/offline"));
        }),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
  }
});
