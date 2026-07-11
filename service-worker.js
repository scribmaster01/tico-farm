/* =============================================================================
 * Tico Farm Manager 360 — Service Worker
 * -----------------------------------------------------------------------------
 * Stratégie :
 *   - Cache-first pour le shell applicatif (HTML / CSS / JS / icônes).
 *   - Network-first avec fallback cache pour Firebase (jamais mis en cache).
 *   - Versionnage par constante CACHE_NAME → bump incrémental en cas d'update.
 * ============================================================================= */

const CACHE_NAME = 'tico-farm-manager-v1.0.0';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/styles.css',
  './assets/js/firebase-config.js',
  './assets/js/app.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

/* ---------- INSTALL : pré-cache du shell ---------- */
self.addEventListener('install', (event) => {
  console.log('[SW] Install — mise en cache du shell');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

/* ---------- ACTIVATE : purge des anciens caches ---------- */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate — nettoyage des anciens caches');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ---------- FETCH : stratégies par type de requête ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Requêtes non-GET → on laisse passer directement.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Ne JAMAIS mettre en cache les requêtes Firebase (données temps réel).
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    return; // Bypass cache → réseau direct.
  }

  // Navigation HTML → network-first, fallback cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Autres assets (CSS, JS, images) → cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // On ne cache que les réponses 200 OK.
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

/* ---------- MESSAGE : permet à la page de forcer une mise à jour ---------- */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
