const CACHE_NAME = 'kring-mobile-v4'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['./', './manifest.json', './kring-icon.svg', './icon-192.png'])).catch(() => {})
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
  if (url.includes('/rest/v1/') || url.includes('/auth/v1/') || url.includes('/functions/v1/') || url.includes('.supabase.co')) {
    return
  }
  event.respondWith(
    fetch(event.request).catch(() =>
      caches
        .match(event.request)
        .then((res) => res || (event.request.mode === 'navigate' ? caches.match('./') : null))
        .then((res) => res || new Response('', { status: 504, statusText: 'Offline' }))
    )
  )
})
