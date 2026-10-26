const CACHE = "micafe-admin-v3";
const ASSETS = ["/admin", "/admin/login"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || e.request.mode !== "navigate") return;

  const url = new URL(e.request.url);

  if (url.origin !== self.location.origin) return;
  if (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/")) return;

  // El HTML referencia chunks de un build concreto. Servir primero una copia
  // anterior puede impedir la hidratación después de un rollout.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(e.request, { cache: "no-store" });
      if (response.status === 200) e.waitUntil(cache.put(e.request, response.clone()));
      return response;
    } catch {
      return await cache.match(e.request) || new Response("Sin conexión. Conéctate a internet y vuelve a intentar.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("micafe-admin-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
