// Kring service worker (16 Nov perf 2): the app shell is kept on the phone, so a repeat open does not wait for the network.
//
// - The page itself (index.html): network first, so a new build reaches phones at once. If the network is slow (4 s) or
//   offline, the kept copy opens instead.
// - App code, styles and fonts (/app/assets/*, /app/fonts/*): their names change whenever their content changes, so the
//   kept copy is always right: served from the phone at once (cache first), fetched and kept the first time.
//   On install the worker reads index.html and keeps every script, style and font it names (the app shell).
// - Reel posters (/media/kr8-reels/*.jpg|webp): kept by file path (a new upload always gets a new name). The signed-link
//   token in the address changes every hour; the picture does not, so the kept copy is used whatever the token.
// - Reel videos, the feed (/feed0) and every Supabase call: never touched here (always live).
// - Dings (16 Nov push): 'push' shows the notification the server sent (title, body, in-app link); tapping it focuses an open
//   Kring window and moves it to the link, or opens /app/ at the link. Links are only ever inside /app/.
const SHELL = 'kring-shell-v10'
const ASSETS = 'kring-assets-v1'
const POSTERS = 'kring-posters-v1'
const KEEP = [SHELL, ASSETS, POSTERS]
const CORE_SHELL = ['./', './manifest.json', './kring-icon.svg', './icon-192.png', './icon-512.png']
const NAV_TIMEOUT_MS = 4000

async function precacheShell() {
  const shell = await caches.open(SHELL)
  await shell.addAll(CORE_SHELL).catch(() => {})
  const page = await shell.match('./')
  if (!page) return
  const html = await page.text()
  const urls = [...html.matchAll(/(?:src|href)="(\/app\/(?:assets|fonts)\/[^"]+)"/g)].map((m) => m[1])
  const assets = await caches.open(ASSETS)
  await Promise.all([...new Set(urls)].map((u) => assets.match(u).then((hit) => hit || assets.add(u)).catch(() => {})))
}

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(precacheShell().catch(() => {}))
})

async function trim(name, max) {
  const c = await caches.open(name)
  const keys = await c.keys()
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i])
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => Promise.all([trim(ASSETS, 160), trim(POSTERS, 80)]))
      .then(() => self.clients.claim())
      .catch(() => {})
  )
})

async function cacheFirst(request, name, key) {
  const c = await caches.open(name)
  const hit = await c.match(key || request)
  if (hit) return hit
  const res = await fetch(request)
  if (res && res.status === 200 && (res.type === 'basic' || res.type === 'default')) c.put(key || request, res.clone()).catch(() => {})
  return res
}

async function networkFirstPage(event) {
  const shell = await caches.open(SHELL)
  const net = fetch(event.request).then((res) => {
    if (res && res.status === 200 && res.type === 'basic') shell.put('./', res.clone()).catch(() => {})
    return res
  })
  const slow = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS)).then(() => shell.match('./'))
  try {
    const first = await Promise.race([net, slow])
    if (first) return first
    return await net
  } catch {
    return (await shell.match('./')) || new Response('', { status: 504, statusText: 'Offline' })
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  if (url.origin !== self.location.origin) return // Supabase, weather, LINE, Sentry: always live, never kept
  const p = url.pathname

  if (req.mode === 'navigate') {
    if (/^\/app\/(index\.html)?$/.test(p) || p === '/app') event.respondWith(networkFirstPage(event))
    return
  }
  if (/^\/app\/(assets|fonts)\//.test(p)) {
    event.respondWith(cacheFirst(req, ASSETS).catch(() => fetch(req)))
    return
  }
  if (/^\/media\/kr8-reels\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpe?g|webp)$/.test(p) && !req.headers.get('range')) {
    event.respondWith(cacheFirst(req, POSTERS, new Request(url.origin + p)).catch(() => fetch(req)))
    return
  }
  // everything else (videos, /feed0, version.json, images): straight to the network, as if there were no worker
})

// ───────── dings (Web Push, migration 0059 + /api/push) ─────────
const ICON = '/app/icon-192.png'
const BADGE = '/app/badge-96.png'
/** Only links inside the app; anything else opens the app home. */
function appUrl(u) {
  const s = String(u || '')
  return /^\/app\/[A-Za-z0-9_./?=&%#~+-]*$/.test(s) && s.length <= 300 ? s : '/app/'
}
function readPush(event) {
  try {
    const d = event.data ? event.data.json() : null
    if (d && typeof d === 'object') return d
  } catch {
    try { return { b: event.data.text() } } catch { /* empty */ }
  }
  return {}
}
self.addEventListener('push', (event) => {
  const d = readPush(event)
  const title = String(d.t || 'กริ๊ง! · Kring').slice(0, 80)
  const opts = {
    body: String(d.b || '').slice(0, 240),
    icon: ICON,
    badge: BADGE,
    tag: d.tag ? String(d.tag).slice(0, 64) : undefined,
    renotify: !!d.tag,
    data: { url: appUrl(d.u), kind: d.k || 'admin', id: d.id || null },
    lang: 'th',
  }
  event.waitUntil(self.registration.showNotification(title, opts))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = appUrl(event.notification.data && event.notification.data.url)
  const target = new URL(path, self.location.origin).href
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const app = wins.find((c) => { try { return new URL(c.url).pathname.startsWith('/app') } catch { return false } })
    if (app) {
      // the open app moves itself to the link (no reload); focus first, the browser only allows that inside this click
      try { await app.focus() } catch { /* ignore */ }
      app.postMessage({ type: 'kr8-push-open', url: path })
      return
    }
    await self.clients.openWindow(target)
  })())
})
