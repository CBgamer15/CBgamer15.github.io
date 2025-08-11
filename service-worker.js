self.addEventListener('install', event => {
  event.waitUntil(
    caches.open('hunter-cache').then(cache => cache.addAll([
      '/',
      '/index.html',
      '/styles.css',
      '/app.js'
    ]))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});
