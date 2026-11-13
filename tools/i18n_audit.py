#!/usr/bin/env python3
"""Audit the single-language website: python3 tools/i18n_audit.py BASE_URL OUT_DIR
Checks every page x language x viewport: visible text, title, meta, alt, aria-label, placeholder;
no Thai in EN, no English words in TH (brands allowed); banned words; switcher; persistence;
auto-detect th-TH / en-US; horizontal overflow. Writes OUT_DIR/audit.json and screenshots."""
import sys, os, re, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
from i18n_lib import has_th, en_words

BASE = sys.argv[1].rstrip('/')
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
PAGES = ['/', '/locals/', '/partners/', '/rules/']
VPS = {'phone': (390, 844), 'desktop': (1440, 900)}
BANNED = [r'\brate\b', r'\brates\b', r'\bhosts?\b', r'\bguides?\b', r'\btours?\b', r'\bcreators?\b', r'\bgifts?\b',
          r'\bwallet', r'\bcredits?\b', r'\bcoins?\b', r'\blaunch', r'\blucky\b', r'\bdraw\b', r'\breviews?\b',
          r'\bstars?\b', r'hidden gem', r'alcohol', r'temples?', r'\bmeet', r'dating', r'go together',
          r'find people to go with',
          'โฮสต์', 'ไกด์', 'ทัวร์', 'ครีเอเตอร์', 'ของขวัญ', 'วอลเล็ท', 'กระเป๋าเงิน', 'เครดิต', 'เหรียญ',
          'จับฉลาก', 'ลุ้นโชค', 'นำโชค', 'รีวิว', 'แอลกอฮอล์', 'เหล้า', 'วัด', 'นัดเจอ', 'เดท', 'ไปด้วยกัน',
          'หาเพื่อนไปด้วย', 'อัญมณีที่ซ่อน']

EXTRACT = r'''() => {
 const vis = e => { const s = getComputedStyle(e); if (s.display==='none'||s.visibility==='hidden') return false;
   const r = e.getBoundingClientRect(); return r.width>0 || r.height>0 || s.position==='fixed'; };
 const out = [];
 const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
 let n; while ((n = w.nextNode())) { const t = n.nodeValue.trim(); if (!t) continue; const p = n.parentElement;
   if (!p || p.closest('script,style,noscript,[data-ugc]')) continue;
   let ok = true; for (let a = p; a; a = a.parentElement) { const s = getComputedStyle(a); if (s.display==='none'||s.visibility==='hidden') { ok=false; break; } }
   if (ok) out.push({k:'text', v:t}); }
 document.querySelectorAll('[alt],[aria-label],[placeholder],[title]').forEach(e => { if (e.closest('[data-ugc]')) return;
   ['alt','aria-label','placeholder','title'].forEach(a => { const v = e.getAttribute(a); if (v && v.trim()) out.push({k:a, v}); }); });
 out.push({k:'title', v:document.title});
 const md = document.querySelector('meta[name="description"]'); if (md) out.push({k:'meta', v:md.content});
 document.querySelectorAll('meta[property^="og:"]').forEach(m => { if (!/image|url|type|locale/.test(m.getAttribute('property'))) out.push({k:'og', v:m.content}); });
 const de = document.documentElement;
 const over = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
   return r.width>0 && [...e.childNodes].some(c=>c.nodeType===3&&c.nodeValue.trim()) && s.display!=='none' && r.right > innerWidth + 1 && s.position!=='fixed' && !e.closest('.hero,.rail,.hs,[class*="scroll"],.ppl,.evs,.plans,.op,svg') && getComputedStyle(e.parentElement).overflowX==='visible'; })
   .slice(0,5).map(e => e.tagName+'.'+e.className+' '+Math.round(e.getBoundingClientRect().right));
 return {items: out, lang: de.lang, sw: de.scrollWidth, cw: de.clientWidth, over};
}'''


def check(items, lang):
    bad = []
    for it in items:
        v = it['v']
        if lang == 'en' and has_th(v):
            bad.append(('thai-in-en', it['k'], v[:90]))
        if lang == 'th' and en_words(v):
            bad.append(('english-in-th', it['k'], v[:90]))
        for b in BANNED:
            if re.search(b, v, re.I):
                bad.append(('banned:' + b, it['k'], v[:90]))
    return bad


def main():
    R = {'base': BASE, 'checks': [], 'fail': 0}

    def rec(name, ok, detail=''):
        R['checks'].append({'check': name, 'ok': bool(ok), 'detail': detail})
        if not ok:
            R['fail'] += 1
        print(('PASS ' if ok else 'FAIL ') + name + (' :: ' + str(detail)[:400] if detail and not ok else ''))

    with sync_playwright() as p:
        br = p.chromium.launch()
        # 1-2, 5: every page x lang x viewport
        for vp, (w, h) in VPS.items():
            for lang in ('th', 'en'):
                ctx = br.new_context(viewport={'width': w, 'height': h}, locale='en-US',
                                     is_mobile=(vp == 'phone'), has_touch=(vp == 'phone'), device_scale_factor=2 if vp == 'phone' else 1)
                ctx.add_init_script(f"try{{localStorage.setItem('kr8_lang','{lang}')}}catch(e){{}}")
                pg = ctx.new_page()
                for path in PAGES:
                    pg.goto(BASE + path + '?hold=1', wait_until='networkidle')
                    pg.wait_for_timeout(600)
                    # reveal everything (scroll-in animations) then measure
                    pg.evaluate("document.querySelectorAll('.rvl').forEach(e=>e.classList.add('in'))")
                    d = pg.evaluate(EXTRACT)
                    bad = check(d['items'], lang)
                    rec(f'{vp} {lang} {path}: html lang={d["lang"]}', d['lang'] == lang)
                    rec(f'{vp} {lang} {path}: {len(d["items"])} strings, only {lang.upper()} (text/title/meta/og/alt/aria/placeholder) + no banned words', not bad, bad)
                    rec(f'{vp} {lang} {path}: no horizontal overflow (scrollWidth {d["sw"]} <= {d["cw"]})', d['sw'] <= d['cw'] + 1 and not d['over'], d['over'])
                    if vp == 'phone' and path == '/':
                        pg.evaluate("document.getElementById('op')&&document.getElementById('op').remove()")
                        pg.screenshot(path=os.path.join(OUT, f'home_{lang}_phone.png'))
                        pg.screenshot(path=os.path.join(OUT, f'home_{lang}_phone_full.png'), full_page=True)
                    if vp == 'phone':
                        pg.screenshot(path=os.path.join(OUT, f'{path.strip("/") or "home"}_{lang}_{vp}_full.png'), full_page=True)
                ctx.close()
        # 4: auto-detect
        for loc, want in (('th-TH', 'th'), ('en-US', 'en'), ('ja-JP', 'en')):
            ctx = br.new_context(locale=loc, viewport={'width': 390, 'height': 844})
            pg = ctx.new_page(); pg.goto(BASE + '/', wait_until='domcontentloaded')
            got = pg.evaluate('document.documentElement.lang')
            rec(f'auto-detect locale {loc} -> {want}', got == want, got)
            ctx.close()
        # flash check: lang is already set when the body starts parsing
        ctx = br.new_context(locale='th-TH')
        ctx.add_init_script("document.addEventListener('readystatechange',()=>{});new MutationObserver((m,o)=>{if(document.body){window.__firstLang=document.documentElement.lang;o.disconnect()}}).observe(document,{childList:true,subtree:true})")
        ctx.add_init_script("try{localStorage.setItem('kr8_lang','en')}catch(e){}")
        pg = ctx.new_page(); pg.goto(BASE + '/', wait_until='domcontentloaded')
        rec('no flash: saved EN beats Thai phone, and lang is set before <body> exists', pg.evaluate('window.__firstLang') == 'en', pg.evaluate('window.__firstLang'))
        ctx.close()
        # 3: switcher toggles in place + persists across pages
        ctx = br.new_context(locale='th-TH', viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        for path in PAGES:
            pg.goto(BASE + path + '?hold=1', wait_until='networkidle')
            n = pg.locator('.lsw [data-setlang]').count()
            rec(f'switcher present on {path} (TH | EN)', n == 2 and pg.locator('.lsw').is_visible())
        pg.goto(BASE + '/?hold=1', wait_until='networkidle')
        pg.evaluate("document.getElementById('op')&&document.getElementById('op').remove()")
        nav0 = pg.evaluate('performance.getEntriesByType("navigation").length')
        pg.evaluate("window.__noReload=1")
        pg.locator('.lsw [data-setlang="en"]').click()
        pg.wait_for_timeout(200)
        pg.evaluate("document.querySelectorAll('.rvl').forEach(e=>e.classList.add('in'))")
        d = pg.evaluate(EXTRACT)
        rec('tap EN on a Thai phone: whole page switches to English without reload', d['lang'] == 'en' and pg.evaluate('window.__noReload') == 1 and not check(d['items'], 'en'), check(d['items'], 'en'))
        rec('switcher state shows EN pressed', pg.get_attribute('.lsw [data-setlang="en"]', 'aria-pressed') == 'true')
        for path in PAGES[1:]:
            pg.goto(BASE + path, wait_until='networkidle')
            rec(f'choice persists to {path}', pg.evaluate('document.documentElement.lang') == 'en')
        pg.locator('.lsw [data-setlang="th"]').click(); pg.wait_for_timeout(200)
        d = pg.evaluate(EXTRACT)
        rec('tap TH: back to Thai in place', d['lang'] == 'th' and not check(d['items'], 'th'), check(d['items'], 'th'))
        pg.goto(BASE + '/', wait_until='networkidle')
        rec('Thai choice persists back to home', pg.evaluate('document.documentElement.lang') == 'th')
        rec('app shares the choice (localStorage kr8_lang)', pg.evaluate("localStorage.getItem('kr8_lang')") == 'th')
        # hero story caption swaps live (JS-built text)
        pg.goto(BASE + '/', wait_until='networkidle'); pg.wait_for_timeout(5500)
        pg.locator('.lsw [data-setlang="en"]').click(); pg.wait_for_timeout(300)
        d = pg.evaluate(EXTRACT)
        rec('after the ring opening (JS-built captions) still English only', not check(d['items'], 'en'), check(d['items'], 'en'))
        pg.screenshot(path=os.path.join(OUT, 'home_en_after_opening.png'))
        ctx.close()
        br.close()
    json.dump(R, open(os.path.join(OUT, 'audit.json'), 'w'), ensure_ascii=False, indent=1)
    print('FAILS', R['fail'], 'of', len(R['checks']))


main()
