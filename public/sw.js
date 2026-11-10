/* Offline shell for Spine Route.
 *
 * Everything the app computes — quotes, bin packing, the trading agent, ISBN
 * lookups for catalogued books — already runs on the device. This worker only
 * makes sure the shell and the hashed build assets are there when the phone has
 * no signal, which is exactly when a book box in a park is worth scanning.
 */
const CACHE = "spine-route-v1";
const SHELL = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => undefined).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((response) => {
          // The OCR engine's worker, WASM core and language model are large and only
          // fetched on demand; cache them the first time so a shelf reads offline later.
          // The OCR engine and the spine-detection model are large and fetched on
          // demand; cache them the first time so a shelf reads offline later.
          const cacheable =
            url.pathname.startsWith("/assets/") ||
            url.pathname.startsWith("/_build/") ||
            url.pathname.startsWith("/tesseract/") ||
            url.pathname.startsWith("/models/");
          if (response.ok && cacheable) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => hit);
    }),
  );
});
