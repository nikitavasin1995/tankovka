// Natankováno — service worker: позволяет установить сайт как приложение
// и открыть интерфейс без сети. Всегда сначала берём свежую версию из сети,
// а сохранённую копию используем только когда сети нет — так обновления
// доходят до всех сразу. Данные Supabase, карта и библиотеки не кешируются.
const CACHE = 'natankovano-v9';
const SHELL = [
  './', 'index.html', 'styles.css', 'i18n.js', 'app.js', 'config.js', 'data/pubs.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === 'navigate' ? caches.match('./') : undefined))
        .then(hit => hit || Response.error())));
});
