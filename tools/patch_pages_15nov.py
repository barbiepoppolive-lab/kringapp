#!/usr/bin/env python3
"""15 Nov 2026 site revamp: bring locals / rules / about in line with the locked rules and wording. Idempotent-ish one-off."""
import re, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rd(p): return open(os.path.join(R, p), encoding='utf-8').read()
def wr(p, s): open(os.path.join(R, p), 'w', encoding='utf-8').write(s)
def sub1(s, a, b, n=1):
    assert a in s, 'missing: ' + a[:60]
    return s.replace(a, b) if n == 0 else s.replace(a, b, n)
bi = lambda th, en: '<span data-l="th">%s</span><span data-l="en">%s</span>' % (th, en)

# ---------- locals ----------
h = rd('locals/index.html')
h = sub1(h, 'โลคอลกริ๊ง! · ท็อป 5 ทุกวัน ทุกสัปดาห์', 'โลคอลกริ๊ง! · อันดับประจำสัปดาห์', 0)
h = sub1(h, 'โพสต์คลิปย่านที่ชอบ ติดท็อป 5 รายวันและรายสัปดาห์ รางวัลรวมสูงสุด ฿4,000 ทุกสัปดาห์', 'โพสต์ Reel ของกรุงเทพฯ ที่คุณชอบ แท็กสถานที่ 8 อันดับแรกของสัปดาห์รับรางวัล', 0)
h = sub1(h, 'Kring Locals · Top 5 every day and every week', 'Kring Locals · The weekly ranking', 0)
h = sub1(h, 'Post clips of your Bangkok. Up to ฿4,000 in rewards every week for the Top 5.', "Post Reels of your Bangkok, tagged at real places. The week's top 8 take a prize.", 0)
h = sub1(h, '<span class="k"><span data-l="th">รางวัลรวมสูงสุด</span><span data-l="en">Up to</span></span><span class="amt">฿4,000</span><span class="w"><span data-l="th">ทุกสัปดาห์</span><span data-l="en">in rewards every week</span></span>',
         '<span class="k">' + bi('อันดับ 1 ของสัปดาห์', "The week's #1") + '</span><span class="amt">฿1,500</span><span class="w">' + bi('8 อันดับแรกรับรางวัล', 'top 8 take a prize') + '</span>')
h = sub1(h, 'ติด<span class="gr">ท็อป 5</span></span><span data-l="en">Show your Bangkok. Make the daily and weekly Top\xa05. ', 'ติด<span class="gr">อันดับประจำสัปดาห์</span></span><span data-l="en">Show your Bangkok. Make the weekly ranking. ')
h = sub1(h, '<span data-l="th">ท็อป 5 ได้รางวัล<br/><span class="gr">ทุกวัน ทุกสัปดาห์</span></span><span data-l="en">Top 5 rewards, every day and every week.</span>',
         '<span data-l="th">8 อันดับแรก<br/><span class="gr">รับรางวัลทุกสัปดาห์</span></span><span data-l="en">The week\'s top 8 take a prize.</span>')
i = h.index('<div class="rw rvl d2" id="rwBoard">'); j = h.index('<p class="rw-how', i); k = h.index('</p>', j) + 4
pod = lambda cls, key, th, en, amt, n: '<div class="rw-pd %s"><img alt="%s" data-alt-en="%s" data-alt-th="%s" loading="lazy" src="/assets/site/a_%s.webp"/><span class="nm"><span data-l="en">%s</span><span data-l="th">%s</span></span><span class="am">%s</span><span class="bk">%d</span></div>' % (cls, th, en, th, key, en, th, amt, n)
row = lambda n, key, th, en, amt: '<div class="rw-r"><span class="k">%d</span><img alt="" loading="lazy" src="/assets/site/a_%s.webp"/><span class="nm"><span data-l="en">%s</span><span data-l="th">%s</span></span><span class="am">%s</span></div>' % (n, key, en, th, amt)
nb = '<span style="font-weight:500;font-size:12px;opacity:.75">' + bi('ติดบอร์ด', 'On the board') + '</span>'
board = ('<div class="rw rvl d2" id="rwBoard"><div class="rw-h"><span class="ex">' + bi('ตัวอย่าง', 'Example, not real results') + '</span></div><div data-rw="w"><div class="rw-pod">'
  + pod('p2', 'ploy', 'พลอย', 'Ploy', '฿900', 2) + pod('p1', 'mint', 'มิ้นท์', 'Mint', '฿1,500', 1) + pod('p3', 'aom', 'อ้อม', 'Aom', '฿600', 3) + '</div><div class="rw-li">'
  + row(4, 'marcus', 'มาร์คัส', 'Marcus', '฿500') + row(5, 'yui', 'ยุ้ย', 'Yui', '฿400') + row(6, 'ton', 'ต้น', 'Ton', '฿250') + row(7, 'nat', 'ณัฐ', 'Nat', '฿150') + row(8, 'lena', 'ลีน่า', 'Lena', '฿100')
  + row(9, 'minjun', 'มินจุน', 'Minjun', nb) + row(10, 'arjun', 'อรชุน', 'Arjun', nb)
  + '</div><div class="rw-tot"><span>' + bi('8 อันดับแรก รวมต่อสัปดาห์ · ปิดอาทิตย์ 23:59', 'Top 8 share, each week · closes Sunday 23:59') + '</span><b>฿4,400</b></div></div>'
  + '<div class="rw-vo"><svg aria-hidden="true" viewbox="0 0 24 24"><path d="M3.5 8.5A1.5 1.5 0 015 7h14a1.5 1.5 0 011.5 1.5v2a2 2 0 000 3v2A1.5 1.5 0 0119 17H5a1.5 1.5 0 01-1.5-1.5v-2a2 2 0 000-3z"></path><path d="M14.5 7v10" stroke-dasharray="1.6 2"></path></svg><span>'
  + bi('Founding Local: 50 คนแรกที่ Reel แรกผ่านการอนุมัติ รับ ฿100', 'Founding Local: the first 50 with an approved first Reel get ฿100') + '</span></div></div>'
  + '<p class="rw-how rvl d3"><svg aria-hidden="true" viewbox="0 0 24 24"><path d="M4 17l5-5 4 3 7-8"></path><path d="M15 7h5v5"></path></svg><span>'
  + '<span data-l="th">Rings นับแบบเปิดเผย: ไลก์ +1 · เซฟ +3 · เปิดลิงก์ที่แชร์ไป Instagram/TikTok +5 · ไลก์หรือเซฟจากนักท่องเที่ยวนับ ×2 · นับเฉพาะ Reel ที่ดีที่สุด 1 Reel ของสัปดาห์</span>'
  + '<span data-l="en">Rings are counted in the open: like +1, save +3, Instagram/TikTok share-open +5. A traveller\'s like or save counts double. Only your best Reel of the week counts. <a data-page="" href="/rules/">Rules ›</a></span></span></p>')
h = h[:i] + board + h[k:]
wr('locals/index.html', h)

# ---------- rules ----------
h = rd('rules/index.html')
h = sub1(h, 'กติกาท็อป 5 · กริ๊ง!', 'กติกาอันดับประจำสัปดาห์ · กริ๊ง!', 0)
i = h.index('<h1>'); j = h.index('<section class="r"><span class="n">7</span>')
P = lambda th, en: '<p data-l="th">%s</p><p data-l="en">%s</p>' % (th, en)
S = lambda n, th, en, body: '<section class="r"><span class="n">%d</span><div><h2>%s</h2>%s</div></section>\n' % (n, bi(th, en), body)
rows = ''.join('<tr><td>#%s</td><td>%s</td></tr>' % r for r in [(1, '฿1,500'), (2, '฿900'), (3, '฿600'), (4, '฿500'), (5, '฿400'), (6, '฿250'), (7, '฿150'), (8, '฿100')])
rows += '<tr><td>#9–10</td><td>' + bi('ติดบอร์ด ไม่มีรางวัล', 'On the board, no prize') + '</td></tr>'
new = ('<h1>' + bi('อันดับประจำสัปดาห์', 'The weekly ranking') + '</h1>\n'
 '<div class="prz"><span class="k">' + bi('8 อันดับแรก รวม', 'Top 8 share') + '</span><span class="amt">฿4,400</span><span class="w">' + bi('ทุกสัปดาห์', 'every week') + '</span></div>\n'
 '<p class="merit">' + bi('จัดอันดับจาก Rings เท่านั้น ทุกคนเห็นการนับ', 'Ranked on Rings only. Everyone can see the math.') + '</p>\n</section><main>\n'
 + S(1, 'ใครร่วมได้', 'Who can join', P('ทุกคนอายุ 18 ปีขึ้นไปที่มีบัญชีกริ๊ง! ร่วมฟรี ไม่ต้องซื้อหรือจ่ายอะไร หนึ่งคนหนึ่งบัญชี', 'Anyone aged 18 or over with a Kring account. Free to join. Nothing to buy or pay. One account per person.'))
 + S(2, 'อันดับประจำสัปดาห์', 'The weekly ranking', P('โพสต์ Reel แนวตั้งของคุณเองจากสถานที่จริงในกรุงเทพฯ และแท็กสถานที่ Reel ที่ผ่านการอนุมัติจะเข้าบอร์ด บอร์ดเริ่มวันจันทร์ 00:00 และปิดวันอาทิตย์ 23:59 ตามเวลากรุงเทพฯ คะแนนประจำสัปดาห์ของคุณนับจาก Reel ที่ได้ Rings สูงสุด 1 Reelในสัปดาห์นั้น บอร์ดแสดง 10 อันดับแรกเสมอ',
     'Post your own vertical Reel of a real Bangkok place and tag the place. Approved Reels join the board. The board runs from Monday 00:00 to Sunday 23:59, Bangkok time. Your weekly score is your best Reel of that week. The board always shows a top 10.'))
 + S(3, 'Rings คิดอย่างไร', 'How Rings work', P('ไลก์ +1 เซฟ +3 และทุกครั้งที่มีคนเปิดลิงก์ Reel ของคุณที่แชร์ไป Instagram หรือ TikTok +5 (นับสูงสุด 30 ครั้งต่อวัน การเปิดจาก LINE ไม่นับ) ไลก์หรือเซฟจากนักท่องเที่ยวนับสองเท่า หนึ่งคนนับได้ครั้งเดียวต่อหนึ่ง Reel การกดให้ Reel ของตัวเองไม่นับ แตะที่คะแนนของใครก็ได้เพื่อดูที่มา ถ้าคะแนนเท่ากัน Reel ที่โพสต์ก่อนได้อันดับสูงกว่า',
     "A like is +1. A save is +3. Each open of your Reel's link shared to Instagram or TikTok is +5 (up to 30 a day are counted; opens from LINE are not counted). A traveller's like or save counts double. One person counts once per Reel. Your own likes and saves never count. Tap anyone's score to see the breakdown. If two tie, the Reel posted first ranks higher.")
     + '<p class="sumx">' + bi('Rings = ไลก์ + 3×เซฟ + 5×เปิดลิงก์ที่แชร์', 'Rings = likes + 3×saves + 5×share-opens') + '</p>'
     + '<div class="score"><span>' + bi('ไลก์ +1', 'Like +1') + '</span><span>' + bi('เซฟ +3', 'Save +3') + '</span><span>' + bi('เปิดลิงก์ที่แชร์ +5', 'Share-open +5') + '</span><span>' + bi('นักท่องเที่ยว ×2', 'Traveller ×2') + '</span></div>')
 + S(4, 'รางวัล', 'Prizes', '<table class="tbl"><thead><tr><th>' + bi('อันดับ', 'Rank') + '</th><th>' + bi('รายสัปดาห์', 'Weekly') + '</th></tr></thead><tbody>' + rows + '</tbody><tfoot><tr><td>' + bi('รวม', 'Total') + '</td><td>฿4,400<small>' + bi('ต่อสัปดาห์', 'a week') + '</small></td></tr></tfoot></table>'
     + P('Founding Local: สมาชิก 50 คนแรกที่ Reel แรกผ่านการอนุมัติ รับ ฿100 จัดอันดับจาก Rings เท่านั้น วันที่เริ่มให้รางวัลแสดงในแอป', 'Founding Local: the first 50 members with an approved first Reel get ฿100. Ranked on Rings only. The date prizes start is shown in the app.'))
 + S(5, 'ประกาศผล', 'Results', P('ผลประจำสัปดาห์ประกาศในแอปหลังวันอาทิตย์ 23:59 ผู้ได้รางวัลจะได้รับแจ้งในแอป', 'Weekly results show in the app after Sunday 23:59. Winners are told in the app.'))
 + S(6, 'รับรางวัลอย่างไร', 'How winners get paid', P('กดรับในแอปได้ในแตะเดียว รับเป็นโค้ดบัตรกำนัลบนมือถือ Reel ที่ได้รางวัลต้องเปิดเป็นสาธารณะบนกริ๊ง! 14 วัน กริ๊ง!จะไม่ขอให้คุณจ่ายเงิน โอนเงิน หรือบอกรหัสผ่าน OTP หรือเลขบัตรเด็ดขาด',
     'Claim in the app in one tap and get a voucher code on your phone. A winning Reel must stay public on Kring for 14 days. Kring will never ask you to pay, transfer money, or share a password, OTP or card number.')))
h = h[:i] + new + h[j:]
h = h.replace('ก๊อปคลิปคนอื่น', 'ก๊อป Reel คนอื่น')
wr('rules/index.html', h)

# ---------- about ----------
h = rd('about.html')
h = sub1(h, 'Kring (กริ๊ง!) is a Bangkok app for plans and outings with other people, always in public places.', 'Kring (กริ๊ง!) is Bangkok\'s people app: make your card, post Reels tagged at real places and make new friends. Always in public places.')
a = re.search(r"See what's happening across Bangkok right now, ask people who live here, and find someone to go with[^<]*", h); assert a
h = h.replace(a.group(0), "Make your neon Kring card, post short Reels tagged at real Bangkok places, and make new friends who love the same places. Thai or English, always in public places.")
a = re.search(r'ดูว่าตอนนี้ที่ไหนในกรุงเทพฯ มีอะไรน่าไป ถามคนที่อยู่ที่นี่ และหาคนไปด้วยกัน[^<]*', h); assert a
h = h.replace(a.group(0), 'ทำการ์ดนีออนของคุณ โพสต์ Reels สั้น ๆ ที่แท็กสถานที่จริงในกรุงเทพฯ แล้วได้เพื่อนใหม่ที่ชอบที่เดียวกัน พิมพ์ไทยหรืออังกฤษก็ได้ ในที่สาธารณะเสมอ')
h = sub1(h, 'Kring is not a dating app and not a booking or payment service. Nobody is paid to meet anyone. Plans happen in public places only.', 'Kring is for making new friends. It is not a booking or payment service, and nobody is paid to spend time with anyone. Plans happen in groups, in public places only.')
a = re.search(r'กริ๊ง! ไม่ใช่แอปหาคู่ และไม่ใช่บริการจองหรือรับชำระเงิน ไม่มีใครได้รับเงินเพื่อมาเจอใคร และนัดกันในที่สาธารณะเท่านั้น', h); assert a
h = h.replace(a.group(0), 'กริ๊ง! คือแอปสำหรับหาเพื่อนใหม่ ไม่ใช่บริการจองหรือรับชำระเงิน ไม่มีใครได้รับเงินเพื่อใช้เวลากับใคร และทุกแพลนเป็นกลุ่ม ในที่สาธารณะเท่านั้น')
wr('about.html', h)
print('ok')
