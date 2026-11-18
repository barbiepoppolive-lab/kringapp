#!/usr/bin/env python3
"""Blog pages for search: /blog/<slug>/ (Thai) and /en/blog/<slug>/ (English), two index pages and sitemap-blog.xml.
   Article text lives in tools/blog_src/b*.py (each defines ARTS = [...]).
   Body mini-markup: '## ' = H2, '- ' = list item, '| a | b |' = table row (first row = header), blank line = new paragraph, [text](url), **bold**.
   Article keys: css='...' optional extra CSS for that article only (type hero pages), recheck='monthly'|'quarterly' (freshness line + re-check list), next=(label_th, label_en) optional end-of-page link text.
   Run: python3 tools/build_blog.py            (build)
        python3 tools/build_blog.py --check    (build + word counts, banned words, title/meta lengths)
        python3 tools/build_blog.py --review N (write a plain-text review file for batch N to stdout)"""
import os, re, sys, json, html, glob, importlib.util
sys.dont_write_bytecode = True
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://kringapp.com'
DATE = '2026-11-17'
DATE_TH = '17 พ.ย. 2026'
DATE_EN = '17 Nov 2026'
TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
EN_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
def adate(a):
    # Article key date='YYYY-MM-DD' (optional): its own publish date; older articles use DATE
    return a.get('date', DATE)
def dlabel(d, lang):
    y, m, dd = d.split('-')
    return '%d %s %s' % (int(dd), (TH_MON if lang == 'th' else EN_MON)[int(m) - 1], y)
# Typographic hero (article key hero='type'): no photo, big type in the site colours. Extra CSS only on those pages.
TYPE_CSS = '''
.hero-t{background:radial-gradient(110% 70% at 100% 0%,rgba(255,79,216,.34),transparent 58%),radial-gradient(90% 60% at 0% 45%,rgba(63,240,255,.16),transparent 62%),#07060c}
.hero-t::before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(180deg,rgba(255,255,255,.035) 0 2px,transparent 2px 14px);-webkit-mask:linear-gradient(180deg,#000,transparent 70%);mask:linear-gradient(180deg,#000,transparent 70%)}
.hero-t::after{background:linear-gradient(180deg,rgba(7,6,12,0) 34%,rgba(7,6,12,.72) 66%,#07060c 97%)}
.hero-t{flex-direction:column;justify-content:flex-end;align-items:stretch}.hero-t .in{padding-top:6px}
.tg{position:relative;z-index:2;display:flex;flex-direction:column;align-items:flex-end;padding:78px 20px 0;max-width:760px;margin:0 auto;width:100%;pointer-events:none}
.tg b{font:800 clamp(96px,30vw,230px)/.86 Unbounded,sans-serif;letter-spacing:-.05em;background:linear-gradient(135deg,#ff4fd8 10%,#8b5cff 55%,#3ff0ff);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.04em}
.tg span{margin-top:12px;font:700 11.5px/1.4 "Plus Jakarta Sans","Noto Sans Thai",sans-serif;letter-spacing:.22em;color:rgba(255,255,255,.72);text-transform:uppercase;text-align:right}html[lang=th] .tg span{font-size:13px;letter-spacing:.02em}'''

def load():
    arts = []
    for f in sorted(glob.glob(os.path.join(R, 'tools/blog_src/b*.py'))):
        spec = importlib.util.spec_from_file_location(os.path.basename(f)[:-3], f)
        m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
        for a in m.ARTS:
            a['batch'] = os.path.basename(f)[:-3]
            arts.append(a)
    return arts

E = html.escape
IMG = {'river': ('/assets/home/river.jpg', 720, 1280), 'twilight': ('/assets/home/twilight.jpg', 1500, 1000),
       'tuktuk': ('/assets/home/tuktuk.jpg', 1100, 851), 'cafe': ('/assets/home/cafe.jpg', 1000, 1400)}
for _h in ('siam', 'ari', 'thonglor', 'yaowarat', 'talat-noi', 'thonburi', 'bangkok'):
    IMG[_h] = ('/assets/hoods/%s.webp' % _h, 768, 1376)
# Social preview images must be landscape 1200x630
OG = {k: ('/assets/hoods/og-%s.jpg' % k if k in ('siam', 'ari', 'thonglor', 'yaowarat', 'talat-noi', 'thonburi', 'bangkok') else '/assets/blog/og-%s.jpg' % k) for k in IMG}
# One hero per article, spread so no picture repeats more than twice
HERO = {'make-friends-bangkok': 'siam', 'friend-apps-bangkok': 'cafe', 'solo-travel-bangkok': 'tuktuk', 'things-to-do-alone-bangkok': 'river',
        'weekend-activities-friends': 'bangkok', 'digital-nomads-bangkok': 'ari', 'expat-first-month-bangkok': 'twilight',
        'thai-friends-etiquette': 'talat-noi', 'run-clubs-bangkok': 'twilight', 'board-game-cafes-bangkok': 'cafe', 'ari-hang-out': 'ari',
        'thonglor-ekkamai': 'thonglor', 'talat-noi-charoen-krung': 'talat-noi', 'silom-lumphini': 'river', 'sukhumvit-benjakitti': 'thonglor',
        'chatuchak-weekend': 'siam', 'night-markets-friends': 'yaowarat', 'free-things-bangkok': 'bangkok', 'rainy-season-bangkok': 'tuktuk',
        'sunset-spots-bangkok': 'thonburi'}
IMG_ALT = {'river': ('แม่น้ำเจ้าพระยายามค่ำ เห็นตึกริมน้ำกรุงเทพฯ เปิดไฟ', 'The Chao Phraya River at night with Bangkok riverside towers lit up'),
           'twilight': ('เส้นขอบฟ้ากรุงเทพฯ ยามโพล้เพล้', 'The Bangkok skyline at twilight'),
           'tuktuk': ('ตุ๊กตุ๊กจอดใต้ป้ายนีออนในคืนฝนพรำ กรุงเทพฯ', 'Tuk-tuks under neon signs on a wet Bangkok night'),
           'cafe': ('หน้าร้านคาเฟ่ในตึกแถวเก่า มีร่มสีชมพูและเก้าอี้ไม้ กรุงเทพฯ', 'A café in an old Bangkok shophouse with pink parasols and wooden stools'),
           'siam': ('เพื่อนสามคนข้ามถนนย่านสยาม กรุงเทพฯ ใต้แสงนีออน', 'Three friends crossing the road at Siam, Bangkok, under neon lights'),
           'ari': ('เพื่อนถ่ายรูปให้เพื่อนในซอยร่มรื่นย่านอารีย์ กรุงเทพฯ', 'A friend taking a photo of two friends on a leafy soi in Ari, Bangkok'),
           'thonglor': ('เพื่อนสามคนบนรูฟท็อปทองหล่อยามค่ำ มีตึกกรุงเทพฯ อยู่ด้านหลัง', 'Three friends on a Thonglor rooftop at night with the Bangkok skyline behind'),
           'yaowarat': ('เพื่อนสามคนเดินใต้โคมแดงและป้ายนีออนที่เยาวราช กรุงเทพฯ', 'Three friends walking under red lanterns and neon signs in Yaowarat, Bangkok'),
           'talat-noi': ('เพื่อนเดินผ่านสตรีทอาร์ตและโคมแดงที่ตลาดน้อย กรุงเทพฯ', 'Friends walking past street art and red lanterns in Talat Noi, Bangkok'),
           'thonburi': ('เพื่อนสามคนนั่งบนลานไม้ริมแม่น้ำเจ้าพระยายามเย็น ฝั่งธนฯ', 'Three friends sitting on a wooden deck by the Chao Phraya river at sunset, Thonburi side'),
           'bangkok': ('เพื่อนดูพลุที่สะพานพระราม 8 กรุงเทพฯ', 'Friends watching fireworks at Rama VIII Bridge, Bangkok')}

def inline(t):
    t = E(t, quote=False)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    def lk(m):
        u = m.group(2)
        ext = u.startswith('http')
        return '<a href="%s"%s>%s</a>' % (E(u), ' rel="noopener"' if ext else '', m.group(1))
    return re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', lk, t)

def body_html(src):
    out, para, items, rows = [], [], [], []
    sec_open = False
    def flush():
        nonlocal para, items, rows
        if para: out.append('<p>%s</p>' % inline(' '.join(para))); para = []
        if items: out.append('<ul>%s</ul>' % ''.join('<li>%s</li>' % inline(i) for i in items)); items = []
        if rows:
            hd, bd = rows[0], rows[1:]
            out.append('<div class="tw"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (
                ''.join('<th scope="col">%s</th>' % inline(c) for c in hd),
                ''.join('<tr>%s</tr>' % ''.join('<td>%s</td>' % inline(c) for c in r) for r in bd)))
            rows = []
    for line in src.strip().split('\n'):
        l = line.strip()
        if l.startswith('|'):
            if para or items: flush()
            cells = [c.strip() for c in l.strip('|').split('|')]
            if not all(re.fullmatch(r':?-{2,}:?', c) for c in cells): rows.append(cells)
            continue
        if rows: flush()
        if l.startswith('## '):
            flush()
            if sec_open: out.append('</section>')
            out.append('<section><h2>%s</h2>' % inline(l[3:])); sec_open = True
        elif l.startswith('- '):
            if para: flush()
            items.append(l[2:])
        elif not l:
            flush()
        else:
            if items: flush()
            para.append(l)
    flush()
    if sec_open: out.append('</section>')
    return '\n'.join(out)

def plain(src):
    t = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', src)
    return t.replace('**', '')

CSS = '''@font-face{font-family:Unbounded;font-weight:800;font-display:swap;src:url(/fonts/unbounded-latin-800-normal.woff2) format("woff2")}
@font-face{font-family:"Plus Jakarta Sans";font-weight:400;font-display:swap;src:url(/fonts/plus-jakarta-sans-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"Plus Jakarta Sans";font-weight:700;font-display:swap;src:url(/fonts/plus-jakarta-sans-latin-700-normal.woff2) format("woff2")}
@font-face{font-family:"Noto Sans Thai";font-weight:400;font-display:swap;src:url(/fonts/noto-sans-thai-thai-400-normal.woff2) format("woff2")}
@font-face{font-family:"Noto Sans Thai";font-weight:800;font-display:swap;src:url(/fonts/noto-sans-thai-thai-800-normal.woff2) format("woff2")}
*{box-sizing:border-box;margin:0;padding:0}html{-webkit-text-size-adjust:100%;color-scheme:dark}body{background:#07060c;color:#fff;font:400 17px/1.7 "Plus Jakarta Sans","Noto Sans Thai",system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-wrap:break-word}
a{color:#3ff0ff}.top{position:absolute;top:0;left:0;right:0;z-index:3;display:flex;justify-content:space-between;align-items:center;padding:16px 18px}
.top a{color:#fff;text-decoration:none;font-weight:700;min-height:44px;display:inline-flex;align-items:center}.logo{padding:0 6px}.logo{font:800 20px Unbounded,"Noto Sans Thai",sans-serif}.logo i{color:#ff4fd8;font-style:normal}
.lg{font-size:13px;border:1px solid rgba(255,255,255,.35);border-radius:99px;padding:8px 14px;background:rgba(7,6,12,.4)}
.hero{position:relative;min-height:min(66vh,620px);display:flex;align-items:flex-end;overflow:hidden}
.hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,6,12,.55),rgba(7,6,12,.08) 24%,rgba(7,6,12,.55) 48%,rgba(7,6,12,.88) 72%,#07060c 97%)}
.hero .in{position:relative;z-index:2;padding:84px 20px 24px;max-width:760px;margin:0 auto;width:100%}
.bc{font-size:13px;color:rgba(255,255,255,.82);margin-bottom:6px}.bc a{color:inherit;display:inline-block;padding:10px 2px}
h1{font:800 clamp(27px,7.4vw,46px)/1.15 Unbounded,"Noto Sans Thai",sans-serif;text-shadow:0 2px 24px rgba(0,0,0,.6)}html[lang=th] h1{line-height:1.35}
.lead{margin-top:14px;font-size:18px;color:rgba(255,255,255,.94);text-shadow:0 1px 12px rgba(0,0,0,.8)}
.meta{margin-top:12px;font-size:13px;color:rgba(255,255,255,.78)}.meta a{color:inherit}
.btn{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(90deg,#ff4fd8,#8b5cff);color:#fff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:99px;box-shadow:0 0 28px rgba(255,79,216,.4);min-height:48px}
main{max-width:760px;margin:0 auto;padding:4px 20px 30px}section{padding:22px 0;border-top:1px solid rgba(255,255,255,.1)}
h2{font:800 21px/1.3 Unbounded,"Noto Sans Thai",sans-serif;margin-bottom:12px}html[lang=th] h2{line-height:1.45}
h3{font-size:17px;margin:14px 0 4px}
p,li{color:rgba(255,255,255,.86)}p+p{margin-top:12px}ul,ol{padding-left:22px;display:grid;gap:8px;margin-top:10px}strong{color:#fff}
.kr{margin:26px 0 4px;padding:22px 20px;border-radius:20px;background:linear-gradient(135deg,rgba(255,79,216,.14),rgba(63,240,255,.08));border:1px solid rgba(255,79,216,.35)}
.kr h2{font-size:18px;margin-bottom:8px}.kr .btn{margin-top:14px}.kr small{display:block;margin-top:10px;font-size:12.5px;color:rgba(255,255,255,.65)}
details{border-top:1px solid rgba(255,255,255,.1);padding:12px 0}details:first-of-type{border-top:0}
summary{cursor:pointer;font-weight:700;color:#fff;list-style:none;padding-right:26px;position:relative;min-height:28px}summary::-webkit-details-marker{display:none}
summary::after{content:"+";position:absolute;right:2px;top:-2px;font-size:22px;color:#ff4fd8}details[open] summary::after{content:"\\2212"}
details p{margin-top:8px}
.rel{list-style:none;padding:0;display:grid;gap:10px}.rel a{display:block;padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);text-decoration:none;color:#fff;font-weight:700;line-height:1.45}
.rel small{display:block;font-weight:400;color:rgba(255,255,255,.65);margin-top:2px}
.src{font-size:14px}.src li{color:rgba(255,255,255,.72)}.src li a{display:inline-block;padding:6px 0;line-height:1.5}
.tw{overflow-x:auto;margin-top:12px;-webkit-overflow-scrolling:touch}table{border-collapse:collapse;width:100%;font-size:14.5px;line-height:1.5}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.12);vertical-align:top}th{color:#fff;font-weight:700;background:rgba(255,255,255,.05)}td{color:rgba(255,255,255,.86)}td a{display:inline-block;padding:4px 0}
.fresh{margin:16px 0 0;font-size:13.5px;color:rgba(255,255,255,.72);padding:10px 14px;border-radius:12px;background:rgba(63,240,255,.06);border:1px solid rgba(63,240,255,.18)}
.nx{margin-top:12px}.nx a{display:inline-flex;align-items:center;min-height:44px;font-weight:700;color:#ff8be6;text-decoration:none}
.about{margin-top:22px;padding:16px 18px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);font-size:14.5px}.about p{color:rgba(255,255,255,.78)}.note{font-size:13.5px;color:rgba(255,255,255,.62);margin-top:12px}
.cards{list-style:none;padding:0;display:grid;gap:12px;grid-template-columns:1fr}@media(min-width:640px){.cards{grid-template-columns:1fr 1fr}}
.cards a{display:block;height:100%;padding:18px;border-radius:18px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);text-decoration:none;color:#fff}
.cards b{display:block;font:800 16.5px/1.4 Unbounded,"Noto Sans Thai",sans-serif}html[lang=th] .cards b{line-height:1.55}
.cards span{display:block;margin-top:8px;font-size:14.5px;color:rgba(255,255,255,.72);line-height:1.55}.cards em{font-style:normal;font-size:12px;color:#3ff0ff;letter-spacing:.04em;text-transform:uppercase}
footer{max-width:760px;margin:0 auto;padding:18px 20px 40px;font-size:13px;color:rgba(255,255,255,.55);display:flex;flex-wrap:wrap;gap:4px 6px}footer a{color:rgba(255,255,255,.75);text-decoration:none;padding:10px 8px}'''

T = {
 'th': dict(home='หน้าแรก', blog='บล็อก', hoods='ย่านในกรุงเทพฯ', upd='อัปเดต ' + DATE_TH, read='อ่าน %d นาที', by='โดยทีมกริ๊ง!', about='/about',
            abouth='เกี่ยวกับบทความนี้', abouttxt='เขียนและตรวจข้อมูลโดยทีมกริ๊ง! ในกรุงเทพฯ ตรวจกับแหล่งข้อมูลด้านบนล่าสุดเมื่อ ' + DATE_TH + ' กริ๊ง! เป็นแอปของเราเอง ไม่มีที่ไหนในบทความนี้จ่ายเงินเพื่อให้ถูกพูดถึง เจอข้อมูลที่ไม่ตรง แจ้งเราได้ที่หน้า<a href="/contact">ติดต่อ</a>', disc='กริ๊ง! เป็นแอปของเราเอง', faq='คำถามที่พบบ่อย',
            fresh={'monthly': 'ตรวจเวลาเปิด ราคา และการเดินทางในหน้านี้ล่าสุด %s · หน้านี้เราตรวจซ้ำทุกเดือน', 'quarterly': 'ตรวจข้อมูลในหน้านี้ล่าสุด %s · หน้านี้เราตรวจซ้ำทุก 3 เดือน'},
            rel='อ่านต่อ', src='แหล่งข้อมูล', srcnote='ข้อมูลเวลาเปิด-ปิดและราคาอาจเปลี่ยนได้ เช็กกับช่องทางทางการของสถานที่ก่อนไปเสมอ',
            open='เปิดกริ๊ง!', sub='ฟรี · LINE หรืออีเมล · อายุ 20 ปีขึ้นไป', switch='EN',
            foot=[('/', 'หน้าแรก'), ('/blog/', 'บล็อก'), ('/bangkok/', 'ย่านในกรุงเทพฯ'), ('/locals/', 'โลคอลกริ๊ง!'), ('/partners/', 'สำหรับร้าน'), ('/safety', 'ความปลอดภัย'), ('/terms', 'ข้อกำหนด'), ('/privacy', 'ความเป็นส่วนตัว')],
            area='ย่าน', locale='th_TH'),
 'en': dict(home='Home', blog='Blog', hoods='Bangkok areas', upd='Updated ' + DATE_EN, read='%d min read', by='By the Kring team', about='/about',
            abouth='About this article', abouttxt='Written and fact-checked by the Kring team in Bangkok against the sources above, last checked on ' + DATE_EN + '. Kring is our own app. No place mentioned here paid to be included. Spotted something out of date? Tell us on our <a href="/contact">contact page</a>.', disc='Kring is our own app.', faq='FAQ',
            fresh={'monthly': 'Hours, prices and transport on this page last checked %s · we re-check this page every month', 'quarterly': 'Facts on this page last checked %s · we re-check this page every 3 months'},
            rel='Read next', src='Sources', srcnote='Opening hours and prices can change. Always check the place\'s official channels before you go.',
            open='Open Kring', sub='Free · LINE or email · Ages 20+', switch='ไทย',
            foot=[('/en/', 'Home'), ('/en/blog/', 'Blog'), ('/en/bangkok/', 'Bangkok areas'), ('/locals/', 'Kring Locals'), ('/partners/', 'For venues'), ('/safety', 'Safety'), ('/terms', 'Terms'), ('/privacy', 'Privacy')],
            area='Area', locale='en_US'),
}

def path(lang, slug=None):
    p = '/blog/' if lang == 'th' else '/en/blog/'
    return p + (slug + '/' if slug else '')

def head(lang, title, desc, canon_th, canon_en, ld, img, ogtype='article', css_extra=''):
    me = canon_th if lang == 'th' else canon_en
    return '''<!doctype html>
<html lang="%s">
<head>
<meta charset="utf-8"/><meta content="width=device-width,initial-scale=1,viewport-fit=cover" name="viewport"/>
<title>%s</title>
<meta content="%s" name="description"/>
<link href="%s%s" rel="canonical"/>
<link href="%s%s" hreflang="th" rel="alternate"/>
<link href="%s%s" hreflang="en" rel="alternate"/>
<link href="%s%s" hreflang="x-default" rel="alternate"/>
<meta content="#07060c" name="theme-color"/><meta content="dark" name="color-scheme"/><meta content="Kring" name="author"/><link href="/icon-192.png" rel="icon" sizes="192x192" type="image/png"/>
<meta content="%s" property="og:type"/><meta content="Kring" property="og:site_name"/><meta content="%s" property="og:locale"/><meta content="%s%s" property="og:url"/>
<meta content="%s" property="og:title"/><meta content="%s" property="og:description"/><meta content="%s%s" property="og:image"/>
<meta content="%s" property="og:image:alt"/><meta content="1200" property="og:image:width"/><meta content="630" property="og:image:height"/>
<meta content="summary_large_image" name="twitter:card"/><meta content="%s" name="twitter:title"/><meta content="%s" name="twitter:description"/><meta content="%s%s" name="twitter:image"/>
<script type="application/ld+json">%s</script>
<style>%s</style>
</head>
<body>
''' % (lang, E(title), E(desc), SITE, me, SITE, canon_th, SITE, canon_en, SITE, canon_th, ogtype, T[lang]['locale'], SITE, me,
       E(title), E(desc), SITE, img, E(title), E(title), E(desc), SITE, img, json.dumps(ld, ensure_ascii=False, separators=(',', ':')), CSS + css_extra)

def foot(lang):
    return '<footer>%s<span style="flex:1 0 100%%;padding:8px">© 2026 %s</span></footer>\n</body>\n</html>\n' % (
        ''.join('<a href="%s">%s</a>' % (u, E(n)) for u, n in T[lang]['foot']),
        'กริ๊ง! (Kring) กรุงเทพฯ · สำหรับอายุ 20 ปีขึ้นไป' if lang == 'th' else 'Kring Bangkok · For ages 20 and over')

def words(lang, text):
    if lang == 'en':
        return len(re.findall(r"[A-Za-z0-9'’-]+", text))
    # Thai has no spaces: estimate words as Thai characters / 4.3 plus Latin words
    th = len(re.findall(r'[฀-๿]', text))
    return int(th / 4.3) + len(re.findall(r'[A-Za-z0-9]+', text))

def build_article(a, lang, arts_by_slug):
    L = a[lang]; t = T[lang]; slug = a['slug']
    canon_th, canon_en = path('th', slug), path('en', slug)
    d = adate(a); dl = dlabel(d, lang); dl0 = DATE_TH if lang == 'th' else DATE_EN
    typ = a.get('hero') == 'type'
    if typ:
        og = a['og']; ldimg = [SITE + og]
    else:
        hk = HERO.get(slug, a['img'])
        img = IMG[hk]
        alt = IMG_ALT[hk][0 if lang == 'th' else 1]
        og = OG[hk]; ldimg = [SITE + img[0], SITE + OG[hk]]
    body = body_html(L['body'])
    allt = plain(L['body']) + ' ' + ' '.join(q + ' ' + x for q, x in L['faq'])
    mins = max(3, round(words(lang, allt) / 220))
    join = SITE + '/app/?src=blog_' + slug + '&join=1'
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Kring', 'item': SITE + ('/' if lang == 'th' else '/en/')},
            {'@type': 'ListItem', 'position': 2, 'name': t['blog'], 'item': SITE + path(lang)},
            {'@type': 'ListItem', 'position': 3, 'name': L['h1'], 'item': SITE + path(lang, slug)}]},
        {'@type': 'Article', 'headline': L['h1'][:110], 'description': L['desc'], 'inLanguage': lang,
         'datePublished': d, 'dateModified': d, 'image': ldimg,
         'author': {'@type': 'Organization', 'name': 'Kring', 'url': SITE + '/about'},
         'publisher': {'@type': 'Organization', 'name': 'Kring', 'url': SITE + '/', 'logo': {'@type': 'ImageObject', 'url': SITE + '/icon-512.png'}},
         'mainEntityOfPage': SITE + path(lang, slug)},
        {'@type': 'FAQPage', 'inLanguage': lang, 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': plain(x)}} for q, x in L['faq']]}]}
    o = head(lang, L['title'], L['desc'], canon_th, canon_en, ld, og, css_extra=(TYPE_CSS + a.get('css', '')) if typ else '')
    o += '<div class="top"><a class="logo" href="%s">กริ๊ง<i>!</i></a><a class="lg" href="%s" hreflang="%s">%s</a></div>\n' % (
        '/' if lang == 'th' else '/en/', canon_en if lang == 'th' else canon_th, 'en' if lang == 'th' else 'th', t['switch'])
    if typ:
        tg = a['typo'][lang]
        o += '<header class="hero hero-t"><div class="tg" aria-hidden="true"><b>%s</b><span>%s</span></div><div class="in"><p class="bc"><a href="%s">%s</a> › <a href="%s">%s</a></p><h1>%s</h1><p class="lead">%s</p><p class="meta"><a href="%s">%s</a> · %s · %s</p></div></header>\n' % (
            E(tg[0]), E(tg[1]), '/' if lang == 'th' else '/en/', t['home'], path(lang), t['blog'], E(L['h1']), inline(L['lead']), t['about'], t['by'], t['upd'].replace(dl0, dl), t['read'] % mins)
    else:
      o += '<header class="hero"><img alt="%s" fetchpriority="high" height="%d" src="%s" width="%d"/><div class="in"><p class="bc"><a href="%s">%s</a> › <a href="%s">%s</a></p><h1>%s</h1><p class="lead">%s</p><p class="meta"><a href="%s">%s</a> · %s · %s</p></div></header>\n' % (
        E(alt), img[2], img[0], img[1], '/' if lang == 'th' else '/en/', t['home'], path(lang), t['blog'], E(L['h1']), inline(L['lead']), t['about'], t['by'], t['upd'], t['read'] % mins)
    o += '<main>\n<p class="fresh">✓ %s</p>\n<article>\n' % (t['fresh'][a.get('recheck', 'quarterly')] % dl) + body + '\n'
    k = L['cta']
    o += '<aside class="kr"><h2>%s</h2><p>%s</p><a class="btn" href="%s">%s →</a><small>%s · %s</small></aside>\n' % (E(k[0]), inline(k[1]), E(join), t['open'], t['disc'], t['sub'])
    o += '<section><h2>%s</h2>%s</section>\n' % (t['faq'], ''.join('<details><summary>%s</summary><p>%s</p></details>' % (E(q), inline(x)) for q, x in L['faq']))
    o += '</article>\n'
    rel = []
    for s in a.get('areas', []):
        u = '/bangkok/' if s == 'hub' else '/bangkok/%s/' % s
        rel.append(((u if lang == 'th' else '/en' + u), AREAS[s][0 if lang == 'th' else 1], t['area']))
    for s in a.get('related', []):
        if s not in arts_by_slug: continue
        b = arts_by_slug[s]
        rel.append((path(lang, s), b[lang]['h1'], t['blog']))
    o += '<section><h2>%s</h2><ul class="rel">%s</ul></section>\n' % (t['rel'], ''.join('<li><a href="%s">%s<small>%s</small></a></li>' % (u, E(n), E(k)) for u, n, k in rel))
    o += '<section class="src"><h2>%s</h2><ol>%s</ol><p class="note">%s</p></section>\n' % (t['src'], ''.join('<li><a href="%s" rel="noopener nofollow">%s</a></li>' % (E(u), E(n)) for n, u in a.get('sources_' + lang, a['sources'])), t['srcnote'])
    nx = a.get('next')
    nxl = (nx[0 if lang == 'th' else 1] if nx else k[0])
    o += '<aside class="about"><h2 style="font-size:16px">%s</h2><p>%s</p><p class="nx"><a href="%s">%s →</a></p></aside>\n' % (t['abouth'], t['abouttxt'].replace(dl0, dl), E(join), E(nxl))
    o += '</main>\n' + foot(lang)
    return o, words(lang, allt)

AREAS = {'ari': ('อารีย์', 'Ari'), 'thonglor': ('ทองหล่อ', 'Thonglor'), 'siam': ('สยาม', 'Siam'), 'yaowarat': ('เยาวราช', 'Yaowarat'),
         'talat-noi': ('ตลาดน้อย', 'Talat Noi'), 'thonburi': ('ฝั่งธนฯ ริมแม่น้ำ', 'Thonburi riverside'),
         'hub': ('ทุกย่านในกรุงเทพฯ', 'All Bangkok areas')}

def build_index(lang, arts):
    t = T[lang]
    title = 'บล็อกกริ๊ง! หาเพื่อนใหม่และที่เที่ยวในกรุงเทพฯ' if lang == 'th' else 'Kring Blog: Make Friends & Explore Bangkok'
    desc = ('รวมบทความหาเพื่อนใหม่ในกรุงเทพฯ ย่านน่าแฮงก์เอาต์ กิจกรรมวันหยุด ตลาดกลางคืน และที่เที่ยวฟรี เขียนโดยทีมกริ๊ง! อัปเดตพฤศจิกายน 2026'
            if lang == 'th' else 'Honest Bangkok articles on making friends, areas to hang out, weekend activities, night markets and free things to do. Updated November 2026.')
    h1 = 'บล็อก<em style="font-style:normal;color:#ff4fd8">กริ๊ง!</em>' if lang == 'th' else 'The Kring <em style="font-style:normal;color:#ff4fd8">Blog</em>'
    lead = ('เรื่องจริงเรื่องกรุงเทพฯ สำหรับคนที่อยากมีเพื่อนใหม่ ทั้งคนกรุงเทพฯ และนักท่องเที่ยว' if lang == 'th'
            else 'Straight answers about Bangkok for anyone who wants new friends here, locals and travellers alike.')
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Kring', 'item': SITE + ('/' if lang == 'th' else '/en/')},
            {'@type': 'ListItem', 'position': 2, 'name': t['blog'], 'item': SITE + path(lang)}]},
        {'@type': 'Blog', 'name': title, 'inLanguage': lang, 'url': SITE + path(lang),
         'blogPost': [{'@type': 'BlogPosting', 'headline': a[lang]['h1'][:110], 'url': SITE + path(lang, a['slug']), 'datePublished': adate(a)} for a in arts]}]}
    o = head(lang, title, desc, path('th'), path('en'), ld, '/assets/hoods/og-bangkok.jpg', 'website')
    o += '<div class="top"><a class="logo" href="%s">กริ๊ง<i>!</i></a><a class="lg" href="%s" hreflang="%s">%s</a></div>\n' % (
        '/' if lang == 'th' else '/en/', path('en') if lang == 'th' else path('th'), 'en' if lang == 'th' else 'th', t['switch'])
    o += '<header class="hero" style="min-height:min(60vh,540px)"><img alt="%s" fetchpriority="high" height="1376" src="/assets/hoods/bangkok.webp" width="768" style="object-position:50%% 70%%"/><div class="in"><p class="bc"><a href="%s">%s</a></p><h1>%s</h1><p class="lead">%s</p></div></header>\n' % (
        E(IMG_ALT['bangkok'][0 if lang == 'th' else 1]), '/' if lang == 'th' else '/en/', t['home'], h1, E(lead))
    o += '<main>\n'
    for gk, gname in GROUPS[lang]:
        items = sorted([a for a in arts if a['group'] == gk], key=adate, reverse=True)  # stable: newest first, older keep their order
        if not items: continue
        o += '<section><h2>%s</h2><ul class="cards">%s</ul></section>\n' % (E(gname), ''.join(
            '<li><a href="%s"><b>%s</b><span>%s</span></a></li>' % (path(lang, a['slug']), E(a[lang]['h1']), E(a[lang]['card'])) for a in items))
    o += '<aside class="kr"><h2>%s</h2><p>%s</p><a class="btn" href="https://kringapp.com/app/?src=blog_index&amp;join=1">%s →</a><small>%s</small></aside>\n' % (
        ('กริ๊ง! คืออะไร' if lang == 'th' else 'What is Kring?'),
        ('แอปหาเพื่อนใหม่ในกรุงเทพฯ สำหรับคนไทยและนักท่องเที่ยว โพสต์ Reels สั้น ๆ จากที่จริงในเมือง ขึ้นบอร์ดประจำสัปดาห์ที่มีรางวัลจริง และถามตอบในห้อง "ถามคนไทย" แชตแปลไทย-อังกฤษให้อัตโนมัติ'
         if lang == 'th' else 'A Bangkok app for making new friends, for Thais and travellers. Post short Reels from real places, climb a weekly board with real prizes, and ask questions in "Ask a Thai". Chats translate between Thai and English automatically.'),
        t['open'], t['disc'] + ' · ' + t['sub'])
    o += '</main>\n' + foot(lang)
    return o

GROUPS = {'th': [('friends', 'หาเพื่อนใหม่'), ('areas', 'ย่านน่าแฮงก์เอาต์'), ('do', 'ทำอะไรดีในกรุงเทพฯ'), ('live', 'ใช้ชีวิตในกรุงเทพฯ')],
          'en': [('friends', 'Making friends'), ('areas', 'Areas to hang out'), ('do', 'Things to do'), ('live', 'Living in Bangkok')]}

BANNED = [r'\bmeet', r'\bguides?\b', r'\bguidebooks?\b', r'\btours?\b', r'\bhosts?\b', r'\bhosting\b', r'\bcreators?\b', r'\breviews?\b', r'hidden gem',
          r'alcohol', r'\bgifts?\b', r'\bwallets?\b', r'\bcredits?\b', r'\blucky\b', r'\bdraws?\b', r'\bdrawn\b', r'temples?', r'\brates?\b',
          r'\bstars?\b', r'\bcoins?\b', r'\blaunch', r'dating', r'go together', r'\bbeer\b', r'\bwine\b', r'cocktail',
          'ลุ้น', 'โฮสต์', 'ไกด์', 'ทัวร์', 'ครีเอเตอร์', 'ของขวัญ', 'วอลเล็ท', 'กระเป๋าเงิน', 'เครดิต', 'เหรียญ', 'จับฉลาก', 'นำโชค',
          'รีวิว', 'แอลกอฮอล์', 'เหล้า', 'เบียร์', r'(?<!ห)วัด(?!มังกร|ปทุมคงคา|อรุณ)', 'นัดเจอ', 'เดท', 'ไปด้วยกัน', 'อัญมณี', 'คราฟต์เบียร์']

def check(arts):
    bad = 0
    for a in arts:
        for lang in ('th', 'en'):
            L = a[lang]
            txt = ' '.join([L['title'], L['desc'], L['h1'], L['lead'], plain(L['body']), L['card'], L['cta'][0], L['cta'][1]] + [q + ' ' + x for q, x in L['faq']])
            txt_nolinks = re.sub(r'\([^)]*https?://[^)]*\)', '', txt)
            hits = [b for b in BANNED if re.search(b, txt_nolinks, re.I)]
            w = words(lang, ' '.join([plain(L['lead']), plain(L['body']), L['cta'][0], plain(L['cta'][1])]) + ' ' + ' '.join(q + ' ' + x for q, x in L['faq']))
            tl, dl = len(L['title']), len(L['desc'])
            first = plain(L['lead'])
            flag = []
            if hits: flag.append('BANNED ' + ','.join(hits))
            if tl > 60: flag.append('title %d' % tl)
            if dl > 155: flag.append('desc %d' % dl)
            if not (650 <= w <= 1250): flag.append('words %d' % w)
            if flag: bad += 1
            print('%-28s %s  w=%4d  t=%2d d=%3d  %s' % (a['slug'], lang, w, tl, dl, ' | '.join(flag)))
    # Also scan the built pages' visible text (sources, alt text, footer, schema) for banned words
    for f in sorted(glob.glob(os.path.join(R, 'blog/**/index.html'), recursive=True) + glob.glob(os.path.join(R, 'en/blog/**/index.html'), recursive=True)):
        h = open(f, encoding='utf-8').read()
        vis = re.sub(r'<style.*?</style>', '', h, flags=re.S)
        txt = html.unescape(re.sub(r'<[^>]+>', ' ', re.sub(r'href="[^"]*"', '', vis))) + ' ' + ' '.join(re.findall(r'alt="([^"]*)"', vis))
        hits = [b for b in BANNED if re.search(b, txt, re.I)]
        if hits: bad += 1; print('BUILT PAGE', f.replace(R, ''), 'BANNED', ','.join(hits))
    print('problems:', bad)

def review(arts, batch):
    for a in arts:
        if a['batch'] != batch: continue
        print('=' * 70); print('ARTICLE', a['slug'])
        for lang in ('th', 'en'):
            L = a[lang]
            print('-' * 70); print('[%s] SEO title (%d chars): %s' % (lang.upper(), len(L['title']), L['title']))
            print('[%s] Meta description (%d chars): %s' % (lang.upper(), len(L['desc']), L['desc']))
            print('[%s] H1: %s' % (lang.upper(), L['h1'])); print('[%s] Lead: %s\n' % (lang.upper(), plain(L['lead'])))
            print(plain(L['body']).strip()); print('\n[CTA] %s — %s' % (L['cta'][0], plain(L['cta'][1])))
            print('\n[FAQ]'); [print('Q: %s\nA: %s' % (q, plain(x))) for q, x in L['faq']]
        print('\n[SOURCES]'); [print('- %s %s' % (n, u)) for n, u in a['sources']]

def main():
    arts = load()
    if '--review' in sys.argv:
        review(arts, sys.argv[sys.argv.index('--review') + 1]); return
    by = {a['slug']: a for a in arts}
    for a in arts:
        for lang in ('th', 'en'):
            o, _ = build_article(a, lang, by)
            d = os.path.join(R, path(lang, a['slug']).strip('/'))
            os.makedirs(d, exist_ok=True)
            open(os.path.join(d, 'index.html'), 'w', encoding='utf-8').write(o)
    for lang in ('th', 'en'):
        d = os.path.join(R, path(lang).strip('/')); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, 'index.html'), 'w', encoding='utf-8').write(build_index(lang, arts))
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    newest = max(adate(a) for a in arts)
    for slug, lm in [(None, newest)] + [(a['slug'], adate(a)) for a in arts]:
        for lang in ('th', 'en'):
            sm.append('  <url>\n    <loc>%s%s</loc>\n    <lastmod>%s</lastmod>\n    <xhtml:link rel="alternate" hreflang="th" href="%s%s"/>\n    <xhtml:link rel="alternate" hreflang="en" href="%s%s"/>\n    <xhtml:link rel="alternate" hreflang="x-default" href="%s%s"/>\n  </url>' % (
                SITE, path(lang, slug), lm, SITE, path('th', slug), SITE, path('en', slug), SITE, path('th', slug)))
    sm.append('</urlset>\n')
    open(os.path.join(R, 'sitemap-blog.xml'), 'w', encoding='utf-8').write('\n'.join(sm))
    # Same blog entries inside the main sitemap.xml too, between markers (replaced on every build)
    mp = os.path.join(R, 'sitemap.xml'); ms = open(mp, encoding='utf-8').read()
    blk = '  <!-- blog:start -->\n' + '\n'.join(sm[2:-1]) + '\n  <!-- blog:end -->\n'
    if '<!-- blog:start -->' in ms:
        ms = re.sub(r'  <!-- blog:start -->.*?<!-- blog:end -->\n', lambda m: blk, ms, flags=re.S)
    else:
        ms = ms.replace('</urlset>', blk + '</urlset>')
    open(mp, 'w', encoding='utf-8').write(ms)
    print('built %d articles x 2 languages + 2 index pages' % len(arts))
    if '--check' in sys.argv: check(arts)

if __name__ == '__main__':
    main()
