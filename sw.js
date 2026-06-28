/* Fuel — service worker
   IMPORTANTE: incremente CACHE_VERSION a cada deploy para forçar a atualização
   do app no dispositivo. Sem isso, o aparelho continua servindo a versão antiga. */
const CACHE_VERSION = 'fuel-v9';

/* App shell (mesma origem). addAll é atômico: se um falhar, o install falha. */
const SHELL = [
  './',
  'index.html',
  'dados-taco.js',
  'app.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

/* Dependências externas (CDN). Best-effort: não derrubam o install se falharem. */
const CDN = [
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7.25.6/babel.min.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(SHELL).then(function () {
        // CDNs: tenta cada uma, ignora falhas individuais
        return Promise.all(CDN.map(function (url) {
          return cache.add(new Request(url, { mode: 'cors' })).catch(function () {});
        }));
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_VERSION) return caches.delete(k); // limpa versões antigas
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  // Navegação: tenta rede, cai para o index do cache (offline)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match('index.html').then(function (r) {
          return r || caches.match('./');
        });
      })
    );
    return;
  }

  // Demais GETs: cache-first, com revalidação em rede
  event.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
