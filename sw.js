/* CoffeeLab Service Worker — 网络优先 + 离线回退缓存；发版改 CACHE 版本号即可整体失效 */
var CACHE = 'coffeelab-v11';
var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/core.js',
  './js/store.js',
  './js/photos.js',
  './js/ui/app.js',
  './js/ui/beans.js',
  './js/ui/brews.js',
  './js/ui/compare.js',
  './js/ui/settings.js',
  './js/ui/guide.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    /* 网络优先且绕过 HTTP 缓存：在线时总能拿到最新代码，避免停留在旧版本；失败（离线）再回退缓存 */
    fetch(e.request, { cache: 'no-store' }).then(function (res) {
      if (res && res.ok && new URL(e.request.url).origin === location.origin) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
        return hit || Response.error();
      });
    })
  );
});
