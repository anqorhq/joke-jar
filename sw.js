// Offline support: pre-cache the app shell so it works with no connection.
// Bump VERSION on every deploy so devices pick up the new files.
const VERSION = "1.0.0";
const CACHE = `joke-jar-${VERSION}`;
const FILES = [
  "./", "index.html", "app.css", "app.js", "db.js", "manifest.webmanifest", "jokes.sample.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("joke-jar-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first (so updates arrive as soon as you're online), falling back to
// the cache after a short timeout or when offline.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const network = fetch(req, { cache: "no-cache" }).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
    network.catch(() => {}); // handled below; avoid unhandled-rejection noise
    const timeout = new Promise(r => setTimeout(r, 3000));
    try {
      const res = await Promise.race([network, timeout]);
      if (res) return res;
    } catch {}
    const hit = await cache.match(req, { ignoreSearch: true })
      ?? (req.mode === "navigate" ? await cache.match("index.html") : undefined);
    return hit ?? network.catch(() => Response.error());
  })());
});
