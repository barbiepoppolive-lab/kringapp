const CACHE_NAME = 'kring-mobile-v6-r5'
const CORE_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './kring-icon.svg',
  './icon-192.png',
  './icon-512.png',
]

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_SHELL))
      .catch(() => {})
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .catch(() => {})
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = event.request.url || ''
  if (!url.startsWith('http://') && !url.startsWith('https://')) return
  // Never intercept or cache Supabase REST/Auth/Edge Function API requests
  if (
    url.includes('/rest/v1/') ||
    url.includes('/auth/v1/') ||
    url.includes('/functions/v1/') ||
    url.includes('.supabase.co')
  ) {
    return
  }

  // Offline-safe network-first with dynamic asset caching so /#checkin and /#venue-bill work offline
  event.respondWith(
    fetch(event.request)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
          const clone = networkRes.clone()
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clone))
            .catch(() => {})
        }
        return networkRes
      })
      .catch(() =>
        caches
          .match(event.request)
          .then((res) => res || (event.request.mode === 'navigate' ? caches.match('./index.html') || caches.match('./') : null))
          .then((res) => res || new Response('', { status: 504, statusText: 'Offline' }))
      )
  )
})
