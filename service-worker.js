/* ═══════════════════════════════════════════════════════════
   週間スケジュール表 — Service Worker  v2.0
   ─ キャッシュ優先（Cache First）戦略
   ─ オフライン完全対応
   ─ バックグラウンド同期なし（localStorage のみ使用）
═══════════════════════════════════════════════════════════ */
'use strict';

const CACHE_VERSION = 'schedule-v2';
const CACHE_STATIC  = CACHE_VERSION + '-static';

/* キャッシュするファイル（バージョンが変わると全再取得） */
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-192-maskable.png',
  './icon-512.png',
  './icon-512-maskable.png',
];

/* Google Fonts はネットワーク優先でキャッシュに追加 */
const FONT_ORIGIN = 'https://fonts.googleapis.com';
const FONT_STATIC = 'https://fonts.gstatic.com';

/* ── install：静的アセットを事前キャッシュ ── */
self.addEventListener('install', function(event) {
  console.log('[SW] Installing', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(function(cache) {
        /* 個別に add して、1つ失敗しても他を止めない */
        return Promise.allSettled(
          STATIC_ASSETS.map(function(url) {
            return cache.add(url).catch(function(err) {
              console.warn('[SW] cache.add failed:', url, err);
            });
          })
        );
      })
      .then(function() {
        /* 待機せず即アクティベート */
        return self.skipWaiting();
      })
  );
});

/* ── activate：古いキャッシュを削除 ── */
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys
            .filter(function(k) { return k !== CACHE_STATIC; })
            .map(function(k) {
              console.log('[SW] Deleting old cache:', k);
              return caches.delete(k);
            })
        );
      })
      .then(function() {
        /* 既存クライアントを即座に制御下に */
        return self.clients.claim();
      })
  );
});

/* ── fetch：リクエスト戦略の振り分け ── */
self.addEventListener('fetch', function(event) {
  const req = event.request;
  const url = new URL(req.url);

  /* POST / 非GETは素通し */
  if (req.method !== 'GET') return;

  /* Google Fonts CSS → ネットワーク優先、失敗時はキャッシュ */
  if (url.origin === FONT_ORIGIN) {
    event.respondWith(networkFirstWithCache(req));
    return;
  }

  /* Fonts static（woff2 等）→ キャッシュ優先 */
  if (url.origin === FONT_STATIC) {
    event.respondWith(cacheFirstWithNetwork(req));
    return;
  }

  /* 同一オリジンの静的ファイル → キャッシュ優先 */
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstWithNetwork(req));
    return;
  }

  /* それ以外（外部API等）→ ネットワークのみ */
});

/* キャッシュ優先：キャッシュになければネットワーク取得してキャッシュに追加 */
function cacheFirstWithNetwork(req) {
  return caches.match(req).then(function(cached) {
    if (cached) return cached;
    return fetchAndCache(req);
  }).catch(function() {
    /* 完全オフライン時：index.html を返す */
    return caches.match('./index.html');
  });
}

/* ネットワーク優先：失敗時はキャッシュにフォールバック */
function networkFirstWithCache(req) {
  return fetchAndCache(req).catch(function() {
    return caches.match(req).then(function(cached) {
      return cached || caches.match('./index.html');
    });
  });
}

/* ネットワークから取得してキャッシュに保存 */
function fetchAndCache(req) {
  return fetch(req).then(function(response) {
    if (!response || response.status !== 200 || response.type === 'error') {
      return response;
    }
    var clone = response.clone();
    caches.open(CACHE_STATIC).then(function(cache) {
      cache.put(req, clone);
    });
    return response;
  });
}

/* ── メッセージ：キャッシュ強制更新（デバッグ用）── */
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    }).then(function() {
      console.log('[SW] All caches cleared');
    });
  }
});
