"""Start-up on a slow phone: 4G (9 Mbit/s, 70 ms) + CPU 4x slower, cold cache and repeat visit.
Prints the critical path: HTML first byte, JS/CSS done, DOMContentLoaded, launch animation, Supabase calls, first poster on
screen, first video frame. Usage: python3 tools/perf_start.py <app url> <label> [runs]"""
import asyncio, sys, json, time
from playwright.async_api import async_playwright
URL, LABEL = sys.argv[1], sys.argv[2]
RUNS = int(sys.argv[3]) if len(sys.argv) > 3 else 2
UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
PROBE = r"""() => { window.__kp = { poster: null, frame: null, launchGone: null, boot: null };
  const t = () => Math.round(performance.now());
  const tick = () => {
    const k = window.__kp;
    if (k.launchGone === null && !document.querySelector('.kr-launch, #krLaunch, [data-launch], .kl-wrap')) k.launchGone = t();
    const slide = [...document.querySelectorAll('#feedScroll .slide')].find((s) => { const r = s.getBoundingClientRect(); return r.top > -20 && r.top < innerHeight / 2; });
    if (slide && k.poster === null) {
      const v = slide.querySelector('video'); const bg = slide.querySelector('.bg');
      const url = v && v.poster ? v.poster : bg ? (getComputedStyle(bg).backgroundImage.match(/url\("?(.*?)"?\)/) || [])[1] : null;
      if (url) { const e = performance.getEntriesByName(new URL(url, location.href).href)[0]; if (e && e.responseEnd) k.poster = Math.round(e.responseEnd); }
    }
    if (k.boot === null && window.__kr8Poster0At) k.boot = window.__kr8Poster0At;
    if (slide && k.frame === null) { const v = slide.querySelector('video'); if (v && v.currentTime > 0 && v.readyState >= 2) k.frame = t(); }
    if (k.frame === null || k.poster === null) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick); }"""
async def once(b, warm_ctx=None):
    ctx = warm_ctx or await b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2.6, is_mobile=True, has_touch=True, user_agent=UA, locale='th-TH', ignore_https_errors=True)
    pg = await ctx.new_page(); cdp = await ctx.new_cdp_session(pg)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 70, 'downloadThroughput': 1125000, 'uploadThroughput': 187500})
    await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    await pg.add_init_script("document.addEventListener('DOMContentLoaded', () => { (" + PROBE + ")(); });")
    await pg.goto(URL, wait_until='commit')
    for _ in range(60):
        await pg.wait_for_timeout(500)
        k = await pg.evaluate('window.__kp || {}')
        if k.get('frame') is not None and k.get('poster') is not None: break
    r = await pg.evaluate("""() => { const n = performance.getEntriesByType('navigation')[0]; const res = performance.getEntriesByType('resource');
      const pick = (re) => res.filter(e => re.test(e.name)).map(e => [Math.round(e.startTime), Math.round(e.responseEnd), e.name.split('?')[0].split('/').slice(-1)[0].slice(0, 32)]);
      return { ttfb: Math.round(n.responseStart), html_done: Math.round(n.responseEnd), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd),
        js: pick(/\\/assets\/.*\.js$/).slice(0, 8), css: pick(/\.css$/).slice(0, 3), fonts: pick(/woff2/).slice(0, 6),
        supabase: pick(/supabase\.co\/(rest|auth|storage)|\/feed0|\/media\/.*\.(jpg|webp)/), first_paint: Math.round((performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0), kp: window.__kp, sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller) } }""")
    await pg.close()   # the next visit must not share the network with this page's video
    return ctx, r
async def main():
    async with async_playwright() as p:
        import os
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'] + [a for a in os.environ.get('CHROME_ARGS', '').split('||') if a],
            **({'proxy': {'server': os.environ['HTTPS_PROXY'], 'bypass': os.environ['PROXY_BYPASS']}} if os.environ.get('PROXY_BYPASS') and os.environ.get('HTTPS_PROXY') else {}))
        out = []
        for i in range(RUNS):
            ctx, cold = await once(b)
            await asyncio.sleep(1)
            _, warm = await once(b, ctx)
            await ctx.close()
            out.append({'cold': cold, 'warm': warm})
        await b.close()
    for o in out:
        for k in ('cold', 'warm'):
            r = o[k]
            print(f"{LABEL} {k}: ttfb {r['ttfb']} · html {r['html_done']} · FCP {r['first_paint']} · DCL {r['dcl']} · launch gone {r['kp'].get('launchGone')} · boot poster {r['kp'].get('boot')} · feed poster {r['kp'].get('poster')} · first frame {r['kp'].get('frame')} · sw {r.get('sw')}")
            print('   js:', r['js'][:5]); print('   supabase:', r['supabase'][:6]); print('   fonts:', [f[1] for f in r['fonts']])
asyncio.run(main())
