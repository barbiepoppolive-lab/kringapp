"""Homepage on a slow phone (4G 9 Mbit/s 70 ms + CPU 4x slower): when is the hero CTA visible and tappable (not covered by the
opening animation)? Cold (first visit) and warm (same browser, second visit). Usage: python3 tools/perf_home.py <url> <label>"""
import asyncio, sys, json
from playwright.async_api import async_playwright
UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
PROBE = """() => new Promise((ok) => { const t0 = performance.now(); let vis = null;
  const tick = () => { const a = document.querySelector('#hero a.btn'); if (a) { const r = a.getBoundingClientRect(); const s = getComputedStyle(a);
      const shown = r.width > 0 && r.bottom > 0 && r.top < innerHeight && +s.opacity > 0.9 && s.visibility !== 'hidden';
      if (shown && vis === null) vis = Math.round(performance.now());
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (shown && top && (top === a || a.contains(top))) { const n = performance.getEntriesByType('navigation')[0];
        return ok({ ttfb: Math.round(n.responseStart), fcp: Math.round((performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0),
          opening: document.documentElement.classList.contains('opon') || document.documentElement.classList.contains('opdone') && !!document.querySelector('#op.gone, #op.out'), cta_visible_ms: vis, cta_tappable_ms: Math.round(performance.now()) }); } }
    if (performance.now() - t0 > 15000) return ok({ cta_visible_ms: vis, cta_tappable_ms: -1 });
    requestAnimationFrame(tick); }; tick(); })"""
async def main():
  async with async_playwright() as p:
    import os
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=[a for a in os.environ.get('CHROME_ARGS', '').split('||') if a],
      **({'proxy': {'server': os.environ['HTTPS_PROXY'], 'bypass': os.environ['PROXY_BYPASS']}} if os.environ.get('PROXY_BYPASS') and os.environ.get('HTTPS_PROXY') else {}))
    out = []
    for _ in range(2):
      ctx = await b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2.6, is_mobile=True, has_touch=True, user_agent=UA, ignore_https_errors=True)
      for k in ('cold', 'warm'):
        pg = await ctx.new_page(); cdp = await ctx.new_cdp_session(pg)
        await cdp.send('Network.enable')
        await cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 70, 'downloadThroughput': 1125000, 'uploadThroughput': 187500})
        await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        await pg.goto(sys.argv[1], wait_until='commit')
        r = await pg.evaluate(PROBE); r['k'] = k; out.append(r)
        await pg.wait_for_timeout(1500); await pg.close()
      await ctx.close()
    for r in out: print(sys.argv[2], json.dumps(r))
    await b.close()
asyncio.run(main())
