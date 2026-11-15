"""Install sheet on Android Chrome with ?install=1: a synthetic beforeinstallprompt at 0 s or 5 s after the sheet opens
(or never) must flip the button to one-tap Install; a tap calls prompt(). Usage: python3 tools/install_sheet_test.py <app url> <out dir>"""
import asyncio, sys, json
from playwright.async_api import async_playwright
URL, O = sys.argv[1].rstrip('/'), sys.argv[2]
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
FIRE = """() => { const e = new Event('beforeinstallprompt'); e.prompt = async () => { window.__prompted = (window.__prompted || 0) + 1; };
  e.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' }); window.dispatchEvent(e); }"""
async def case(b, name, fire_at, ua=UA, lang='th'):
    ctx = await b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=ua, service_workers='block')
    pg = await ctx.new_page()
    await pg.goto(f'{URL}/?install=1&debug=1&lang={lang}', wait_until='domcontentloaded')
    await pg.wait_for_selector('#a2hs', timeout=20000)
    st = lambda: pg.evaluate("() => ({ state: document.getElementById('a2hs')?.dataset.state, btn: document.getElementById('a2hsAdd')?.innerText, debug: document.getElementById('a2hsDebug')?.innerText.split('\\n')[0] })")
    first = await st()
    await pg.screenshot(path=f'{O}/{name}_1_open.png')
    if fire_at is not None:
        await pg.wait_for_timeout(fire_at * 1000)
        await pg.evaluate(FIRE)
        await pg.wait_for_timeout(500)
    else:
        await pg.wait_for_timeout(9000)
    after = await st()
    await pg.screenshot(path=f'{O}/{name}_2_after.png')
    tapped = None
    if after['state'] == 'ready':
        await pg.click('#a2hsAdd'); await pg.wait_for_timeout(600)
        tapped = await pg.evaluate('window.__prompted || 0')
    await ctx.close()
    return {'case': name, 'on_open': first, 'after': after, 'prompt_called': tapped}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        res = [await case(b, 'offer_at_0s', 0), await case(b, 'offer_at_5s', 5), await case(b, 'no_offer', None),
               await case(b, 'samsung_no_offer', None, 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36')]
        await b.close()
    print(json.dumps(res, indent=1, ensure_ascii=False))
asyncio.run(main())
