#!/usr/bin/env python3
"""Build the neon home pages from tools/home_src.html.
   /index.html = Thai, /en/index.html = English. In the source, [[Thai||English]] marks a line in both languages.
   Run: python3 tools/build_home.py"""
import re, os, html, json
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(R, 'tools/home_src.html'), encoding='utf-8').read()
PIN = '<svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>'
REELS = [('rama8', 'สะพานพระราม 8', 'Rama VIII Bridge'), ('talatnoi', 'ตลาดน้อย', 'Talat Noi'), ('skypark', 'สวนลอยฟ้าเจ้าพระยา', 'Chao Phraya Sky Park'),
         ('yaowarat', 'เยาวราช', 'Yaowarat'), ('skywalk', 'มหานคร สกายวอล์ค', 'Mahanakhon SkyWalk'), ('bangpu', 'บางปู', 'Bang Pu'), ('sohengtai', 'โซวเฮงไถ่ ตลาดน้อย', 'So Heng Tai, Talat Noi')]
BOARD = [('mint', 'มิ้นท์', 'Mint', 412, '฿1,500'), ('ton', 'ต้น', 'Ton', 367, '฿900'), ('ploy', 'พลอย', 'Ploy', 301, '฿600'), ('nat', 'ณัฐ', 'Nat', 255, '฿500'),
         ('aom', 'ออม', 'Aom', 214, '฿400'), ('yui', 'ยุ้ย', 'Yui', 180, '฿250'), ('minjun', 'มินจุน', 'Minjun', 139, '฿150'), ('lena', 'ลีน่า', 'Lena', 96, '฿100'),
         ('marcus', 'มาร์คัส', 'Marcus', 71, None), ('arjun', 'อรชุน', 'Arjun', 58, None)]
def reels():
    one = ''.join('<li%s><img alt="" decoding="async" height="640" loading="lazy" src="/assets/neon/r-%s.webp" width="360"/><span>%s[[%s||%s]]</span></li>' % ('%s', k, PIN, th, en) for k, th, en in REELS)
    return one.replace('<li%s>', '<li>') + one.replace('<li%s>', '<li aria-hidden="true">')
def board():
    o = ''
    for k, th, en, n, p in BOARD:
        prize = '<span class="p">%s</span>' % p if p else '<span class="p z">[[ติดบอร์ด||On the board]]</span>'
        o += '<li><img alt="" decoding="async" height="96" loading="lazy" src="/assets/neon/a-%s.webp" width="96"/><span class="n">[[%s||%s]]</span><span class="s"><span data-n="%d">%d</span> Rings</span>%s</li>' % (k, th, en, n, n, prize)
    return o
def build(lang):
    t = src.replace('@@REELS@@', reels()).replace('@@BOARD@@', board())
    th = lang == 'th'
    t = t.replace('@@TV_EB@@', ' · <span lang="th">สำหรับนักท่องเที่ยว</span>' if th else '')
    t = t.replace('@@TV_H@@', '<span class="th2" lang="th">ดูกรุงเทพฯ ผ่านสายตาคนที่อยู่ที่นี่ ได้แพลนเที่ยวกับที่เด็ดวงในจากโลคอลกริ๊ง!</span>' if th else '')
    t = t.replace('@@TV_L@@', '')
    t = t.replace('@@TV_TAGS@@', '<li lang="th">คุยกับคนกรุงเทพฯ</li><li lang="th">เพื่อนใหม่ เป็นกลุ่ม</li><li lang="th">ที่สาธารณะ</li>' if th else '<li>Talk to locals</li><li>New friends, in groups</li><li>Public places</li>')
    t = t.replace('@@TK_QTH@@', '<i lang="th">วันแรกในกรุงเทพฯ เย็นนี้ไปไหนดี</i>' if th else '')
    lq = json.load(open(os.path.join(R, 'tools/lqip.json')))
    SEL = {'hero': '.hero .bg,.op .cam', 'card': '.cardp .bg', 'friends': '.fr .bg', 'talk': '.tk .bg', 'rank': '.rk .bg', 'venue': '.vn .bg', 'trav': '.tv .bg', 'end': '.en2 .bg'}
    t = t.replace('@@LQM@@', ''.join('%s{background-image:url(%s)}' % (SEL[k], lq[k + '-m']) for k in SEL))
    t = t.replace('@@LQD@@', ''.join('%s{background-image:url(%s)}' % (SEL[k], lq[k + '-d']) for k in SEL))
    t = re.sub(r'\[\[(.*?)\|\|(.*?)\]\]', lambda m: m.group(1 if th else 2), t, flags=re.S)
    opjs = re.sub(r'/\*.*?\*/', '', open(os.path.join(R, 'tools/opening.js'), encoding='utf-8').read(), flags=re.S)
    opjs = '\n'.join(l for l in (x.strip() for x in opjs.split('\n')) if l and not l.startswith('//'))
    t = t.replace('@@OPJS@@', opjs)
    t = t.replace('@@LANG@@', lang).replace('@@PATH@@', '/' if th else '/en/')
    t = t.replace('@@EN_CUR@@', 'false' if th else 'true').replace('@@TH_CUR@@', 'true' if th else 'false')
    t = t.replace('@@FONTPRELOAD@@', '<link as="font" crossorigin="" href="/fonts/noto-sans-thai-thai-800-normal.woff2" rel="preload" type="font/woff2"/>' if th else '<link as="font" crossorigin="" href="/fonts/unbounded-latin-800-normal.woff2" rel="preload" type="font/woff2"/>')
    assert '@@' not in t.replace('TikTok @kring', '').replace('Instagram @kring', '').replace('LINE @194', '').replace('p/@194', '').replace('com/@kring', '').replace('@font-face', '').replace('@media', '').replace('@keyframes', ''), 'unfilled token'
    out = os.path.join(R, 'index.html' if th else 'en/index.html')
    open(out, 'w', encoding='utf-8').write(t); print(out, len(t))
build('th'); build('en')
