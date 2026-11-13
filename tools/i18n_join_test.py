#!/usr/bin/env python3
"""Join CTA check in TH and EN: python3 tools/i18n_join_test.py BASE OUT_DIR"""
import sys, os
from playwright.sync_api import sync_playwright
BASE, OUT = sys.argv[1].rstrip('/'), sys.argv[2]
ok_all = True
with sync_playwright() as p:
    b = p.chromium.launch()
    for lang in ('th', 'en'):
        for path in ('/', '/locals/', '/rules/'):
            c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, locale='en-US')
            c.add_init_script(f"try{{localStorage.setItem('kr8_lang','{lang}')}}catch(e){{}}")
            pg = c.new_page(); pg.goto(BASE + path + '?hold=1', wait_until='networkidle')
            pg.evaluate("document.getElementById('op')&&document.getElementById('op').remove()")
            a = pg.locator('.cta a[data-join]').first
            href = a.get_attribute('href')
            a.click(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(2500)
            txt = pg.evaluate("document.body.innerText")
            sheet = any(k in txt for k in ('LINE', 'Google', 'email', 'อีเมล'))
            ok = '/app/' in pg.url and sheet
            ok_all &= ok
            print(('PASS' if ok else 'FAIL'), lang, path, 'href', href, '->', pg.url.replace(BASE, ''), 'join sheet' if sheet else 'NO SHEET')
            if path == '/':
                pg.screenshot(path=os.path.join(OUT, f'join_sheet_{lang}.png'))
            c.close()
    b.close()
print('JOIN', 'OK' if ok_all else 'FAIL')
