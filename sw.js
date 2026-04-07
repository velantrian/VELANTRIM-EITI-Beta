// VELANTRIM EITI — Service Worker v10.1

var CACHE_NAME = 'eiti-cache-v10-1';
var SW_VERSION = '10.1';
console.log('🔧 Service Worker EITI v' + SW_VERSION + ' активирован');

// ✅ COOP/COEP — нужны для SharedArrayBuffer (Transformers.js WASM)
function addCoopHeaders(response) {
    var h = new Headers(response.headers);
    h.set('Cross-Origin-Opener-Policy', 'same-origin');
    h.set('Cross-Origin-Embedder-Policy', 'credentialless');
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: h
    });
}
var ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './sql-wasm.js',    // Локально! 100% offline
    './sql-wasm.wasm'   // Локально! 100% offline
];

self.addEventListener('install', function(e) {
    e.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            // Promise.allSettled — не падаем если один файл недоступен
            return Promise.allSettled(ASSETS.map(function(url) {
                return cache.add(url).catch(function(err) {
                    console.warn('[SW] Не удалось закэшировать:', url, err);
                });
            }));
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function(e) {
    e.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(k) { return k !== CACHE_NAME; })
                    .map(function(k) { return caches.delete(k); })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function(e) {
    // API-запросы — всегда в сеть, без кэша
    if (e.request.url.indexOf('deepseek.com') !== -1 ||
        e.request.url.indexOf('anthropic.com') !== -1) {
        return e.respondWith(fetch(e.request).then(function(r) {
            return addCoopHeaders(r);
        }).catch(function() {
            return new Response(JSON.stringify({ error: 'offline' }),
                { status: 503, headers: { 'Content-Type': 'application/json' } });
        }));
    }

    e.respondWith(
        caches.match(e.request).then(function(cached) {
            if (cached) return addCoopHeaders(cached);

            // При навигации — отдаём index.html из кэша
            if (e.request.mode === 'navigate') {
                return caches.match('./index.html').then(function(html) {
                    if (html) return addCoopHeaders(html);
                    return fetch(e.request).then(addCoopHeaders);
                });
            }

            // Остальное — сеть → кэш
            return fetch(e.request).then(function(response) {
                if (!response || response.status !== 200 || e.request.method !== 'GET') return response;
                var toCache = response.clone();
                caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, toCache); });
                return addCoopHeaders(response);
            }).catch(function() {
                return new Response(
                    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
                    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
                    '<title>EITI — Офлайн</title>' +
                    '<style>body{background:#1a0f0a;color:#ffd700;font-family:sans-serif;' +
                    'display:flex;align-items:center;justify-content:center;height:100vh;' +
                    'text-align:center;margin:0;}</style></head>' +
                    '<body><div><div style="font-size:48px">📡</div>' +
                    '<h2 style="margin:12px 0 8px">Нет соединения</h2>' +
                    '<p style="opacity:0.7;font-size:14px">EITI работает офлайн.<br>' +
                    'Проверьте интернет и обновите страницу.</p></div></body></html>',
                    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                );
            });
        })
    );
});

self.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'SHOW_NOTIFICATION') {
        self.registration.showNotification(e.data.title || '🔔 VELANTRIM EITI', {
            body: e.data.body || '',
            icon: './icon-192.png',
            vibrate: [200, 100, 200],
            tag: 'eiti-reminder',
            renotify: true
        });
    }
});

self.addEventListener('notificationclick', function(e) {
    e.notification.close();
    e.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (var i = 0; i < clientList.length; i++) {
                var c = clientList[i];
                if ('focus' in c) return c.focus();
            }
            if (self.clients.openWindow) return self.clients.openWindow('./index.html');
        })
    );
});
