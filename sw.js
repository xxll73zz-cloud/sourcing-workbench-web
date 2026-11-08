// ============================================================
// X工作台 Service Worker v2 - 自动更新 + 智能缓存
// ============================================================

var SW_VERSION = 'x-workbench-v2-' + '20260826f';
var CACHE_CORE = SW_VERSION + '-core';
var CACHE_RUNTIME = SW_VERSION + '-runtime';

// 核心资源（安装时缓存）
var CORE_ASSETS = [
  '/',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico'
];

// ===== Install: 缓存核心资源，立即激活 =====
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_CORE).then(function(cache) {
      return cache.addAll(CORE_ASSETS).catch(function() {});
    })
  );
  self.skipWaiting();
});

// ===== Activate: 清理所有旧版本缓存 =====
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) {
          return n.indexOf(SW_VERSION) === -1;
        }).map(function(n) {
          return caches.delete(n);
        })
      );
    }).then(function() {
      // 通知所有客户端：新版本已激活
      return self.clients.matchAll({ includeUncontrolled: true });
    }).then(function(clients) {
      clients.forEach(function(client) {
        client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION });
      });
    })
  );
  self.clients.claim();
});

// ===== Fetch: 智能缓存策略 =====
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // API 请求：永远走网络，不缓存
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(function() {
        return new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // GET 请求才缓存
  if (e.request.method !== 'GET') return;

  // HTML 页面：网络优先（保证自动更新）
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).then(function(response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_RUNTIME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(function() {
        return caches.match(e.request).then(function(cached) {
          return cached || caches.match('/');
        });
      })
    );
    return;
  }

  // 静态资源（图标、CSS、JS）：stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var fetchPromise = fetch(e.request).then(function(response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_RUNTIME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(function() {
        return cached;
      });
      // 返回缓存（如果有），同时后台更新
      return cached || fetchPromise;
    })
  );
});

// ===== Message: 处理来自客户端的消息 =====
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data && e.data.type === 'GET_VERSION') {
    e.ports[0].postMessage({ version: SW_VERSION });
  }
});
