# Porting the approved prototype to Kring v6 (React + TS)

Source of truth: `reference/prototype/app.js` (screens are `def({id:...})` blocks) and the prototype strings (already in `src/v6/i18n/strings.json`). The goal is a **faithful** port: same markup structure and CSS class names (all CSS is already in `src/v6/styles/v6.css` — do not restyle), same words via `t()`, same animations, same behaviour, same rules.

## Contract
- Each screen is a React function component registered with `register({ id, flow: 't'|'h', title, C })` from `core/router`. Register in the same order as the prototype.
- Read state with `const s = useS()` (re-renders on any change). Change state with `update(st => { ... })` from `core/store` — never assign to `S` without `update` unless inside a click handler that then navigates (`go` calls update).
- Navigation: `data-go="id" data-how="r|l|b|f"` attributes work exactly like the prototype (delegated in the router), or call `go(id, how, force?)`. `data-toast="key"`, `data-heart="actId"`, `data-setlang`, `data-hostoff`, `data-ching` are also delegated.
- Toasts: `toast(msg)` from `core/router`.
- Sounds/haptics: `bell, tick, chime, buzz` from `core/sound`.
- Data + helpers: `core/data` (ACTS, TOURS, PACKS, VOUCH, GIFTS, SLOTS, SL, bTime, fx, baht, ph, bl, plc, hostName, aTitle, PLOY, act, me, dayFmt, ini, langsOf, caseNo, myBk, bkTitle, bkHost, tTh, trav, DIET_TH, ALIAS, rand, pick, RM, ease).
  - Prototype `x.ini()` → `ini(x)`.
- Guards: `core/guard` (maskTxt, CASH, linkInfo, nameBlocked).
- UI: `ui/kit` — `<Ic p={I.back} s={20} sw={2}/>` for icons (`SV(...)` string version also exists for HTML-string places), `<Rings/>`, `<Av ch s gold/>`, `<Tabs active host/>`, `<Head/>`, `<Sheet open onClose>`, `<GiftArt id s/>`, `<TTh th en/>`, `<Html h/>` (dangerouslySetInnerHTML helper), `I`, `RINGS(w)` string, `av()` string. `ui/giftArt` has `gsvg(id,size)` string.
- Prototype `mount(el)` logic → `useEffect` with refs (cleanup = the prototype's returned function). DOM-heavy animation (canvas, rAF, counters) may stay imperative inside effects using refs — that is fine and preferred over re-render loops.
- Prototype `sheet(el, html, onClick)` → local `useState` + `<Sheet>`.
- Inline `style="..."` → React style objects; `class` → `className`; SVG attributes camelCase (`strokeWidth`, `strokeLinecap`, `viewBox`...). Thai `tTh(th,en)` strings inside markup → `<TTh th=".." en=".."/>`; if a string already contains HTML use `<Html h={...}/>`.
- Strings in `t()` are trusted app copy; user input must never be injected as HTML (escape or render as text).
- The prototype's `notes:[...]` are designer notes — drop them.
- No new dependencies. No changes to `core/*`, `ui/*`, `styles/*` — if you need a helper, put it in your own screen file. If something in core is truly missing/broken, say so in your final report.

## Checks before you finish
1. `npx tsc --noEmit` → 0 errors.
2. `node scripts/v6-smoke.mjs <your ids> en reference/shots/<group>` and again with `th` and one more language → "no errors", and look at the screenshots (Read the PNGs) to compare against the prototype look.
3. Click through your interactive flows with a short Playwright script (like `scripts/v6-smoke.mjs`) — buttons do what the prototype does.
