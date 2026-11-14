const CACHE = 'mes-exercices-v189';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'fonts/poppins-Regular.woff', 'fonts/poppins-Medium.woff', 'fonts/poppins-Bold.woff', 'fonts/chancery.woff'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () { /* fichier absent : on continue */ }); })); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});

/* réseau d'abord (toujours la dernière version), cache en secours hors ligne */
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(function (res) {
    var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(r, cp); }); return res;
  }).catch(function () { return caches.match(r, { ignoreSearch: true }).then(function (m) { return m || caches.match('index.html'); }); }));
});
