/* Joust service worker — Notifications programmées + Web Push.
   Installation volontairement minimale pour garantir que le SW s'installe
   sur iOS 16.4+ (aucun cache.addAll bloquant qui peut faire échouer
   l'installation du SW sur iPhone). */
const CACHE = "joust-shell-v2";
const PRECACHE = ["/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
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

/* ── Stockage local (IndexedDB) : contexte push + programmation ── */
const PUSH_DB = "joust-push";
const PUSH_STORE = "ctx";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PUSH_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(PUSH_STORE)) {
        req.result.createObjectStore(PUSH_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getIdbValue(key) {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(PUSH_STORE, "readonly");
      const req = tx.objectStore(PUSH_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setIdbValue(key, value) {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(PUSH_STORE, "readwrite");
      tx.objectStore(PUSH_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* IndexedDB indisponible */
  }
}

async function deleteIdbValue(key) {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(PUSH_STORE, "readwrite");
      tx.objectStore(PUSH_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* rien à faire */
  }
}

/* ── Notifications programmées (Notification Triggers / showTrigger) ──
   Approche simple et robuste : le client programme une notification
   LOCALE à l'heure du duel (scheduledAt). Elle se déclenche même si le
   lien push expire entre-temps. À chaque retour sur l'app, le client
   vérifie que la programmation est toujours attendue et la met à jour. */

/* Tag fixe : une seule notification programmée à la fois. */
const SCHEDULED_TAG = "joust-scheduled-alert";

/* Vérifie que l'API Notification Triggers est disponible (Chrome/Edge). */
function hasShowTrigger() {
  return typeof self.registration !== "undefined" &&
    self.registration.showNotification &&
    typeof TimestampTrigger !== "undefined";
}

/* Message du client : programmer / annuler / interroger la notification locale. */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  const type = data.type;

  if (type === "joust-schedule") {
    event.waitUntil(
      (async () => {
        try {
          const { scheduledAt, title, body, url, matchId } = data;
          const ts = new Date(scheduledAt).getTime();
          if (!ts || Number.isNaN(ts)) return;

          /* Si le trigger n'est pas supporté, on stocke juste l'intention :
             le push serveur reste la voie de secours. */
          const supportsTrigger = hasShowTrigger();

          if (supportsTrigger) {
            const trigger = new TimestampTrigger(ts);
            await self.registration.showNotification(title || "⏰ C'est l'heure !", {
              body: body || "Votre joust commence maintenant.",
              icon: "/icons/icon-512.png",
              badge: "/icons/icon-512.png",
              tag: SCHEDULED_TAG,
              data: { url: url || "/", matchId },
              showTrigger: trigger,
            });
          }

          /* Mémorise la programmation pour la vérification au retour. */
          await setIdbValue("scheduled", {
            matchId,
            scheduledAt: ts,
            supportsTrigger,
            title: title || "⏰ C'est l'heure !",
            body: body || "Votre joust commence maintenant.",
            url: url || "/",
          });
        } catch {
          /* Programmation impossible (ex. non supportée) : on laisse le push serveur */
        }
      })(),
    );
  } else if (type === "joust-cancel-schedule") {
    event.waitUntil(
      (async () => {
        try {
          const reg = self.registration;
          const notifs = await reg.getNotifications({ tag: SCHEDULED_TAG });
          for (const n of notifs) n.close();
          await deleteIdbValue("scheduled");
        } catch {
          /* rien à nettoyer */
        }
      })(),
    );
  } else if (type === "joust-get-schedule") {
    event.waitUntil(
      (async () => {
        try {
          const scheduled = await getIdbValue("scheduled");
          event.source && event.source.postMessage({ type: "joust-schedule-state", scheduled });
        } catch {
          /* pas de programmation */
        }
      })(),
    );
  }
});

/* ── Auto-ré-abonnement push quand le navigateur renouvelle la souscription ──
   Complément utile : si le push est disponible, on maintient le lien. */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const ctx = await getIdbValue("pushCtx");
        if (!ctx || !ctx.matchId || !ctx.playerName) return;

        const v = await (await fetch("/api/push/vapid", { cache: "no-store" })).json();
        if (!v.publicKey) return;

        const newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(v.publicKey),
        });

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchId: ctx.matchId,
            playerName: ctx.playerName,
            notify5min: typeof ctx.notify5min === "boolean" ? ctx.notify5min : true,
            subscription: newSub.toJSON(),
          }),
        });
      } catch {
        /* Réessai au prochain événement / ouverture */
      }
    })(),
  );
});

/* ── Aide VAPID ── */
function urlBase64ToUint8Array(b64) {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const r = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = atob(r);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return arr;
}

/* ── Web Push (serveur → appareil) ── */
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
    tag: payload.tag || "synchro-alert",
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