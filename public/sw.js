// Service worker tạm tắt — hiện tại không cache app shell.
// File vẫn tồn tại để tránh 404 với client cũ đang request /sw.js;
// register-sw.js sẽ unregister bản đã cài trước đó.

// // Minimal service worker – cache app shell for offline support
// const CACHE = 'music-room-v1';
//
// const PRECACHE = ['/', '/manifest.json'];
//
// self.addEventListener('install', (e) => {
//   e.waitUntil(
//     caches.open(CACHE).then((c) => c.addAll(PRECACHE)),
//   );
//   self.skipWaiting();
// });
//
// self.addEventListener('activate', (e) => {
//   e.waitUntil(
//     caches.keys().then((keys) =>
//       Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
//     ),
//   );
//   self.clients.claim();
// });
//
// self.addEventListener('fetch', (e) => {
//   // Only cache GET requests over http/https; skip API, socket, and extension URLs
//   if (e.request.method !== 'GET') return;
//   if (!e.request.url.startsWith('http')) return;
//   if (e.request.url.includes('/api/') || e.request.url.includes('socket.io')) return;
//
//   e.respondWith(
//     fetch(e.request)
//       .then((res) => {
//         const clone = res.clone();
//         caches.open(CACHE).then((c) => c.put(e.request, clone));
//         return res;
//       })
//       .catch(() => caches.match(e.request)),
//   );
// });
