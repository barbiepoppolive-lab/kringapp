# Shared helpers for the website single-language build (tools/site_i18n.py).
import re
from bs4 import NavigableString, Tag, Comment, Doctype

TH_RE = re.compile('[\u0E01-\u0E3A\u0E40-\u0E5B]')  # Thai letters, not the baht sign
# Latin words that are allowed in Thai mode (brands, transit codes, units)
BRANDS = {'kring', 'line', 'google', 'kringapp', 'com', 'truemoney', 'starbucks', 'grab',
          'bts', 'mrt', 'arl', 'ig', 'instagram', 'tiktok', 'facebook', 'apple', 'android',
          'ios', 'qr', 'pdpa', 'gps', 'km', 'pm', 'am', 'th', 'en', 'liff', 'id', 'promptpay',
          'youtube', 'tremendous', 'chrome', 'safari', 'reel', 'reels', 'wi', 'fi', 'ok', 'www', 'https', 'f', 'x', 'vat', 'kringlocal', 'otp'}
SKIP_TAGS = {'script', 'style', 'svg', 'noscript', 'template', 'head'}


def has_th(t):
    return bool(TH_RE.search(t))


def en_words(t):
    t = re.sub(r'\S+@\S+|@\S+|\S+\.(com|bkk)\b', ' ', t)
    return [w for w in re.findall(r'[A-Za-z]{2,}', t) if w.lower() not in BRANDS]


def lang_of_text(t):
    if has_th(t):
        return 'th'
    if en_words(t):
        return 'en'
    return 'n'


def node_text(n):
    if isinstance(n, (Comment, Doctype)):
        return ''
    if isinstance(n, NavigableString):
        return str(n)
    if n.name in SKIP_TAGS or n.get('data-l') or n.get('data-ugc') is not None:
        return ''
    return ''.join(node_text(c) for c in n.children)


def lang_of(n):
    """'th', 'en', 'n' (neutral), or 'mix'"""
    if isinstance(n, Tag) and n.get('data-l'):
        return 'done'
    t = node_text(n)
    if isinstance(n, Tag) and not t.strip() and n.find(attrs={'data-l': True}):
        return 'done'
    th, en = has_th(t), bool(en_words(t))
    if isinstance(n, Tag) and th and en:
        # mixed only if some descendant is pure en / pure th separately
        return 'mix'
    return 'th' if th else ('en' if en else 'n')


def norm(t):
    return re.sub(r'\s+', ' ', t.replace('\xa0', ' ')).strip()
