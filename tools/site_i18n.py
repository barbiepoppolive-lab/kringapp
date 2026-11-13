#!/usr/bin/env python3
"""Kring website: turn the bilingual (Thai over English) pages into single-language pages.

Both languages stay in the HTML, each wrapped in data-l="th" / data-l="en"; CSS shows only the
one that matches <html lang>, which a tiny head script sets before first paint (saved choice in
localStorage kr8_lang -> phone language -> English). A TH | EN switcher sits in the header.

Run from the repo root on the bilingual pages (idempotent: already-converted pages are skipped):
    python3 tools/site_i18n.py            # convert index.html locals/ partners/ rules/
    python3 tools/site_i18n.py --dump     # list pairs and orphans, change nothing
Missing translations live in tools/i18n_dict.py (Thai-only and English-only lines).
"""
import sys, os, re, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bs4 import BeautifulSoup, NavigableString, Tag, Comment, Doctype
from i18n_lib import lang_of, node_text, norm, has_th, en_words, SKIP_TAGS
import i18n_dict as D

PAGES = ['index.html', 'locals/index.html', 'partners/index.html', 'rules/index.html']
SEP_RE = re.compile(r'^[\s·\-–—:,/|()]*$')
REPORT = {'skipped': [], 'pairs': [], 'orphans': [], 'mixtext': [], 'attrs': []}


def is_sep(n):
    if isinstance(n, Comment):
        return True
    if isinstance(n, NavigableString):
        return bool(SEP_RE.match(str(n)))
    return n.name == 'br'


def strip_en_marker(t):
    """the English half now replaces the Thai line: inherit its styling"""
    if not isinstance(t, Tag):
        return
    cls = [c for c in t.get('class', []) if c != 'en']
    if cls:
        t['class'] = cls
    elif 'class' in t.attrs:
        del t['class']
    if t.name == 'small':
        t.name = 'span'
    if t.get('lang') == 'en':
        del t['lang']


def lead_dot(t):
    for x in t.find_all(string=True) if isinstance(t, Tag) else []:
        if x.strip():
            if re.match(r'^\s*·\s*', x):
                x.replace_with(re.sub(r'^\s*·\s*', '', x))
            return


def wrap(soup, nodes, lang, block=False):
    nodes = [n for n in nodes]
    if len(nodes) == 1 and isinstance(nodes[0], Tag) and nodes[0].name not in ('br', 'b', 'i', 'em', 'strong'):
        t = nodes[0]
        if lang == 'en':
            strip_en_marker(t)
            lead_dot(t)
        t['data-l'] = lang
        return t
    w = soup.new_tag('span')
    w['data-l'] = lang
    nodes[0].insert_before(w)
    for n in nodes:
        w.append(n.extract())
    if lang == 'en':
        lead_dot(w)
        for c in w.children:
            if isinstance(c, Tag) and (c.get('lang') == 'en' or 'en' in c.get('class', []) or c.name == 'small'):
                strip_en_marker(c)
    return w


def no_pair(el):
    sel_ok = getattr(D, 'NO_PAIR', [])
    return any(el.select_one(s) is not None and el.select_one(s).parent is el for s in sel_ok) if False else False


def pair(soup, el, path=''):
    """recursively split mixed elements into data-l runs"""
    if el.name in SKIP_TAGS or el.get('data-l'):
        return
    kids = [c for c in el.children]
    for c in kids:
        if isinstance(c, Tag) and lang_of(c) == 'mix' and not c.get('data-l'):
            pair(soup, c)
    kids = [c for c in el.children]
    langs = [lang_of(c) for c in kids]
    if 'mix' in langs:
        for c, l in zip(kids, langs):
            if l == 'mix' and isinstance(c, NavigableString):
                REPORT['mixtext'].append(norm(str(c)))
        return
    if not ('th' in langs and 'en' in langs):
        return
    # do not pair a Thai headline with an English caption that is not its translation
    if el.get('data-nopair') is not None:
        return
    # build runs
    runs = []  # [lang, [nodes]]
    pend = []
    for c, l in zip(kids, langs):
        if l in ('th', 'en'):
            if runs and runs[-1][0] == l:
                runs[-1][1].extend(pend)
                runs[-1][1].append(c)
            else:
                if runs and runs[-1][0] == 'th' and l == 'en':
                    for p in pend:
                        if isinstance(p, Tag) and p.name not in ('br',):
                            pass  # keep icons
                        elif is_sep(p):
                            p.extract()
                    pend = [p for p in pend if p.parent is not None]
                runs.append([l, [c]])
            pend = []
        else:
            pend.append(c)
    # never pair composite blocks (a header with an already split nav, a section ...)
    if el.name in ('body', 'main', 'section', 'article', 'header', 'footer', 'nav', 'ul', 'ol', 'table', 'tbody', 'tr') or any(
            isinstance(n, Tag) and (n.find(attrs={'data-l': True}) is not None or n.name in ('section', 'header', 'footer', 'nav', 'main', 'div', 'ul', 'table'))
            for _, nodes in runs for n in nodes):
        REPORT['skipped'].append(norm(el.get_text())[:120])
        return
    for i, (l, nodes) in enumerate(runs):
        w = wrap(soup, nodes, l)
        if l == 'en' and i > 0 and runs[i - 1][0] == 'th':
            REPORT['pairs'].append((norm(prev.get_text()), norm(w.get_text())))
        prev = w


def orphan_unit(t):
    """highest ancestor that is single-language and not yet split"""
    lang = 'th' if has_th(str(t)) else 'en'
    u = t.parent
    while u.parent is not None and u.parent.name not in ('body', 'main', '[document]'):
        p = u.parent
        if p.get('data-l') or p.name in ('section', 'article', 'header', 'footer', 'nav', 'ul', 'ol', 'div', 'table', 'tbody', 'thead', 'tr'):
            break
        if lang_of(p) != lang or p.find(attrs={'data-l': True}) is not None or p.find(['img', 'svg']) is not None:
            break
        u = p
    return u, lang


def fix_orphans(soup, page):
    for t in list(soup.find_all(string=True)):
        if isinstance(t, (Comment, Doctype)) or t.parent is None or list(t.parents)[-1] is not soup:
            continue
        if any(a.name in SKIP_TAGS for a in t.parents):
            continue
        if any(isinstance(a, Tag) and a.get('data-l') for a in t.parents):
            continue
        if t.parent.get('data-ugc') is not None:
            continue
        l = lang_of(t)
        if l not in ('th', 'en', 'mix'):
            continue
        if has_th(str(t)) and en_words(str(t)) and norm(str(t)) not in D.T:
            r = split_attr(str(t))
            if r:
                a = BeautifulSoup(f'<span data-l="th">{r[0]}</span><span data-l="en">{r[1]}</span>', 'html.parser')
                for c in list(a.children):
                    t.insert_before(c.extract())
                t.extract()
                continue
            REPORT['mixtext'].append(norm(str(t)))
            continue
        u, lang = orphan_unit(t)
        if u.find(['svg', 'img']) is not None or u.find(attrs={'data-l': True}) is not None:
            s_ = soup.new_tag('span'); t.insert_before(s_); s_.append(t.extract()); u = s_
        key = norm(node_text(u))
        if u.name in SKIP_TAGS:
            continue
        tr = D.T.get(key)
        if tr is None:
            REPORT['orphans'].append((page, lang, u.name, '.'.join(u.get('class', [])), key))
            continue
        other = 'en' if lang == 'th' else 'th'
        inner = u.decode_contents()
        u.clear()
        a = BeautifulSoup(f'<span data-l="{lang}">{inner}</span><span data-l="{other}">{tr}</span>', 'html.parser')
        for c in list(a.children):
            u.append(c.extract())
        if u.get('lang') == 'en':
            del u['lang']


def split_mixed(soup):
    for t in list(soup.body.find_all(string=True)):
        if isinstance(t, (Comment, Doctype)) or any(a.name in SKIP_TAGS for a in t.parents):
            continue
        v = str(t)
        if not (has_th(v) and en_words(v)):
            continue
        k = norm(v)
        r = D.M.get(k) or D.M.get(k.rstrip(' ·')) or split_attr(v)
        if not r:
            REPORT['mixtext'].append(k)
            continue
        tail = ' · ' if k.endswith('·') and k not in D.M else ''
        lead = ' ' if v[:1].isspace() else ''
        trail = ' ' if v[-1:].isspace() else ''
        a = BeautifulSoup(f'{lead}<span data-l="th">{r[0]}</span><span data-l="en">{r[1]}</span>{tail or trail}', 'html.parser')
        for c in list(a.children):
            t.insert_before(c.extract())
        t.extract()


ATTRS = ['aria-label', 'alt', 'title', 'placeholder', 'data-st', 'data-se']


def split_attr(v):
    """'ไทย · English' -> (th, en)"""
    v = norm(v)
    if v in D.A:
        return D.A[v]
    parts = [p.strip() for p in re.split(r'\s·\s', v)]
    th = [p for p in parts if has_th(p)]
    en = [p for p in parts if not has_th(p) and en_words(p)]
    if th and en:
        return ' · '.join(th), ' · '.join(en)
    return None


def fix_attrs(soup, page):
    for el in soup.find_all(True):
        if el.name in ('meta', 'link', 'script', 'style'):
            continue
        for a in ('aria-label', 'alt', 'title', 'placeholder'):
            v = el.get(a)
            if not v or not (has_th(v) or en_words(v)):
                continue
            r = split_attr(v)
            if r is None:
                if has_th(v) and not en_words(v):
                    e = D.A.get(norm(v))
                    r = e if e else None
                elif not has_th(v):
                    e = D.A.get(norm(v))
                    r = e if e else None
            if r is None:
                REPORT['attrs'].append((page, el.name, a, v))
                continue
            el[f'data-{a}-th'] = r[0]
            el[f'data-{a}-en'] = r[1]
            el[a] = r[0]


HEAD_JS = r'''<script>/* Kring language: saved choice > ?lang= > phone language (th* = Thai) > English. Same key as the app. */(function(){var d=document.documentElement,l;try{var q=(new URLSearchParams(location.search).get('lang')||'').toLowerCase();if(q==='th'||q==='en'){l=q;localStorage.setItem('kr8_lang',q)}else{l=localStorage.getItem('kr8_lang')}}catch(e){}if(l!=='th'&&l!=='en'){var n=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'']);l='en';for(var i=0;i<n.length;i++){var x=String(n[i]||'').toLowerCase();if(x.indexOf('th')===0){l='th';break}if(x){break}}}d.lang=l;d.setAttribute('data-lang',l);var M=__META__;window.__krM=M;if(M[l])document.title=M[l].t})();</script>'''

CSS = '''<style id="i18n">
html[lang="en"] [data-l="th"],html[lang="th"] [data-l="en"]{display:none!important}
html[lang="en"]{--th:"Bricolage Grotesque",system-ui,-apple-system,"Segoe UI",sans-serif;--tb:"Bricolage Grotesque",system-ui,-apple-system,"Segoe UI",sans-serif}
.lsw{display:inline-flex;align-items:center;gap:1px;margin-left:6px;padding:2px;border-radius:999px;background:rgba(11,10,18,.42);border:1px solid rgba(255,255,255,.22);font:600 12px/1 "Bricolage Grotesque",system-ui,sans-serif;letter-spacing:.04em;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);flex:none}
.lsw button{min-width:32px;min-height:30px;padding:0 6px;border-radius:999px;color:rgba(255,255,255,.72)}
.lsw button[aria-pressed="true"]{background:#fff;color:#0b0a12}
.lsw button:focus-visible{outline:2px solid #FF4FA3;outline-offset:1px}
</style>'''

SWITCH = '<div class="lsw notranslate" translate="no" role="group" aria-label="ภาษา" data-aria-label-th="ภาษา" data-aria-label-en="Language"><button type="button" data-setlang="th" lang="th" aria-label="ภาษาไทย" data-aria-label-th="ภาษาไทย" data-aria-label-en="Thai">TH</button><button type="button" data-setlang="en" lang="en" aria-label="อังกฤษ" data-aria-label-th="อังกฤษ" data-aria-label-en="English">EN</button></div>'

TAIL_JS = r'''<script>/* Kring language switcher */(function(){var d=document.documentElement;function ap(l){d.lang=l;d.setAttribute('data-lang',l);var M=window.__krM||{};if(M[l]){document.title=M[l].t;var m=document.querySelector('meta[name="description"]');if(m)m.content=M[l].d;['og:title','og:description'].forEach(function(p,i){var o=document.querySelector('meta[property="'+p+'"]');if(o)o.content=i?M[l].d:M[l].t});var g=document.querySelector('meta[property="og:locale"]');if(g)g.content=l==='th'?'th_TH':'en_US'}
['aria-label','alt','title','placeholder'].forEach(function(a){document.querySelectorAll('[data-'+a+'-'+l+']').forEach(function(e){e.setAttribute(a,e.getAttribute('data-'+a+'-'+l))})});
document.querySelectorAll('[data-setlang]').forEach(function(b){b.setAttribute('aria-pressed',b.getAttribute('data-setlang')===l?'true':'false')});
try{window.dispatchEvent(new CustomEvent('kr:lang',{detail:l}))}catch(e){}}
window.__krLang=function(){return d.lang==='th'?'th':'en'};
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-setlang]');if(!b)return;e.preventDefault();e.stopPropagation();var l=b.getAttribute('data-setlang');try{localStorage.setItem('kr8_lang',l)}catch(x){}ap(l)},true);
ap(d.lang==='th'?'th':'en')})();</script>'''


def head_meta(soup, page):
    t = soup.title.string if soup.title else ''
    md = soup.find('meta', attrs={'name': 'description'})
    m = D.META[page]
    js = HEAD_JS.replace('__META__', json.dumps(m, ensure_ascii=False))
    soup.title.string = m['th']['t']
    if md:
        md['content'] = m['th']['d']
    # og tags
    for p, k in (('og:title', 't'), ('og:description', 'd')):
        o = soup.find('meta', attrs={'property': p})
        if not o:
            o = soup.new_tag('meta')
            o['property'] = p
            soup.find('meta', attrs={'property': 'og:image'}).insert_before(o) if soup.find('meta', attrs={'property': 'og:image'}) else soup.head.append(o)
        o['content'] = m['th'][k]
    if not soup.find('meta', attrs={'property': 'og:locale'}):
        o = soup.new_tag('meta'); o['property'] = 'og:locale'; o['content'] = 'th_TH'
        soup.find('meta', attrs={'property': 'og:title'}).insert_before(o)
    cs = soup.find('meta', attrs={'charset': True})
    cs.insert_after(BeautifulSoup(js + CSS, 'html.parser'))


def add_switch(soup, page):
    hdr = soup.find('header')
    nav = hdr.find('nav') if hdr else None
    sw = BeautifulSoup(SWITCH, 'html.parser')
    if nav:
        nav.insert_after(sw)
    else:
        hdr.append(sw)
    soup.body.append(BeautifulSoup(TAIL_JS, 'html.parser'))


def js_strings(html):
    for a, b in D.JS:
        html = html.replace(a, b)
    return html


def convert(page, dump=False):
    src = open(page, encoding='utf-8').read()
    if 'id="i18n"' in src:
        print('skip (already converted)', page)
        return
    src = js_strings(src)
    soup = BeautifulSoup(src, 'html.parser')
    for pre in getattr(D, 'PRE', []):
        pre(soup, page)
    for el in soup.select('[data-ugc]'):
        pass
    split_mixed(soup)
    pair(soup, soup.body)
    fix_orphans(soup, page)
    fix_attrs(soup, page)
    if not dump:
        head_meta(soup, page)
        add_switch(soup, page)
        out = str(soup)
        out = out.replace('<html lang="th"', '<html lang="th"', 1)
        open(page, 'w', encoding='utf-8').write(out)
        print('converted', page)


if __name__ == '__main__':
    dump = '--dump' in sys.argv
    pages = [a for a in sys.argv[1:] if not a.startswith('--')] or PAGES
    for p in pages:
        convert(p, dump)
    if dump or REPORT['orphans'] or REPORT['mixtext'] or REPORT['attrs']:
        if dump:
            print('PAIRS', len(REPORT['pairs']))
            for a, b in REPORT['pairs']:
                print('  P', a[:70], '||', b[:70])
        print('SKIPPED', len(REPORT['skipped']))
        for o in REPORT['skipped']:
            print('  S', o)
        print('ORPHANS', len(REPORT['orphans']))
        for o in REPORT['orphans']:
            print('  O', o)
        print('MIXTEXT', len(REPORT['mixtext']))
        for o in REPORT['mixtext']:
            print('  M', o)
        print('ATTRS', len(REPORT['attrs']))
        for o in REPORT['attrs']:
            print('  A', o)
