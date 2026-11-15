"""Overflow audit (15 Nov): walks Kring app screens in every language, at phone widths and with bigger system text,
and flags any text that spills out of its box, is cut off without "…", or sits outside the card it belongs to.
Usage: python3 tools/overflow_audit.py <harness base url> <app base url> <out dir> [langs] [quick]
"""
import asyncio, json, sys, os
from playwright.async_api import async_playwright

HARNESS, APP, OUT = sys.argv[1].rstrip('/'), sys.argv[2].rstrip('/'), sys.argv[3]
LANGS = (sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else 'th,en,zh,hi,ja,ko').split(',')
WIDTHS = [320, 360, 390, 412]
SCALES = [1.0, 1.15, 1.3]
HVIEWS = ['me', 'me-new', 'rewards', 'claim', 'ranking', 'how', 'pick', 'compose', 'place', 'activity', 'a2hs-android', 'a2hs-ios', 'a2hs-inapp-line']
APPVIEWS = ['feed', 'people', 'deals', 'me', 'settings']
if os.environ.get('HVIEWS'): HVIEWS = os.environ['HVIEWS'].split(',')   # e.g. HVIEWS=rewards,rewards-new and app url '-' to skip the app
if APP == '-': APPVIEWS = []

SCAN = r"""
(scale) => {
  // bigger system text: every element's font size × scale (like Android "Font size")
  const all = [...document.querySelectorAll('body *')];
  if (!window.__kfs) window.__kfs = new Map(all.map(e => [e, getComputedStyle(e).fontSize]));
  for (const [e, fs] of window.__kfs) if (e.isConnected) e.style.setProperty('font-size', (parseFloat(fs) * scale) + 'px');
  void document.body.offsetWidth;
  const out = [];
  const vw = document.documentElement.clientWidth;
  const css = (e) => getComputedStyle(e);
  const hidden = (e) => { for (let p = e; p && p !== document.body; p = p.parentElement) { const s = css(p); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return true; } return false; };
  const hscroller = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const s = css(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
  const label = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const path = (e) => { const a = []; for (let p = e; p && p !== document.body && a.length < 4; p = p.parentElement) a.unshift(label(p)); return a.join(' > '); };
  const textRect = (e) => { const r = document.createRange(); let L = 1e9, R = -1e9, T = 1e9, B = -1e9, any = false;
    for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { r.selectNodeContents(n); for (const q of r.getClientRects()) { if (!q.width) continue; any = true; L = Math.min(L, q.left); R = Math.max(R, q.right); T = Math.min(T, q.top); B = Math.max(B, q.bottom); } }
    return any ? { left: L, right: R, top: T, bottom: B } : null; };
  const boxed = (s) => (s.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor)) || parseFloat(s.borderLeftWidth) > 0 || (s.boxShadow && s.boxShadow !== 'none') || (s.backgroundImage && s.backgroundImage !== 'none');
  const ellip = (e) => { for (let p = e; p && p !== document.body; p = p.parentElement) { const s = css(p); if (s.textOverflow === 'ellipsis' || (s.webkitLineClamp && s.webkitLineClamp !== 'none')) return true; if (/(hidden|clip)/.test(s.overflowX)) break; } return false; };
  for (const e of document.querySelectorAll('body *')) {
    if (e.closest('svg') || hidden(e) || hscroller(e)) continue;
    let tr = textRect(e); if (!tr) continue;
    const own = e.getBoundingClientRect();
    if (own.width <= 2 || own.height <= 2) continue;                 // screen-reader-only text
    const s0 = css(e);
    if (/(hidden|clip)/.test(s0.overflowX)) tr = { left: Math.max(tr.left, own.left), right: Math.min(tr.right, own.right), top: tr.top, bottom: tr.bottom };   // what the box itself lets show
    const txt = (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    // 1. the text box itself spills or is cut
    const s = css(e);
    if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && s.display !== 'inline') {
      if (/(hidden|clip)/.test(s.overflowX)) { if (!ellip(e)) out.push({ kind: 'cut', el: path(e), txt }); }
      else if (!/(auto|scroll)/.test(s.overflowX)) out.push({ kind: 'spill', el: path(e), txt });
    }
    // 2. the text sits outside its card / button (nearest ancestor with a visible box), or is cut by a clipping ancestor
    for (let p = e; p && p !== document.body; p = p.parentElement) {
      const ps = css(p);
      if (p !== e && (boxed(ps) || /(hidden|clip)/.test(ps.overflowX))) {
        const r = p.getBoundingClientRect();
        if (r.width < 4) break;
        const below = tr.top >= r.bottom - 2;   // a caption under an icon button, not inside it
        if (!below && (tr.right > r.right + 1.5 || tr.left < r.left - 1.5)) {
          if (!/(hidden|clip)/.test(ps.overflowX)) out.push({ kind: 'outside', el: path(e), box: label(p), txt, by: Math.round(Math.max(tr.right - r.right, r.left - tr.left)) });
          else if (!ellip(e)) out.push({ kind: 'clipped', el: path(e), box: label(p), txt, by: Math.round(Math.max(tr.right - r.right, r.left - tr.left)) });
        }
        if (boxed(ps) || /(hidden|clip)/.test(ps.overflowX)) break;
      }
      if (ps.position === 'fixed') break;
    }
    if ((tr.right > vw + 1 || tr.left < -1) && !ellip(e)) out.push({ kind: 'offscreen', el: path(e), txt });
  }
  return out;
}
"""
MARK = r"""(items) => { document.querySelectorAll('[data-ovf]').forEach(x => { x.style.outline = ''; x.removeAttribute('data-ovf'); });
  for (const e of document.querySelectorAll('body *')) { } return 0; }"""

async def main():
  os.makedirs(OUT, exist_ok=True)
  found = {}
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
    async def run(url, name, lang, prep=None):
      ctx = await b.new_context(viewport={'width': 412, 'height': 900}, device_scale_factor=1, is_mobile=True, has_touch=True, locale='th-TH' if lang == 'th' else 'en-US')
      pg = await ctx.new_page()
      try:
        await pg.goto(url, wait_until='networkidle', timeout=40000)
      except Exception:
        pass
      await pg.wait_for_timeout(1800)
      if prep:
        try: await prep(pg)
        except Exception as ex: print('prep failed', name, lang, ex)
      for w in WIDTHS:
        await pg.set_viewport_size({'width': w, 'height': 900})
        for sc in SCALES:
          await pg.evaluate('() => { window.__kfs && window.__kfs.forEach((fs, e) => e.style && e.style.removeProperty("font-size")); window.__kfs = null; }')
          await pg.wait_for_timeout(120)
          res = await pg.evaluate(SCAN, sc)
          for it in res:
            k = (name, it['kind'], it['el'], it.get('box', ''))
            f = found.setdefault(k, {'view': name, **it, 'cases': []})
            if len(f['cases']) < 6: f['cases'].append(f'{lang}@{w}x{sc}')
            f['n'] = f.get('n', 0) + 1
          if res and sc == 1.3 and w in (320, 412):
            await pg.screenshot(path=f'{OUT}/{name}_{lang}_{w}_x{sc}.png', full_page=False)
          await pg.evaluate('() => { window.__kfs && window.__kfs.forEach((fs, e) => e.style && e.style.removeProperty("font-size")); window.__kfs = null; }')
      await ctx.close()
    for v in HVIEWS:
      for lang in LANGS:
        await run(f'{HARNESS}/ovf.html?v={v}&lang={lang}', f'h-{v}', lang)
    for v in APPVIEWS:
      for lang in LANGS:
        async def prep(pg, v=v):
          tabs = {'feed': 0, 'people': 1, 'deals': 2, 'me': 3, 'settings': 3}
          btns = await pg.query_selector_all('nav button, nav a')
          if v != 'feed' and len(btns) >= 4: await btns[tabs[v]].click(); await pg.wait_for_timeout(1200)
          if v == 'settings':
            g = await pg.query_selector('.kp-gear, #meGear')
            if g: await g.click(); await pg.wait_for_timeout(1200)
        await run(f'{APP}/?demo=1&lang={lang}', f'app-{v}', lang, prep)
    await b.close()
  items = sorted(found.values(), key=lambda x: (x['view'], x['kind'], x['el']))
  json.dump(items, open(f'{OUT}/overflow_report.json', 'w'), ensure_ascii=False, indent=1)
  print('unique issues:', len(items))
  for it in items[:400]:
    print(f"{it['view']:16} {it['kind']:9} {it['el'][-70:]:70} box={it.get('box','')[:28]:28} by={it.get('by','')} n={it['n']} e.g. {it['cases'][0]} «{it['txt'][:40]}»")
asyncio.run(main())
