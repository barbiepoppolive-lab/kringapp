#!/usr/bin/env python3
"""Blog pages for search: /blog/<slug>/ (Thai) and /en/blog/<slug>/ (English), two index pages and sitemap-blog.xml.
   Article text lives in tools/blog_src/b*.py (each defines ARTS = [...]).
   Body mini-markup: '## ' = H2, '- ' = list item, blank line = new paragraph, [text](url), **bold**.
   Run: python3 tools/build_blog.py            (build)
        python3 tools/build_blog.py --check    (build + word counts, banned words, title/meta lengths)
        python3 tools/build_blog.py --review N (write a plain-text review file for batch N to stdout)"""
import os, re, sys, json, html, glob, importlib.util
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://kringapp.com'
DATE = '2026-11-17'
DATE_TH = '17 พ.ย. 2026'
DATE_EN = '17 Nov 2026'

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
IMG_ALT = {'river': ('แม่น้ำเจ้าพระยายามค่ำ เห็นตึกริมน้ำกรุงเทพฯ เปิดไฟ', 'The Chao Phraya River at night with Bangkok riverside towers lit up'),
           'twilight': ('เส้นขอบฟ้ากรุงเทพฯ ยามโพล้เพล้', 'The Bangkok skyline at twilight'),
           'tuktuk': ('ตุ๊กตุ๊กจอดใต้ป้ายนีออนในคืนฝนพรำ กรุงเทพฯ', 'Tuk-tuks under neon signs on a wet Bangkok night'),
           'cafe': ('หน้าร้านคาเฟ่ในตึกแถวเก่า มีร่มสีชมพูและเก้าอี้ไม้ กรุงเทพฯ', 'A café in an old Bangkok shophouse with pink parasols and wooden stools')}

def inline(t):
    t = E(t, quote=False)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    def lk(m):
        u = m.group(2)
        ext = u.startswith('http')
        return '<a href="%s"%s>%s</a>' % (E(u), ' rel="noopener"' if ext else '', m.group(1))
    return re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', lk, t)

def body_html(src):
    out, para, items = [], [], []
    sec_open = False
    def flush():
        nonlocal para, items
        if para: out.append('<p>%s</p>' % inline(' '.join(para))); para = []
        if items: out.append('<ul>%s</ul>' % ''.join('<li>%s</li>' % inline(i) for i in items)); items = []
    for line in src.strip().split('\n'):
        l = line.strip()
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
*{box-sizing:border-box;margin:0;padding:0}html{-webkit-text-size-adjust:100%}body{background:#07060c;color:#fff;font:400 17px/1.7 "Plus Jakarta Sans","Noto Sans Thai",system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-wrap:break-word}
a{color:#3ff0ff}.top{position:absolute;top:0;left:0;right:0;z-index:3;display:flex;justify-content:space-between;align-items:center;padding:16px 18px}
.top a{color:#fff;text-decoration:none;font-weight:700}.logo{font:800 20px Unbounded,"Noto Sans Thai",sans-serif}.logo i{color:#ff4fd8;font-style:normal}
.lg{font-size:13px;border:1px solid rgba(255,255,255,.35);border-radius:99px;padding:8px 14px;background:rgba(7,6,12,.4)}
.hero{position:relative;min-height:min(78vh,700px);display:flex;align-items:flex-end;overflow:hidden}
.hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,6,12,.55),rgba(7,6,12,.05) 30%,rgba(7,6,12,.35) 55%,#07060c 97%)}
.hero .in{position:relative;z-index:2;padding:96px 20px 28px;max-width:760px;margin:0 auto;width:100%}
.bc{font-size:13px;color:rgba(255,255,255,.78);margin-bottom:10px}.bc a{color:inherit}
h1{font:800 clamp(27px,7.4vw,46px)/1.15 Unbounded,"Noto Sans Thai",sans-serif;text-shadow:0 2px 24px rgba(0,0,0,.6)}html[lang=th] h1{line-height:1.35}
.lead{margin-top:14px;font-size:18px;color:rgba(255,255,255,.94);text-shadow:0 1px 12px rgba(0,0,0,.8)}
.meta{margin-top:12px;font-size:13px;color:rgba(255,255,255,.7)}
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
.src{font-size:14px}.src li{color:rgba(255,255,255,.7)}.note{font-size:13.5px;color:rgba(255,255,255,.62);margin-top:12px}
.cards{list-style:none;padding:0;display:grid;gap:12px;grid-template-columns:1fr}@media(min-width:640px){.cards{grid-template-columns:1fr 1fr}}
.cards a{display:block;height:100%;padding:18px;border-radius:18px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);text-decoration:none;color:#fff}
.cards b{display:block;font:800 16.5px/1.4 Unbounded,"Noto Sans Thai",sans-serif}html[lang=th] .cards b{line-height:1.55}
.cards span{display:block;margin-top:8px;font-size:14.5px;color:rgba(255,255,255,.72);line-height:1.55}.cards em{font-style:normal;font-size:12px;color:#3ff0ff;letter-spacing:.04em;text-transform:uppercase}
footer{max-width:760px;margin:0 auto;padding:18px 20px 40px;font-size:13px;color:rgba(255,255,255,.55);display:flex;flex-wrap:wrap;gap:4px 6px}footer a{color:rgba(255,255,255,.75);text-decoration:none;padding:10px 8px}'''

T = {
 'th': dict(home='หน้าแรก', blog='บล็อก', hoods='ย่านในกรุงเทพฯ', upd='อัปเดต ' + DATE_TH, read='อ่าน %d นาที', faq='คำถามที่พบบ่อย',
            rel='อ่านต่อ', src='แหล่งข้อมูล', srcnote='ข้อมูลเวลาเปิด-ปิดและราคาอาจเปลี่ยนได้ เช็กกับช่องทางทางการของสถานที่ก่อนไปเสมอ',
            open='เปิดกริ๊ง!', sub='ฟรี · LINE หรืออีเมล · อายุ 20 ปีขึ้นไป', switch='EN',
            foot=[('/', 'หน้าแรก'), ('/blog/', 'บล็อก'), ('/bangkok/', 'ย่านในกรุงเทพฯ'), ('/locals/', 'โลคอลกริ๊ง!'), ('/partners/', 'สำหรับร้าน'), ('/safety', 'ความปลอดภัย'), ('/terms', 'ข้อกำหนด'), ('/privacy', 'ความเป็นส่วนตัว')],
            area='ย่าน', locale='th_TH'),
 'en': dict(home='Home', blog='Blog', hoods='Bangkok areas', upd='Updated ' + DATE_EN, read='%d min read', faq='FAQ',
            rel='Read next', src='Sources', srcnote='Opening hours and prices can change. Always check the place\'s official channels before you go.',
            open='Open Kring', sub='Free · LINE or email · Ages 20+', switch='ไทย',
            foot=[('/en/', 'Home'), ('/en/blog/', 'Blog'), ('/en/bangkok/', 'Bangkok areas'), ('/locals/', 'Kring Locals'), ('/partners/', 'For venues'), ('/safety', 'Safety'), ('/terms', 'Terms'), ('/privacy', 'Privacy')],
            area='Area', locale='en_US'),
}

def path(lang, slug=None):
    p = '/blog/' if lang == 'th' else '/en/blog/'
    return p + (slug + '/' if slug else '')

def head(lang, title, desc, canon_th, canon_en, ld, img, ogtype='article'):
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
<meta content="#07060c" name="theme-color"/><link href="/icon-192.png" rel="icon" sizes="192x192" type="image/png"/>
<meta content="%s" property="og:type"/><meta content="Kring" property="og:site_name"/><meta content="%s" property="og:locale"/><meta content="%s%s" property="og:url"/>
<meta content="%s" property="og:title"/><meta content="%s" property="og:description"/><meta content="%s%s" property="og:image"/>
<meta content="summary_large_image" name="twitter:card"/>
<script type="application/ld+json">%s</script>
<style>%s</style>
</head>
<body>
''' % (lang, E(title), E(desc), SITE, me, SITE, canon_th, SITE, canon_en, SITE, canon_th, ogtype, T[lang]['locale'], SITE, me,
       E(title), E(desc), SITE, img, json.dumps(ld, ensure_ascii=False, separators=(',', ':')), CSS)

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
    img = IMG[a['img']]
    alt = IMG_ALT[a['img']][0 if lang == 'th' else 1]
    body = body_html(L['body'])
    allt = plain(L['body']) + ' ' + ' '.join(q + ' ' + x for q, x in L['faq'])
    mins = max(3, round(words(lang, allt) / 220))
    join = '/app/?join=1&src=blog_' + slug.replace('-', '_')
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Kring', 'item': SITE + ('/' if lang == 'th' else '/en/')},
            {'@type': 'ListItem', 'position': 2, 'name': t['blog'], 'item': SITE + path(lang)},
            {'@type': 'ListItem', 'position': 3, 'name': L['h1'], 'item': SITE + path(lang, slug)}]},
        {'@type': 'Article', 'headline': L['h1'][:110], 'description': L['desc'], 'inLanguage': lang,
         'datePublished': DATE, 'dateModified': DATE, 'image': SITE + img[0],
         'author': {'@type': 'Organization', 'name': 'Kring', 'url': SITE + '/'},
         'publisher': {'@type': 'Organization', 'name': 'Kring', 'url': SITE + '/', 'logo': {'@type': 'ImageObject', 'url': SITE + '/icon-512.png'}},
         'mainEntityOfPage': SITE + path(lang, slug)},
        {'@type': 'FAQPage', 'inLanguage': lang, 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': plain(x)}} for q, x in L['faq']]}]}
    o = head(lang, L['title'], L['desc'], canon_th, canon_en, ld, img[0])
    o += '<div class="top"><a class="logo" href="%s">กริ๊ง<i>!</i></a><a class="lg" href="%s" hreflang="%s">%s</a></div>\n' % (
        '/' if lang == 'th' else '/en/', canon_en if lang == 'th' else canon_th, 'en' if lang == 'th' else 'th', t['switch'])
    o += '<header class="hero"><img alt="%s" fetchpriority="high" height="%d" src="%s" width="%d"/><div class="in"><p class="bc"><a href="%s">%s</a> › <a href="%s">%s</a></p><h1>%s</h1><p class="lead">%s</p><p class="meta">%s · %s</p></div></header>\n' % (
        E(alt), img[2], img[0], img[1], '/' if lang == 'th' else '/en/', t['home'], path(lang), t['blog'], E(L['h1']), inline(L['lead']), t['upd'], t['read'] % mins)
    o += '<main>\n<article>\n' + body + '\n'
    k = L['cta']
    o += '<aside class="kr"><h2>%s</h2><p>%s</p><a class="btn" href="%s">%s →</a><small>%s</small></aside>\n' % (E(k[0]), inline(k[1]), E(join), t['open'], t['sub'])
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
    o += '<section class="src"><h2>%s</h2><ol>%s</ol><p class="note">%s</p></section>\n' % (t['src'], ''.join('<li><a href="%s" rel="noopener nofollow">%s</a></li>' % (E(u), E(n)) for n, u in a['sources']), t['srcnote'])
    o += '</main>\n' + foot(lang)
    return o, words(lang, allt)

AREAS = {'ari': ('อารีย์', 'Ari'), 'thonglor': ('ทองหล่อ', 'Thonglor'), 'siam': ('สยาม', 'Siam'), 'yaowarat': ('เยาวราช', 'Yaowarat'),
         'talat-noi': ('ตลาดน้อย', 'Talat Noi'), 'thonburi': ('ฝั่งธนฯ ริมแม่น้ำ', 'Thonburi riverside'),
         'hub': ('ทุกย่านในกรุงเทพฯ', 'All Bangkok areas')}

def build_index(lang, arts):
    t = T[lang]
    title = 'บล็อกกริ๊ง! หาเพื่อนใหม่และที่เที่ยวในกรุงเทพฯ 2027' if lang == 'th' else 'Kring Blog: Make Friends & Explore Bangkok (2027)'
    desc = ('รวมบทความหาเพื่อนใหม่ในกรุงเทพฯ ย่านน่าแฮงก์เอาต์ กิจกรรมวันหยุด ตลาดกลางคืน และที่เที่ยวฟรี เขียนโดยทีมกริ๊ง! อัปเดตสำหรับปี 2027'
            if lang == 'th' else 'Honest Bangkok articles on making friends, areas to hang out, weekend activities, night markets and free things to do. Updated for 2027.')
    h1 = 'บล็อก<em style="font-style:normal;color:#ff4fd8">กริ๊ง!</em>' if lang == 'th' else 'The Kring <em style="font-style:normal;color:#ff4fd8">Blog</em>'
    lead = ('เรื่องจริงเรื่องกรุงเทพฯ สำหรับคนที่อยากมีเพื่อนใหม่ ทั้งคนกรุงเทพฯ และนักท่องเที่ยว' if lang == 'th'
            else 'Straight answers about Bangkok for anyone who wants new friends here, locals and travellers alike.')
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Kring', 'item': SITE + ('/' if lang == 'th' else '/en/')},
            {'@type': 'ListItem', 'position': 2, 'name': t['blog'], 'item': SITE + path(lang)}]},
        {'@type': 'Blog', 'name': title, 'inLanguage': lang, 'url': SITE + path(lang),
         'blogPost': [{'@type': 'BlogPosting', 'headline': a[lang]['h1'][:110], 'url': SITE + path(lang, a['slug']), 'datePublished': DATE} for a in arts]}]}
    o = head(lang, title, desc, path('th'), path('en'), ld, '/assets/home/twilight.jpg', 'website')
    o += '<div class="top"><a class="logo" href="%s">กริ๊ง<i>!</i></a><a class="lg" href="%s" hreflang="%s">%s</a></div>\n' % (
        '/' if lang == 'th' else '/en/', path('en') if lang == 'th' else path('th'), 'en' if lang == 'th' else 'th', t['switch'])
    o += '<header class="hero" style="min-height:min(56vh,520px)"><img alt="%s" fetchpriority="high" height="1000" src="/assets/home/twilight.jpg" width="1500"/><div class="in"><p class="bc"><a href="%s">%s</a></p><h1>%s</h1><p class="lead">%s</p></div></header>\n' % (
        E(IMG_ALT['twilight'][0 if lang == 'th' else 1]), '/' if lang == 'th' else '/en/', t['home'], h1, E(lead))
    o += '<main>\n'
    for gk, gname in GROUPS[lang]:
        items = [a for a in arts if a['group'] == gk]
        if not items: continue
        o += '<section><h2>%s</h2><ul class="cards">%s</ul></section>\n' % (E(gname), ''.join(
            '<li><a href="%s"><b>%s</b><span>%s</span></a></li>' % (path(lang, a['slug']), E(a[lang]['h1']), E(a[lang]['card'])) for a in items))
    o += '<aside class="kr"><h2>%s</h2><p>%s</p><a class="btn" href="/app/?join=1&amp;src=blog_index">%s →</a><small>%s</small></aside>\n' % (
        ('กริ๊ง! คืออะไร' if lang == 'th' else 'What is Kring?'),
        ('แอปหาเพื่อนใหม่ในกรุงเทพฯ สำหรับคนไทยและนักท่องเที่ยว โพสต์ Reels สั้น ๆ จากที่จริงในเมือง ขึ้นบอร์ดประจำสัปดาห์ที่มีรางวัลจริง และถามตอบในห้อง "ถามคนไทย" แชตแปลไทย-อังกฤษให้อัตโนมัติ'
         if lang == 'th' else 'A Bangkok app for making new friends, for Thais and travellers. Post short Reels from real places, climb a weekly board with real prizes, and ask questions in "Ask a Thai". Chats translate between Thai and English automatically.'),
        t['open'], t['sub'])
    o += '</main>\n' + foot(lang)
    return o

GROUPS = {'th': [('friends', 'หาเพื่อนใหม่'), ('areas', 'ย่านน่าแฮงก์เอาต์'), ('do', 'ทำอะไรดีในกรุงเทพฯ'), ('live', 'ใช้ชีวิตในกรุงเทพฯ')],
          'en': [('friends', 'Making friends'), ('areas', 'Areas to hang out'), ('do', 'Things to do'), ('live', 'Living in Bangkok')]}

BANNED = [r'\bmeet', r'\bguides?\b', r'\bguidebooks?\b', r'\btours?\b', r'\bhosts?\b', r'\bhosting\b', r'\bcreators?\b', r'\breviews?\b', r'hidden gem',
          r'alcohol', r'\bgifts?\b', r'\bwallets?\b', r'\bcredits?\b', r'\blucky\b', r'\bdraws?\b', r'\bdrawn\b', r'temples?', r'\brates?\b',
          r'\bstars?\b', r'\bcoins?\b', r'\blaunch', r'dating', r'go together', r'\bbeer\b', r'\bwine\b', r'cocktail',
          'ลุ้น', 'โฮสต์', 'ไกด์', 'ทัวร์', 'ครีเอเตอร์', 'ของขวัญ', 'วอลเล็ท', 'กระเป๋าเงิน', 'เครดิต', 'เหรียญ', 'จับฉลาก', 'นำโชค',
          'รีวิว', 'แอลกอฮอล์', 'เหล้า', 'เบียร์', 'วัด', 'นัดเจอ', 'เดท', 'ไปด้วยกัน', 'อัญมณี', 'คราฟต์เบียร์']

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
            if not (700 <= w <= 1250): flag.append('words %d' % w)
            if flag: bad += 1
            print('%-28s %s  w=%4d  t=%2d d=%3d  %s' % (a['slug'], lang, w, tl, dl, ' | '.join(flag)))
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
    for slug in [None] + [a['slug'] for a in arts]:
        for lang in ('th', 'en'):
            sm.append('  <url>\n    <loc>%s%s</loc>\n    <lastmod>%s</lastmod>\n    <xhtml:link rel="alternate" hreflang="th" href="%s%s"/>\n    <xhtml:link rel="alternate" hreflang="en" href="%s%s"/>\n    <xhtml:link rel="alternate" hreflang="x-default" href="%s%s"/>\n  </url>' % (
                SITE, path(lang, slug), DATE, SITE, path('th', slug), SITE, path('en', slug), SITE, path('th', slug)))
    sm.append('</urlset>\n')
    open(os.path.join(R, 'sitemap-blog.xml'), 'w', encoding='utf-8').write('\n'.join(sm))
    print('built %d articles x 2 languages + 2 index pages' % len(arts))
    if '--check' in sys.argv: check(arts)

if __name__ == '__main__':
    main()
