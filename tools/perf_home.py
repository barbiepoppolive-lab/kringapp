"""Homepage on simulated 4G: when is the hero CTA visible and tappable (not covered by the opening animation)?"""
import asyncio, sys, json
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
    out = []
    for _ in range(2):
      ctx = await b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2.6, is_mobile=True, has_touch=True, service_workers='block')
      pg = await ctx.new_page(); cdp = await ctx.new_cdp_session(pg)
      await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
      await cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 70, 'downloadThroughput': 1125000, 'uploadThroughput': 187500})
      await pg.goto(sys.argv[1], wait_until='commit')
      r = await pg.evaluate("""() => new Promise((ok) => { const t0 = performance.now(); let vis = null;
        const tick = () => { const a = document.querySelector('#hero a.btn'); if (a) { const r = a.getBoundingClientRect(); const s = getComputedStyle(a);
            const shown = r.width > 0 && r.bottom > 0 && r.top < innerHeight && +s.opacity > 0.9 && s.visibility !== 'hidden';
            if (shown && vis === null) vis = Math.round(performance.now());
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (shown && top && (top === a || a.contains(top))) return ok({ cta_visible_ms: vis, cta_tappable_ms: Math.round(performance.now()) }); }
          if (performance.now() - t0 > 15000) return ok({ cta_visible_ms: vis, cta_tappable_ms: -1, covered_by: (() => { const a = document.querySelector('#hero a.btn'); if (!a) return 'no cta'; const r = a.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2); return e ? e.tagName + '#' + e.id + '.' + e.className : null })() });
          requestAnimationFrame(tick); }; tick(); })""")
      out.append(r); await ctx.close()
    print(sys.argv[2], json.dumps(out)); await b.close()
asyncio.run(main())
