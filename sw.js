/* Stats, Stats — cache hors ligne et mise à jour choisie par l’utilisateur. */
const CACHE = 'stats-stats-v2-programme-octobre-2026';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const legacyInstall = (await caches.keys()).includes('stats-stats-v1');
    // L’application doit être disponible hors ligne avant l’activation.
    await cache.add(new Request('./index.html', {cache: 'reload'}));
    await Promise.all(ASSETS.filter(u => u !== './index.html').map(u =>
      cache.add(new Request(u, {cache: 'reload'})).catch(() => {})));
    // Une mise à jour attend que la saisie en cours soit terminée.
    // L’ancienne app n’a pas de bouton : activer ce premier passage sans recharger sa page.
    if (legacyInstall) await self.skipWaiting();
  })());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('stats-stats-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  if (e.request.mode === 'navigate') {
    // À chaque ouverture, demander la version en ligne ; hors ligne, utiliser la copie locale.
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const pathname = new URL(e.request.url).pathname;
      const isApp = [new URL('./', self.location.href).pathname,
        new URL('./index.html', self.location.href).pathname].includes(pathname);
      const cacheKey = isApp ? './index.html' : e.request;
      try {
        const response = await fetch(e.request, {cache: 'no-store'});
        if (response.ok) {
          await cache.put(cacheKey, response.clone());
          return response;
        }
      } catch (err) {}
      const cached = await cache.match(cacheKey) || await cache.match('./index.html');
      return cached || Response.error();
    })());
    return;
  }
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request);
    if (cached) return cached;
    const response = await fetch(e.request);
    if (response.ok && response.type === 'basic') await cache.put(e.request, response.clone());
    return response;
  })());
});
