/* Joust service worker — Web Push. Installation volontairement minimale
   pour garantir que le SW s'installe sur iOS 16.4+ (aucun cache.addAll
   bloquant qui peut faire échouer l'installation du SW sur iPhone). */
const CACHE = "joust-shell-v2";
const PRECACHE = ["/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  /* On tente un pré-cache minimal des icônes uniquement (fichiers statiques
     sûrs). S'il échoue, on N'EMPÊCHE PAS l'installation du SW. */
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .catch(() => undefined),
  );
});

/* Rien pour fetch : le serveur Next gère tout. (on ne matérialise pas la
   navigation pour éviter d'interférer avec l'app) */

/* ── Web Push ── */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    /* ignore malformed payload */
  }

  const title = payload.title || "Joust";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-512.png",
    badge: "/icons/icon-512.png",
    vibrate: [180, 90, 180],
    data: { url: payload.url || "/" },
    tag: "synchro-alert",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});