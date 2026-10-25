# kringapp.com — final site ("Hold to กริ๊ง!" edition)

Built on 25 Oct 2026 by combining the four approved variants:

| Section | Comes from | What it does |
|---|---|---|
| 01 Hold to กริ๊ง! | B (bump) | Hold the button, hold Space/Enter, or drag the rings together. Contact flash (violet only in the overlap), gold sparks and marigold petals, the กริ๊ง! slam, then 3 lines: find · money held · touch phones. |
| 02 Host or visit | C (locals) | "ฉันเป็นคนไทย · I'm Thai / I'm visiting · 我是游客" switch with a circular reveal between a code-drawn dawn (host) and night (traveller). Host: Thai-first headline, live "create your activity" card, ID check · Public places · PromptPay, Founding host medal (first 100 per area). Traveller: depth carousel (price per activity, 1–2 people, struck street price) and "Money held until you meet". |
| 03 Trip card | D (postcards) | Pick 3 postcards → a 1080×1440 (3:4) card with the rings and kringapp.com. Download, or Share (Web Share with the image file → Web Share link → download fallback). |
| 04 Early access | B (waitlist) | One field (email or LINE ID) + "I'm visiting / I'm a Thai local". Thank-you: founding-host welcome for locals, warm thanks for travellers, "Share to move up" (Share / Copy link). No queue numbers are shown. |
| Film grammar | A (cinema) | Chapter chips 01–04, kinetic headline reveal, grain, vignette, light leaks, one fixed canvas that cross-dissolves four code-drawn scenes (aurora → dawn/night → lantern sky → deep night), chapter rail on desktop (≥1100 px). |

## Launch switches (top of `assets/site-final.js`)

```js
const LAUNCHED = false;          // true on launch day
const WAITLIST_ENDPOINT = '';    // URL that receives sign-ups as JSON
```

- `LAUNCHED = false` (now): CTAs read "Get early access" / "Be one of the first hosts" and scroll to the waitlist with the right role. Nothing links to `./app/`.
- `LAUNCHED = true`: every CTA (`[data-cta]`) becomes "Open the app" → `./app/`; the waitlist form is replaced by an "Open the app" button.
- `WAITLIST_ENDPOINT = ''`: the form validates, shows the thank-you state and sends/stores **nothing**. A small line under the form says "Preview: nothing is sent yet." so nobody thinks they are signed up.
- `WAITLIST_ENDPOINT` set: the form POSTs `{type:"host"|"traveller", contact, contact_type:"email"|"line", site_lang, sent_at}` as JSON. A non-2xx answer shows "Couldn't send. Please try again." The preview line is replaced by a one-line consent note with a Privacy link.

## Photos (truth rule)
All photo ↔ caption pairs live in ONE map, `PHOTOS`, at the top of `assets/site-final.js`. Captions say only what the photo really shows:
- `talat-noi-oldtown.jpg` shows the Marble Temple → captioned "Marble Temple walk".
- Not used: `wat-arun-temple.jpg` (a different temple), `flower-market.jpg` (poppies), `canal-longtail.jpg` and `chao-phraya-sunset.jpg` (Andaman coast).
- The flower market / garland card uses a code-drawn garland illustration (`makeMalai()`) until a true photo exists. To swap it, give `PHOTOS.malai` a `src` and remove `art`.
- Photos are only shown inside cards, never stretched (560 px source, ≤ ~1.1×).

## Files

```
index.html                         the page (English in the HTML for no-JS + SEO)
assets/site-final.css              tokens, layout, motion (transform/opacity), reduced motion
assets/site-final.js               config, PHOTOS, 7-language words, scene engine, bump, switch, trip card, waitlist
assets/final/fonts/*.woff2         Unbounded, Plus Jakarta Sans, Noto Sans Thai (self-hosted)
assets/final/photos/*.jpg          7 activity photos (560×315)
assets/final/app/<lang>-detail.webp   app screen in the phone frame (desktop waitlist), 7 languages
index-v6a.html.bak                 the previous page (not linked; do not deploy)
```
The old `assets/site-v6.*`, `assets/v6/` and `assets/site.*` are no longer used by `index.html`; they can stay or be removed.

Leave untouched: `privacy.html`, `safety.html`, `delete-account.html` and their folders, `app/`, `.well-known/`, `manifest.json`, `icon-*.png`, `robots.txt`, `sitemap.xml`, `.nojekyll`.

## Languages
en, th, zh (简体, host = 本地达人), ko, hi, ru, ms. Order: `?lang=` → saved choice (`localStorage` "kring-lang", try/catch) → `navigator.languages` → en. `<html lang>` is set (zh → `zh-Hans`). The switcher is a compact globe menu (arrows, Home/End, Esc). A Thai visitor lands on the host side; everyone else on the traveller side (`?side=host|trav` overrides).

## Performance and accessibility
- One requestAnimationFrame loop drives the background scenes, the rings and the sparks. It stops when the tab is hidden; the spark canvas only draws while the hero is on screen.
- Canvas resolution is capped at DPR 2 (1.5 on mobile/touch). The aurora is drawn at 1/7 size and scaled up.
- Hold progress follows the real clock, so slow devices still complete the bump in ~1.2 s.
- Reduced motion: no loop; the rings are shown already met, the reveal is visible, headlines are static, the background is redrawn statically on scroll.
- Keyboard: hold button (Space/Enter), Space anywhere in the hero, switch (arrow keys), carousel (arrow keys), postcards (buttons), language menu, form. Gold focus rings, skip link, alt text on photos, `aria-live` on the reveal and thanks.
- No external scripts, fonts or CDNs. All paths are relative.

## Checks done (Playwright, 25 Oct 2026)
- 390×844 (isMobile, hasTouch) and 1440×900 in en, th, zh, ko, hi, ru (+ ms mobile): no console errors, no failed requests.
- No horizontal overflow at 320, 360, 390, 768, 1024, 1280, 1440, 1920.
- Hold-to-bump works with the mouse, Space/Enter and a touch drag on the rings.
- Host/traveller switch works by click and arrow keys; the trip card renders (1080×1440) and Download enables after 3 picks; the waitlist reaches the thank-you state; LAUNCHED and WAITLIST_ENDPOINT were forced in tests and behave as described.
- Forbidden-word scan (rendered text, alt/aria/placeholder, all states, 7 languages): no wallet/coin/withdraw/commission/%/per hour/dating/companion/coffee (and equivalents).

## TODO (founder)
1. Set `WAITLIST_ENDPOINT` (store entries under PDPA, honour delete requests). Until then the page honestly says nothing is sent.
2. Launch day: `LAUNCHED = true` and the v6 build in `app/`.
3. Replace "LINE · coming soon" in the footer with the LINE OA link.
4. Swap in true photos (flower market with garlands, a real Wat Arun, a Chao Phraya longtail) via `PHOTOS`.
