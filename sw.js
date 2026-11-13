/* Service Worker fuer den Redaktions-Modus (siehe demo/github-store.js).
   Neu hochgeladene Bilder liegen nur im privaten Repo, nicht in der oeffentlichen Vorschau - damit
   sie im Admin trotzdem erscheinen, beantwortet dieser Worker Anfragen an uploads/* aus
   1. dem lokalen Cache (auf diesem Geraet hochgeladen), 2. der Vorschau, 3. dem privaten Repo.
   Er fasst nichts anderes an. */
const CACHE = 'agb-uploads';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function readConfig() {
  return new Promise((resolve) => {
    const open = indexedDB.open('agb', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      const get = open.result.transaction('kv').objectStore('kv').get('config');
      get.onsuccess = () => resolve(get.result || null);
      get.onerror = () => resolve(null);
    };
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.includes('/uploads/')) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;

    const network = await fetch(event.request).catch(() => null);
    if (network && network.ok) return network;

    // Nicht in der Vorschau: aus dem privaten Repo holen (nur mit Zugangsdaten, z.B. auf einem anderen Geraet)
    const cfg = await readConfig();
    if (!cfg) return network || Response.error();
    const path = url.pathname.slice(url.pathname.indexOf('/uploads/') + 1);
    const repoFile = await fetch(cfg.apiBase + '/repos/' + cfg.repo + '/contents/' + path + '?ref=' + encodeURIComponent(cfg.branch), {
      headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github.raw+json' },
    }).catch(() => null);
    if (repoFile && repoFile.ok) {
      await cache.put(event.request, repoFile.clone());
      return repoFile;
    }
    return network || repoFile || Response.error();
  })());
});
