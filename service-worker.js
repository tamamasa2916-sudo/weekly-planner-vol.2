/**
 * service-worker.js  —  週間スケジュール表 PWA
 *
 * キャッシュ戦略
 *   アプリシェル           → Cache First
 *   Google Fonts CSS       → Network First（失敗時 Cache）
 *   Google Fonts フォント  → Cache First（長期保持）
 *   その他 GET             → Network First（失敗時 Cache）
 */

'use strict';

const CACHE_VER  = 'v2';
const CACHE_NAME = 'schedule-' + CACHE_VER;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
];

/* ── install ── */
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(c) { return c.addAll(APP_SHELL); })
      .then(function()  { return self.skipWaiting(); })
  );
});

/* ── activate ── */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(k) { return k !== CACHE_NAME; })
          .map(function(k)    { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

/* ── fetch ── */
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;

  const url = e.request.url;

  if (url.includes('fonts.googleapis.com')) {
    e.respondWith(networkFirst(e.request)); return;
  }
  if (url.includes('fonts.gstatic.com')) {
    e.respondWith(cacheFirst(e.request)); return;
  }

  const isShell = APP_SHELL.some(function(p) {
    return url.endsWith(p.replace('./', ''));
  });
  e.respondWith(isShell ? cacheFirst(e.request) : networkFirst(e.request));
});

/* ── helpers ── */
function cacheFirst(req) {
  return caches.match(req).then(function(hit) {
    return hit || fetchAndPut(req);
  });
}

function networkFirst(req) {
  return fetchAndPut(req).catch(function() { return caches.match(req); });
}

function fetchAndPut(req) {
  return fetch(req).then(function(res) {
    if (res.ok) {
      caches.open(CACHE_NAME).then(function(c) { c.put(req, res.clone()); });
    }
    return res;
  });
}
