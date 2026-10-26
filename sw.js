/**
 * Anurag Sahu Portfolio Service Worker
 * Version: 2.0.21
 * Architecture:
 * - HTML Documents: Strict NETWORK-FIRST (always fetch fresh HTML from network)
 * - Version Manifest: Strict NETWORK-ONLY (never cache /version.json)
 * - Static Assets: STALE-WHILE-REVALIDATE with versioned cache storage
 * - Cache Invalidation: Instant skipWaiting() + clients.claim() + old cache purge on activate
 */

const CACHE_NAME = 'anuragsahu-cache-v2.0.21';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/styles.css?v=2.0.21',
  '/app.js?v=2.0.21',
  '/manifest.json?v=2.0.21'
];

// 1. INSTALL: Immediately take over without waiting for tabs to close
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW 2.0.2] Precache warning:', err);
      });
    })
  );
});

// 2. ACTIVATE: Purge all obsolete caches and claim all active clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW 2.0.2] Deleting obsolete cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      console.log('[SW 2.0.2] Claiming all open clients.');
      return self.clients.claim();
    })
  );
});

// 3. FETCH: Strategy router
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle GET requests and http/https schemes
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // A. NEVER CACHE version.json or API requests (strict network only)
  if (url.pathname === '/version.json' || url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  // B. HTML DOCUMENTS & NAVIGATION: STRICT NETWORK-FIRST
  // Guarantees mobile devices always download the freshest HTML from the server.
  // Falls back to cache only when user is completely offline.
  const isHtmlRequest =
    request.mode === 'navigate' ||
    request.headers.get('accept')?.includes('text/html') ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/';

  if (isHtmlRequest) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback
          return caches.match(request).then((cached) => {
            return cached || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // C. STATIC ASSETS (CSS, JS, WebP, PNG, Fonts): STALE-WHILE-REVALIDATE
  // Serves instant response from cache while fetching latest version in background.
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
