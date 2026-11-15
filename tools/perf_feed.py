"""Feed load measurement on a simulated 4G phone (Pixel 7 size, 9 Mbps down, 70 ms):
time to first video frame on the first Reel, MB downloaded in the first 10 s, and repeated downloads of the same video.
Usage: python3 tools/perf_feed.py <url> <label> [runs]"""
import asyncio, sys, json, collections
from playwright.async_api import async_playwright
URL, LABEL = sys.argv[1], sys.argv[2]
RUNS = int(sys.argv[3]) if len(sys.argv) > 3 else 2
async def run(p):
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
    ctx = await b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2.6, is_mobile=True, has_touch=True,
        service_workers='block', user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', locale='th-TH')
    pg = await ctx.new_page()
    cdp = await ctx.new_cdp_session(pg)
    await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
    await cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 70, 'downloadThroughput': 9_000_000 / 8, 'uploadThroughput': 1_500_000 / 8})
    t0 = None; total = 0; per = collections.Counter(); reqs = collections.Counter(); kinds = collections.Counter(); first10 = 0
    import time
    def on_recv(e):
        nonlocal total, first10
        n = e.get('encodedDataLength', 0)
        total += n
        if t0 and time.time() - t0 <= 10: first10 += n
    urls = {}; hosts = collections.Counter()
    def on_req(e):
        u = e['request']['url']; urls[e['requestId']] = u
        base = u.split('?')[0]
        if base.endswith(('.mp4', '.webm', '.mov')): reqs[base] += 1; hosts[u.split('/')[2] + ('/media' if '/media/' in u else '')] += 1
    def on_resp(e):
        u = e['response']['url'].split('?')[0]; t = e['type']; kinds[t] += 1
    wire = {'n': 0}
    def on_fin(e):
        if t0 and time.time() - t0 <= 10: wire['n'] += e.get('encodedDataLength', 0)
    cdp.on('Network.loadingFinished', on_fin)
    cdp.on('Network.dataReceived', on_recv); cdp.on('Network.requestWillBeSent', on_req); cdp.on('Network.responseReceived', on_resp)
    t0 = time.time()
    await pg.goto(URL, wait_until='commit')
    # time to the first video frame of the first Reel on screen
    ttf = await pg.evaluate("""() => new Promise((ok) => {
        const t = performance.now(); const start = performance.timeOrigin;
        const check = () => { const v = [...document.querySelectorAll('#feedScroll video')].find((x) => { const r = x.getBoundingClientRect(); return r.top >= -5 && r.top < innerHeight / 2; });
          if (v && v.currentTime > 0 && v.readyState >= 2) return ok(Math.round(performance.now())); requestAnimationFrame(check); };
        check(); setTimeout(() => ok(-1), 25000); })""")
    await pg.wait_for_timeout(max(0, int(10000 - (time.time() - t0) * 1000)))
    poster_ms = await pg.evaluate("() => { const e = performance.getEntriesByType('resource').find(x => /\\.jpg|poster|\\.webp/.test(x.name) && /kr8-reels|media/.test(x.name)); return e ? Math.round(e.responseEnd) : null }")
    dup = {k[-50:]: v for k, v in reqs.items() if v > 1}
    await b.close()
    return {'first_video_frame_ms_since_navigation': ttf, 'MB_first_10s_received': round(first10 / 1e6, 2), 'MB_first_10s_finished_requests': round(wire['n'] / 1e6, 2), 'video_requests': sum(reqs.values()), 'videos': len(reqs), 'repeat_video_requests': dup, 'video_hosts': dict(hosts)}
async def main():
    async with async_playwright() as p:
        res = [await run(p) for _ in range(RUNS)]
    print(LABEL, json.dumps(res, indent=1))
asyncio.run(main())
