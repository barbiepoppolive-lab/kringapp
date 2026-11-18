/* Kring entry (since 10 Nov): the v8 app, or the one-screen partner sign-up. The retired v6 app ("Host mode", old café
 * form with raw string keys) is no longer reachable or bundled: every old partner link lands on #apply. */
// K-006 (18 Nov): Sentry loads after the first screen (errors before that are kept and sent then), not in the eager bundle
import { startSentryLater } from '../lib/sentryLazy'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../design/fonts.css'
import { KringAppV8 } from '../v8/KringAppV8'

startSentryLater()

const base = import.meta.env.BASE_URL
const q = new URLSearchParams(location.search)

// Old counter screen (#venue-bill, demo PIN) → the real server-checked counter page.
if (/^#venue-bill/i.test(location.hash)) location.replace(`${base}staff.html`)

// Old partner entry points (#venue-onboard, #venue-consent, ?biz=, ?claim=, ?v6=1) → the new partner sign-up.
const isApply = /^#(apply|venue-onboard|venue-consent)/i.test(location.hash) || q.has('biz') || q.has('claim') || q.get('v6') === '1'

const rootEl = document.getElementById('root')!
if (isApply) {
  if (!/^#apply/i.test(location.hash)) history.replaceState(null, '', `${location.pathname}${location.search}#apply`)
  void import('../apply/apply').then(({ mountApply }) => mountApply(rootEl))
} else {
  // a link to #apply from inside the app opens the sign-up screen
  addEventListener('hashchange', () => { if (/^#apply/i.test(location.hash)) location.reload() })
  createRoot(rootEl).render(
    <StrictMode>
      <KringAppV8 />
    </StrictMode>,
  )
}
