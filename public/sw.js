const CACHE = "micafe-admin-v2";
const ASSETS = ["/admin", "/admin/login"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/__next") || url.pathname.includes(".")) {
    return;
  }

  if (url.pathname.startsWith("/admin")) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const fetched = fetch(e.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(e.request, clone));
          }
          return response;
        }).catch(() => cached || new Response("Offline", { status: 503 }));
        return cached || fetched;
      })
    );
  }
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
});
