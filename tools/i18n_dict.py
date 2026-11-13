# Translations the bilingual pages did not already carry (used by tools/site_i18n.py).
# T: single-language element text -> the other language (HTML allowed, keeps <br> and .gr accents)
# M: one text node holding both languages -> (thai, english)
# A: attribute value -> (thai, english)
# JS: exact source replacements inside page scripts
# META: per-page <title> / description in each language


def _nopair(soup, page):
    # a Thai headline + an English caption that is not its translation
    for s in ('.sto .tx', '.pc .row > span'):
        for el in soup.select(s):
            el['data-nopair'] = ''


def _soon_row(soup, page):
    # 'Answer travellers' questions' + Coming soon: one line per language, like the other rows
    for sm in soup.find_all('small'):
        if sm.get_text().strip() == 'Answer travellers’ questions':
            sm.decompose()


def _score_chips(soup, page):
    # English chips keep the multiplier the Thai chips show
    fix = {'Like': 'Like ×1', 'Save': 'Save ×2', 'Share': 'Share ×3', '10 views': '10 views = 1'}
    for sm in soup.select('.score small'):
        t = sm.get_text().strip()
        if t in fix:
            sm.string = fix[t]


PRE = [_nopair, _soon_row, _score_chips]

T = {
    # brand
    'กริ๊ง!': 'Kring',
    # home stories: Thai headline -> English headline
    'นกนับพันบินระดับตา': 'Thousands of gulls<br>at <span class="gr">eye level</span>',
    'ห้องกระจกโคมไฟบนชั้น 58': 'A lantern mirror room<br>on the <span class="gr">58th floor</span>',
    'ป่าบนหลังคามองบึงลุมพินี': 'A forest on the roof<br>over <span class="gr">Lumphini</span>',
    'พลุเหนือเจ้าพระยา': 'Fireworks <span class="gr">over</span><br><span class="gr">the Chao Phraya</span>',
    'บ้าน 200 ปีมีสระดำน้ำข้างใน': 'A 200-year-old house<br>with a <span class="gr">pool</span> inside',
    # home stories: English caption -> Thai caption
    'Gulls at eye level · Bang Pu · free · BTS Kheha': 'นกนางนวลบินระดับสายตา · บางปู · ฟรี · BTS&nbsp;เคหะฯ',
    'Lantern mirror room, 58F · BTS Phloen Chit': 'ห้องกระจกโคมไฟ ชั้น 58 · BTS&nbsp;เพลินจิต',
    'Roof forest · Dusit Arun · free · BTS Sala Daeng': 'ป่าบนหลังคา · ดุสิต อรุณ · ฟรี · BTS&nbsp;ศาลาแดง',
    'Fireworks on the river · free · until 13 Dec': 'พลุริมแม่น้ำ · ฟรี · ถึง 13 ธ.ค.',
    '200-year-old house, pool inside · Talat Noi': 'บ้านอายุ 200 ปี มีสระในบ้าน · ตลาดน้อย',
    'Bangkok ReflectionLantern mirror room, 58th floor': 'แบงคอก รีเฟลกชัน<small lang="th">ห้องกระจกโคมไฟ ชั้น 58</small>',
    # people cards
    'พลอย ✓': 'Ploy ✓',
    'Thai local': 'คนกรุงเทพฯ',
    'Marcus ✓Here now': '<b>มาร์คัส ✓</b><em>อยู่กรุงเทพฯ ตอนนี้</em>',
    'Ploy': 'พลอย', 'Mint': 'มิ้นท์', 'Aom': 'อ้อม', 'Marcus': 'มาร์คัส', 'Yui': 'ยุ้ย',
    'ตอบคำถามนักท่องเที่ยว': 'Answer travellers’ questions',
    # rules
    'Questions about the rules or a result: LINE @194hsqbc or ops@kringapp.com.':
        'สอบถามเรื่องกติกาหรือผลอันดับ ทัก LINE @194hsqbc หรืออีเมล ops@kringapp.com',
}

M = {
    '© 2026 Kring (กริ๊ง!) Bangkok': ('© 2026 กริ๊ง! (Kring) กรุงเทพฯ', '© 2026 Kring Bangkok'),
    '© 2026 Kring (กริ๊ง!) Bangkok ·': ('© 2026 กริ๊ง! (Kring) กรุงเทพฯ · ', '© 2026 Kring Bangkok · '),
}

A = {
    'Kring home': ('หน้าแรกกริ๊ง!', 'Kring home'),
    'Pages': ('เมนู', 'Pages'),
    'Previous story': ('เรื่องก่อนหน้า', 'Previous story'),
    'Next story': ('เรื่องถัดไป', 'Next story'),
    'Weekly or daily': ('รายสัปดาห์หรือรายวัน', 'Weekly or daily'),
    'Open in your browser': ('เปิดในเบราว์เซอร์', 'Open in your browser'),
    'Ploy': ('พลอย', 'Ploy'), 'Mint': ('มิ้นท์', 'Mint'), 'Aom': ('อ้อม', 'Aom'),
    'Marcus': ('มาร์คัส', 'Marcus'), 'Yui': ('ยุ้ย', 'Yui'),
}

JS = [
    ("""sub.innerHTML=S[i].dataset.st+'<small lang="en">'+S[i].dataset.se+'</small>'""",
     """sub.innerHTML='<span data-l="th">'+S[i].dataset.st+'</span><span data-l="en">'+S[i].dataset.se+'</span>'"""),
    ("""'<span class="gx">'+n+' คนจะไป <small lang="en">· '+n+' going</small></span>'""",
     """'<span class="gx"><span data-l="th">'+n+' คนจะไป</span><span data-l="en">'+n+' going</span></span>'"""),
    ("""'<span class="gx">ชวนเพื่อนใหม่ → <small lang="en">Invite new friends</small></span>'""",
     """'<span class="gx"><span data-l="th">ชวนเพื่อนใหม่ →</span><span data-l="en">Invite new friends →</span></span>'"""),
    ("""<span class="ar">'+esc(p.area||'')+'</span><h4>'""", """<span class="ar" data-ugc>'+esc(p.area||'')+'</span><h4 data-ugc>'"""),
]

META = {
    'index.html': {
        'th': {'t': 'กริ๊ง! · มาเที่ยวกรุงเทพฯ ได้เพื่อนใหม่',
               'd': 'กริ๊ง! ความลับกรุงเทพฯ ที่คนท้องถิ่นไปจริง มาเที่ยว ได้เพื่อนใหม่'},
        'en': {'t': 'Kring · Explore Bangkok, make new friends',
               'd': 'Kring: secret Bangkok, where locals really go. Explore Bangkok, make new friends.'}},
    'locals/index.html': {
        'th': {'t': 'โลคอลกริ๊ง! · ท็อป 5 ทุกวัน ทุกสัปดาห์',
               'd': 'โพสต์คลิปย่านที่ชอบ ติดท็อป 5 รายวันและรายสัปดาห์ รางวัลรวมสูงสุด ฿4,000 ทุกสัปดาห์'},
        'en': {'t': 'Kring Locals · Top 5 every day and every week',
               'd': 'Post clips of your Bangkok. Up to ฿4,000 in rewards every week for the Top 5.'}},
    'partners/index.html': {
        'th': {'t': 'ลงร้านฟรีกับกริ๊ง!',
               'd': 'คาเฟ่ กิจกรรม ที่พัก ลงฟรี ตั้งราคาสมาชิกเอง ลูกค้าจองตรง กริ๊ง! ไม่หักเงินจากการจอง'},
        'en': {'t': 'List your place free on Kring',
               'd': 'Cafés, experiences, stays: list free, set member prices, customers book direct.'}},
    'rules/index.html': {
        'th': {'t': 'กติกาท็อป 5 · กริ๊ง!',
               'd': 'กติกาท็อป 5 ของกริ๊ง! รางวัลรวมสูงสุด ฿4,000 ทุกสัปดาห์ จัดอันดับด้วยคะแนนที่เปิดเผย'},
        'en': {'t': 'Top 5 rules · Kring',
               'd': "Kring's Top 5 rules: up to ฿4,000 in rewards every week, ranked by a published score."}},
}
