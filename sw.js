const CACHE = 'mes-exercices-v197';
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

/* ---------- chrono en arrière-plan : notification avec boutons ----------
   Les minuteurs sont copiés par la page dans IndexedDB (« mes-exercices-sw », clé « chronos »). La page demande l'affichage quand tu la quittes
   et le retrait quand tu reviens. Les boutons modifient la copie ; la page la reprend à son retour (la plus récente l'emporte). */
function kv() { return new Promise(function (ok, ko) { var r = indexedDB.open('mes-exercices-sw', 1); r.onupgradeneeded = function () { r.result.createObjectStore('kv'); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { ko(r.error); }; }); }
function kvGet(k) { return kv().then(function (db) { return new Promise(function (ok, ko) { var q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { ok(q.result); }; q.onerror = function () { ko(q.error); }; }); }); }
function kvSet(k, v) { return kv().then(function (db) { return new Promise(function (ok, ko) { var tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = function () { ok(); }; tx.onerror = function () { ko(tx.error); }; }); }); }
function fmtMs(ms) { var t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + ('0' + m).slice(-2) : ('0' + m).slice(-2)) + ':' + ('0' + s).slice(-2); }
function hm(ts) { var d = new Date(ts); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
function showChrono(id, c) {
  var run = !!c.start, el = (c.acc || 0) + (run ? Date.now() - c.start : 0);
  return self.registration.showNotification(c.titre || 'Exercice', {
    body: run ? 'Chrono en cours depuis ' + hm(c.start) + (c.min ? ' · prévu ' + c.min + ' min' : '') : 'En pause : ' + fmtMs(el) + (c.min ? ' sur ' + c.min + ' min' : ''),
    tag: 'chrono-' + id, data: { id: id }, requireInteraction: true, silent: true, renotify: false, icon: 'icon-192.png', badge: 'icon-192.png',
    actions: [{ action: run ? 'pause' : 'resume', title: run ? 'Pause' : 'Reprendre' }, { action: 'reset', title: 'Remettre à zéro' }]
  }).catch(function () { /* notifications non autorisées */ });
}
function chronoAct(id, act) {
  return kvGet('chronos').then(function (map) {
    map = map || {}; var c = map[id], now = Date.now(); if (!c || c.gone) return map;
    if (act === 'pause' && c.start) { c.acc = (c.acc || 0) + now - c.start; c.start = null; c.t = now; }
    else if (act === 'resume' && !c.start) { c.start = now; c.t = now; }
    else if (act === 'reset') { map[id] = { gone: 1, t: now }; }
    return kvSet('chronos', map).then(function () { return map; });
  });
}
function tellClients() { return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) { cs.forEach(function (c) { c.postMessage({ type: 'chrono-sync' }); }); return cs; }); }

self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type === 'chrono-notif') {
    e.waitUntil(d.show
      ? kvGet('chronos').then(function (map) { map = map || {}; return Promise.all(Object.keys(map).filter(function (id) { return !map[id].gone; }).map(function (id) { return showChrono(id, map[id]); })); }).catch(function () { /* ignoré */ })
      : self.registration.getNotifications().then(function (ns) { ns.forEach(function (n) { if ((n.tag || '').indexOf('chrono-') === 0) n.close(); }); }));
  } else if (d.type === 'chrono-act') { /* même chemin que les boutons de la notification (utile aussi pour les tests) */
    e.waitUntil(chronoAct(d.id, d.action).then(function () { return tellClients(); }));
  }
});

self.addEventListener('notificationclick', function (e) {
  var n = e.notification, id = n.data && n.data.id, act = e.action;
  if (!act) { /* touche sur la notification elle-même : ouvre l'appli */
    n.close();
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) { return cs.length ? cs[0].focus() : self.clients.openWindow('./'); }));
    return;
  }
  e.waitUntil(chronoAct(id, act).then(function (map) {
    var c = map[id]; if (act === 'reset' || !c || c.gone) n.close(); else return showChrono(id, c);
  }).then(function () { return tellClients(); }));
});
