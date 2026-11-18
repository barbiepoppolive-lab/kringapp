# Batch 6: free Bangkok with friends (18 Nov 2026)
# Inspired by @traveltheworldwithlaurie's "Bangkok for ฿0" carousel (4 Nov 2026); own text, order, grouping and checks.
S_LV_TO = ('Time Out Bangkok – LV The Place: free exhibition, pre-book, daily 10:00–20:00, BTS Chit Lom', 'https://www.timeout.com/bangkok/shopping/lv-the-place')
S_LV_26 = ('Marketing Oops – LV The Place Bangkok 2026 refresh, Thai artists room (3 Nov 2026)', 'https://www.marketingoops.com/?p=374938')
S_BACC = ('BACC – Plan your visit (Tue–Sun 10:00–20:00, closed Mondays)', 'https://www.bacc.or.th/en/plan-your-visit')
S_BFLY_TO = ('Time Out Bangkok – Bangkok Butterfly Garden and Insectarium (08:30–16:30, closed Monday)', 'https://www.timeout.com/bangkok/attractions/bangkok-butterfly-garden-and-insectarium')
S_BFLY_BV = ('Bangkok for Visitors – Butterfly Garden (free admission)', 'https://bangkokforvisitors.com/districts/chatuchak/butterfly-garden/')
S_BKKN = ('Tourist Bangkok – Bangkokian Museum (Wed–Sun 10:00–16:00, free; updated Jun 2026)', 'https://touristbangkok.com/bangkokian-museum')
S_BKKN_BV = ('Bangkok for Visitors – Bangkokian Museum, Charoen Krung Soi 43', 'https://bangkokforvisitors.com/districts/riverside/bangkokian-museum/')
S_ATT = ('Time Out Bangkok – ATT 19 (Mon–Sat 11:00–19:00)', 'https://www.timeout.com/bangkok/art/att-19')
S_RC = ('River City Bangkok – Plan your visit (daily 10:00–20:00)', 'https://rivercitybangkok.com/plan-your-visit/')
S_RC_TC = ('Théo Courant – River City Bangkok: most galleries free', 'https://theo-courant.com/en/river-city-bangkok-contemporary-art-antiques/')
S_SKY = ('Thai Holiday – Chao Phraya Sky Park (free, daily 05:00–20:00, MRT Sanam Chai; updated 2026)', 'https://www.thaiholidayguide.com/attraction/chao-phraya-sky-park/')
S_SKY_PBS = ('Thai PBS – Chao Phraya Sky Park opens, how to get there (25 Jun 2020)', 'https://www.thaipbs.or.th/news/content/293992')
S_BENJA = ('Time Out Bangkok – Benjakitti Park (no entrance fee, nearest MRT)', 'https://www.timeout.com/bangkok/attractions/benjakitti-park-benchakitti-forest-park')
S_LUM = ('Phuket 101 – Lumpini Park: water monitors, hours and stations', 'https://phuket101.net/lumpini-park')
S_LUM_TO = ('Time Out Bangkok (Thai) – Lumphini Park opening hours', 'https://www.timeout.com/bangkok/th/attractions/%E0%B8%AA%E0%B8%A7%E0%B8%99%E0%B8%A5%E0%B8%B8%E0%B8%A1%E0%B8%9E%E0%B8%B4%E0%B8%99%E0%B8%B5')
S_PKT = ('SEAsia – Pak Khlong Talat flower market, open 24 hours (30 Jul 2026)', 'https://seasia.co/2026/07/30/discovering-pak-khlong-talat-the-famous-flower-market-in-bangkok')
S_ONG = ('Thairath English – Khlong Ong Ang, MRT Sam Yot Exit 1 (22 Jul 2026)', 'https://en.thairath.co.th/lifestyle/travel/2947971')
S_JJ = ('Chatuchak Market – opening times', 'https://chatuchakmarket.org/?p=1210')
S_TN = ('Visit Thailand Today – Talat Noi: no entrance fee, MRT Hua Lamphong', 'https://www.visitthailandtoday.com/guides/talat-noi-guide')
S_ARUN = ('Lonely Planet – Wat Arun (lights around 7pm, views from across the river)', 'https://www.lonelyplanet.com/points-of-interest/wat-arun/407510')
S_TIEN = ('Visit Thailand Today – Tha Tien Pier (MRT Sanam Chai nearby)', 'https://www.visitthailandtoday.com/transportation/bangkok/tha-tien-pier')
S_SONGWAT = ('Time Out Bangkok – Song Wat Road named the world\'s coolest street in 2026 (17 Nov 2026)', 'https://www.timeout.com/bangkok/news/song-wat-coolest-street-world-111726')

IG = 'https://www.instagram.com/p/DfUt7guDCdN/'
SRC = [S_LV_TO, S_LV_26, S_BACC, S_BFLY_TO, S_BFLY_BV, S_BKKN, S_BKKN_BV, S_ATT, S_RC, S_RC_TC, S_SKY, S_SKY_PBS, S_BENJA, S_LUM, S_LUM_TO,
       S_PKT, S_ONG, S_JJ, S_TN, S_ARUN, S_TIEN, S_SONGWAT]

ARTS = [
# ---------------------------------------------------------------- 22
dict(slug='free-bangkok-with-friends', group='do', date='2026-11-18', recheck='monthly',
 hero='type', og='/assets/blog/og-free-bangkok.jpg',
 css='.tg b{font-family:Unbounded,"Noto Sans Thai",sans-serif}',
 typo={'th': ('฿0', '15 ที่ฟรีในกรุงเทพฯ · ไปกับเพื่อนสนุกกว่า'), 'en': ('฿0', '15 free spots · better with friends')},
 areas=['siam', 'talat-noi', 'yaowarat'],
 related=['free-things-bangkok', 'song-wat-coolest-street-2026', 'chatuchak-weekend'],
 sources=SRC,
 next=('ลง Reel ที่ฟรีของคุณบนกริ๊ง!', 'Post your free spot on Kring'),
 th=dict(
  title='กรุงเทพฯ งบ ฿0: 15 ที่ฟรี ไปกับเพื่อนแล้วสนุกกว่า',
  desc='15 ที่เที่ยวฟรีในกรุงเทพฯ ตรวจ พ.ย. 2026 ทั้ง LV The Place สวนเบญจกิติ ตัวเงินตัวทองสวนลุมฯ ตลาดน้อย วัดอรุณฯ ยามค่ำ พร้อมเวลาเปิด วันปิด และสถานีใกล้สุด',
  h1='กรุงเทพฯ งบ ฿0: 15 ที่ฟรี ไปกับเพื่อนแล้วสนุกกว่า',
  lead='กรุงเทพฯ มีที่ดี ๆ ที่ไม่ต้องจ่ายค่าเข้าเยอะมาก แต่ไปคนเดียวบางทีก็แค่ฆ่าเวลา ชวนเพื่อนสักสองคนแล้วมันกลายเป็นวันที่มีเรื่องเล่า นี่คือ 15 ที่ที่เราตรวจข้อมูลใหม่ทุกที่ พร้อมไอเดียว่าไปกับเพื่อนแล้วทำอะไรดี',
  card='15 ที่ไม่เสียค่าเข้า ตรวจเวลาเปิด วันปิด และสถานีใกล้สุดแล้ว พร้อมแผนเที่ยวฟรีสองวันกับเพื่อน',
  body='''
## ที่ฟรีไม่ได้ขาด ที่ขาดคือคนไปด้วย
ไปคนเดียวเดินสิบนาทีก็กลับ ไปกับเพื่อนกลายเป็นทั้งบ่าย ทุกที่ในลิสต์นี้เลยมีไอเดียเล็ก ๆ ว่าไปเป็นกลุ่มแล้วสนุกขึ้นยังไง จะเพื่อนเก่าหรือเพื่อนใหม่ที่เพิ่งคุยกันก็ได้

ลิสต์นี้เริ่มจากโพสต์สไลด์ "Bangkok for ฿0" ของ [@traveltheworldwithlaurie](''' + IG + ''') เราตรวจทุกที่ใหม่เอง จัดกลุ่มใหม่ และเพิ่มของเราอีกสามที่ ข้อมูลตรวจเมื่อ 18 พ.ย. 2026 เช็กเวลาเปิดก่อนไปทุกครั้ง

## เช็กวันก่อน: กับดักวันจันทร์
| ที่ (เข้าฟรี) | เปิด | สถานี / ท่าเรือ |
|---|---|---|
| LV The Place Bangkok (จองรอบก่อน) | ทุกวัน 10:00–20:00 | BTS ชิดลม |
| หอศิลป์ BACC | อ.–อา. 10:00–20:00 | BTS สนามกีฬาแห่งชาติ |
| อุทยานผีเสื้อฯ | อ.–อา. 08:30–16:30 | MRT สวนจตุจักร |
| พิพิธภัณฑ์ชาวบางกอก | พ.–อา. 10:00–16:00 | ท่าเรือสี่พระยา |
| ATT 19 | จ.–ส. 11:00–19:00 | เจริญกรุง 30 |
| ริเวอร์ซิตี้ บางกอก | ทุกวัน 10:00–20:00 | ท่าเรือสี่พระยา |
| สวนลอยฟ้าเจ้าพระยา | ทุกวัน 05:00–20:00 | MRT สนามไชย |
| สวนป่าเบญจกิติ | ทุกวัน ถึง 21:00 | MRT ศูนย์ฯ สิริกิติ์ |
| สวนลุมพินี | ทุกวัน ตั้งแต่ 04:30 | MRT ลุมพินี |
| ตลาดนัดจตุจักร | ส.–อา. 09:00–18:00 | MRT กำแพงเพชร |
| ปากคลองตลาด | 24 ชั่วโมง | MRT สนามไชย |
| ตลาดน้อย | ทุกวัน | MRT หัวลำโพง |
| ถนนทรงวาด | ทุกวัน | MRT วัดมังกร |
| คลองโอ่งอ่าง | ทุกวัน | MRT สามยอด |
| วัดอรุณฯ ยามค่ำ จากฝั่งท่าเตียน | ไฟเปิดราว 19:00 | MRT สนามไชย |

วันจันทร์ BACC อุทยานผีเสื้อ และพิพิธภัณฑ์ชาวบางกอกปิด (พิพิธภัณฑ์ปิดวันอังคารด้วย) ร้านดังในตลาดน้อยหลายร้านก็หยุด ส่วน ATT 19 หยุดวันอาทิตย์ วันจันทร์เลยเหมาะเป็นวันสวนกับแม่น้ำ

## สวนเขียว เดินช้า คุยยาว
- **1. สวนป่าเบญจกิติ** ทางเดินลอยฟ้าวนเหนือพื้นที่ชุ่มน้ำกลางเมือง มาชั่วโมงสุดท้ายก่อนฟ้ามืด **ไปกับเพื่อน:** เดินให้ครบวง แล้วเก็บเรื่องยาวไว้คุยบนม้านั่งตอนจบ
- **2. สวนลุมพินี** มีตัวเงินตัวทองเป็นร้อยตัว บางตัวยาวเกินสองเมตร ยืนห่างไว้และห้ามให้อาหาร **ไปกับเพื่อน:** ใครเห็นตัวใหญ่สุดก่อน ได้เลือกร้านข้าวเที่ยง
- **3. สวนลอยฟ้าเจ้าพระยา** สวนบนโครงสร้างรถไฟที่สร้างไม่เสร็จ กลางสะพานพระปกเกล้า เห็นแม่น้ำทั้งสองฝั่ง **ไปกับเพื่อน:** ผลัดกันถ่ายรูปให้กันตอนแดดเย็น

## ศิลปะที่ดูจบแล้วยังมีเรื่องคุยต่อ
- **4. LV The Place Bangkok** นิทรรศการ Visionary Journeys ของ Louis Vuitton ที่เกษร อัมรินทร์ ปี 2026 ปรับใหม่ มีห้องใหม่ และห้องที่หมุนเวียนงานศิลปินไทยร่วมกับ Bangkok Art Biennale รอบแรกเป็นงานของนรักษ์ มูลมานัส ถึงสิ้น ก.พ. 2027 มีคนเสนอที่นี่ไว้ในคอมเมนต์ใต้โพสต์ของ Laurie **ไปกับเพื่อน:** จองรอบเดียวกันทั้งกลุ่ม
- **5. หอศิลป์ BACC** นิทรรศการเข้าฟรี ยกเว้นงานพิเศษ ดูจบเดินต่อย่าน[สยาม](/bangkok/siam/)ได้เลย **ไปกับเพื่อน:** แยกกันเดิน ต่างคนเลือกงานที่ชอบที่สุดหนึ่งชิ้น แล้วมาเถียงกันว่าทำไม
- **6. ริเวอร์ซิตี้ บางกอก** ศูนย์ศิลปะและของเก่าริมเจ้าพระยา แกลเลอรีส่วนใหญ่เข้าฟรี บางนิทรรศการชั่วคราวเก็บค่าเข้า
- **7. ATT 19** ตึกเก่าในตรอกกัปตันบุช ชั้นล่างขายของเก่าและเสื้อผ้าวินเทจ ชั้นบนเป็นแกลเลอรีที่จัดนิทรรศการเข้าฟรี
- **8. พิพิธภัณฑ์ชาวบางกอก** บ้านไม้เก่าในซอยเจริญกรุง 43 เล่าชีวิตคนกรุงเทพฯ ช่วงปี 2480–2500 ผ่านของใช้จริง **ไปกับเพื่อน:** รวมข้อ 6–8 เป็นบ่ายริมน้ำบ่ายเดียว แล้วทายกันว่าของชิ้นไหนบ้านยายใครยังมี

## ย่านเก่าที่เดินเป็นกลุ่มสนุก
- **9. [ตลาดน้อย](/blog/talat-noi-charoen-krung/)** สตรีทอาร์ตรอบซอยเจริญกรุง 22 และตรอกไปศาลเจ้าโรงเกือก ถ่ายรูปสวยสุดก่อนเที่ยง เดินจาก MRT ราว 10–15 นาที
- **10. [ถนนทรงวาด](/blog/song-wat-coolest-street-2026/)** Time Out เพิ่งยกให้เป็นถนนที่เจ๋งที่สุดในโลกปี 2026 แวะ PLAY art house ที่จัดนิทรรศการเข้าฟรี
- **11. คลองโอ่งอ่าง** ทางเดินริมคลองกับสตรีทอาร์ต ห่าง MRT สามยอด ทางออก 1 ราว 300 เมตร แผงถนนคนเดินช่วงเย็นมีเฉพาะบางช่วง เช็กประกาศ กทม. ก่อนไป
- **12. ปากคลองตลาด** ตลาดดอกไม้ที่คึกสุดช่วงตีหนึ่งถึงตีสาม **ไปกับเพื่อน:** เดินเล่นดึก ๆ หลังมื้อเย็น ตอนที่แผงดอกไม้ยังคึกแต่เมืองเริ่มหลับ

## วันหยุดและหลังพระอาทิตย์ตก
- **13. ตลาดนัดจตุจักร** ไม่มีค่าเข้า คืนวันศุกร์เป็นขายส่งเท่านั้น **ไปกับเพื่อน:** ตกลงจุดรวมพลและเวลาก่อนแยกกันเดิน ตลาดใหญ่มาก หลงกันง่าย
- **14. อุทยานผีเสื้อและแมลงกรุงเทพมหานคร** ในสวนรถไฟข้างจตุจักร เคล็ดลับของ Laurie ใช้ได้จริง: ไปคู่กับจตุจักรวันเสาร์–อาทิตย์
- **15. วัดอรุณฯ ยามค่ำ** ยืนดูไฟจากริมน้ำแถวถนนมหาราชใกล้ท่าเตียน ดาดฟ้าหรือโกดังส่วนตัวบางแห่งเก็บเงินเล็กน้อย (Lonely Planet บอกราว ฿20) เลือกจุดริมน้ำที่เปิดโล่งแทน

## แผนเที่ยวฟรีสองวัน ก๊อปไปใช้ได้เลย
- **เสาร์ริมน้ำ:** 10:00 ถนนทรงวาด → 11:30 ตลาดน้อย → 13:30 ริเวอร์ซิตี้และ ATT 19 → 15:00 พิพิธภัณฑ์ชาวบางกอก → 16:30 เรือด่วนธงส้มไปท่าสะพานพุทธ ขึ้นสวนลอยฟ้ารอพระอาทิตย์ตก → 19:00 ดูไฟวัดอรุณฯ จากฝั่งท่าเตียน
- **อาทิตย์จตุจักร:** 09:00 ตลาดนัดจตุจักร → 12:30 อุทยานผีเสื้อ → 16:00 MRT ไปเดินลอยฟ้าที่สวนเบญจกิติ

ทั้งสองวันจ่ายแค่ค่ารถ ค่าเรือ และค่าข้าว

## ที่ฟรีของคุณอยู่ตรงไหน ลงกริ๊ง!
เจอมุมฟรีที่ลิสต์นี้ไม่มี ถ่าย Reel สั้น ๆ แล้วลงกริ๊ง! ทุกไลก์และเซฟได้ริง และคนที่ชอบที่แบบเดียวกันจะเห็นคุณแล้วทักมาคุยได้ บ่ายฟรีหนึ่งบ่ายอาจได้เพื่อนใหม่กลับมาด้วย
''',
  cta=('ลง Reel ที่ฟรีของคุณบนกริ๊ง!', 'ถ่าย Reel สั้น ๆ จากที่ฟรีที่คุณชอบในกรุงเทพฯ แล้วลงกริ๊ง! ทุกไลก์และเซฟได้ริง และคนที่ชอบที่เดียวกันจะเห็นคุณ ใช้ฟรี อายุ 20 ปีขึ้นไป'),
  faq=[('ที่เที่ยวฟรีในกรุงเทพฯ ที่ไปกับเพื่อนได้มีที่ไหนบ้าง', 'เช่น LV The Place Bangkok หอศิลป์ BACC สวนป่าเบญจกิติ สวนลุมพินี สวนลอยฟ้าเจ้าพระยา ตลาดน้อย ถนนทรงวาด และตลาดนัดจตุจักร'),
       ('ที่ฟรีที่ไหนปิดวันจันทร์', 'หอศิลป์ BACC อุทยานผีเสื้อฯ และพิพิธภัณฑ์ชาวบางกอก ร้านดังในตลาดน้อยหลายร้านก็หยุดวันจันทร์'),
       ('LV The Place Bangkok เข้าฟรีไหม', 'ฟรี แต่ต้องจองรอบก่อน เปิดทุกวัน 10:00–20:00 ที่เกษร อัมรินทร์ ใกล้ BTS ชิดลม'),
       ('สวนลอยฟ้าเจ้าพระยาเปิดกี่โมง', 'ทุกวัน 05:00–20:00 เข้าฟรี ลง MRT สนามไชย')],
 ),
 en=dict(
  title='Bangkok for ฿0: 15 Free Things to Do With Friends',
  desc='15 free things to do in Bangkok, checked Nov 2026: LV The Place, Benjakitti, Lumphini\'s lizards, Talat Noi, Wat Arun at night. Hours, closures, stations.',
  h1='Bangkok for ฿0: 15 free things that are better with friends',
  lead='Bangkok is full of good places that cost nothing to enter. Alone, a free afternoon can feel like killing time. With two friends it turns into a day with a story. Here are 15 free spots we checked one by one, each with an idea for making it a group thing.',
  card='15 places with no entry fee, with hours, Monday closures and nearest stations checked, plus two free days out with friends.',
  body='''
## Free places are easy. Company is the point
On your own you walk for ten minutes and head home; with friends it becomes a whole afternoon. So each spot below comes with one small idea for doing it as a group, with old friends or people you only just started talking to.

This list started from a carousel by [@traveltheworldwithlaurie](''' + IG + ''') called "Bangkok for ฿0". We checked every place again, regrouped them and added three of our own. Facts checked on 18 November 2026; check hours before you go.

## Check the day first: the Monday trap
| Place (free entry) | Open | Nearest stop |
|---|---|---|
| LV The Place Bangkok (pre-book) | Daily 10:00–20:00 | BTS Chit Lom |
| BACC | Tue–Sun 10:00–20:00 | BTS National Stadium |
| Butterfly Garden | Tue–Sun 08:30–16:30 | MRT Chatuchak Park |
| Bangkokian Museum | Wed–Sun 10:00–16:00 | Si Phraya Pier |
| ATT 19 | Mon–Sat 11:00–19:00 | Charoen Krung Soi 30 |
| River City Bangkok | Daily 10:00–20:00 | Si Phraya Pier |
| Chao Phraya Sky Park | Daily 05:00–20:00 | MRT Sanam Chai |
| Benjakitti Forest Park | Daily, until 21:00 | MRT Queen Sirikit Centre |
| Lumphini Park | Daily from 04:30 | MRT Lumphini |
| Chatuchak Weekend Market | Sat–Sun 09:00–18:00 | MRT Kamphaeng Phet |
| Pak Khlong Talat | 24 hours | MRT Sanam Chai |
| Talat Noi | Daily | MRT Hua Lamphong |
| Song Wat Road | Daily | MRT Wat Mangkon |
| Khlong Ong Ang | Daily | MRT Sam Yot |
| Wat Arun lit up, from Tha Tien | Lights from about 19:00 | MRT Sanam Chai |

On Mondays BACC, the Butterfly Garden and the Bangkokian Museum are closed (the museum on Tuesdays too), and several of Talat Noi's best-known shops take the day off. ATT 19 rests on Sunday instead. Make Monday your parks-and-river day.

## Green, slow and good for long talks
- **1. Benjakitti Forest Park.** Elevated walkways loop over wetlands in the middle of the city. Come for the last hour of light. **With friends:** walk the full loop and save the long talk for a bench at the end.
- **2. Lumphini Park.** Home to hundreds of water monitors, some over two metres long. Stay well back and never feed them. **With friends:** whoever spots the biggest one picks lunch.
- **3. Chao Phraya Sky Park.** A garden walkway on an unfinished rail structure in the middle of Phra Pok Klao Bridge, with river views both ways. **With friends:** take turns shooting each other at golden hour.

## Art you will still be talking about later
- **4. LV The Place Bangkok.** Louis Vuitton's Visionary Journeys exhibition at Gaysorn Amarin. Refreshed in 2026 with new rooms, including one that rotates work by Thai artists with Bangkok Art Biennale; the first, by Narak Mulmanus, runs to the end of February 2027. Someone suggested it under Laurie's post, and we agree. **With friends:** book one slot for the whole group.
- **5. Bangkok Art and Culture Centre (BACC).** Free except special events, and [Siam](/en/bangkok/siam/) is right outside. **With friends:** split up, each pick one favourite work, then defend it.
- **6. River City Bangkok.** A riverside art and antiques centre. Most galleries are free; some temporary exhibitions are ticketed.
- **7. ATT 19.** An old building on Captain Bush Lane: antiques and vintage clothes downstairs, a gallery with free exhibitions upstairs.
- **8. Bangkokian Museum.** An old wooden house on Charoen Krung Soi 43 showing everyday Bangkok life from the late 1930s to the 1950s. **With friends:** join 6, 7 and 8 into one riverside afternoon, and guess which objects someone's grandmother still owns.

## Old streets that are better in a group
- **9. [Talat Noi](/en/blog/talat-noi-charoen-krung/).** Street art around Soi Charoen Krung 22 and the lane to the Rong Kueak shrine. Best photographed before noon; 10–15 minutes' walk from the MRT.
- **10. [Song Wat Road](/en/blog/song-wat-coolest-street-2026/).** Time Out has just named it the coolest street in the world for 2026. PLAY art house holds free exhibitions.
- **11. Khlong Ong Ang.** A canal walk lined with street art, about 300 metres from MRT Sam Yot Exit 1. The evening walking-street stalls only run on some dates, so check the BMA's latest posts.
- **12. Pak Khlong Talat.** The flower market is busiest between 1am and 3am. **With friends:** a late walk after dinner, past stalls still busy while the city sleeps.

## Weekends and after dark
- **13. Chatuchak Weekend Market.** No ticket to walk in; Friday evening is wholesale only. **With friends:** agree a regroup spot and time before you split up. It is huge.
- **14. Bangkok Butterfly Garden and Insectarium.** In Suan Rot Fai, next to Chatuchak. Laurie's tip holds: pair it with Chatuchak at the weekend.
- **15. Wat Arun at night.** Watch the lights from the riverside along Maha Rat Road near Tha Tien Pier. Some private decks ask a small fee (Lonely Planet mentions ฿20), so pick an open stretch of riverside.

## Two free days, ready to copy
- **Riverside Saturday:** 10:00 Song Wat → 11:30 Talat Noi → 13:30 River City and ATT 19 → 15:00 Bangkokian Museum → 16:30 orange-flag boat to Saphan Phut Pier and the Sky Park for sunset → 19:00 Wat Arun's lights from Tha Tien.
- **Chatuchak Sunday:** 09:00 Chatuchak → 12:30 Butterfly Garden → 16:00 MRT to Benjakitti for the skywalks.

Both days, you pay only for trains, boats and food.

## Where is your free spot? Post it on Kring
Found a free corner of Bangkok that is not on this list? Film a short Reel and post it on Kring. Every like and save earns Rings, and people who love the same places can find you and start a chat. One free afternoon might bring back a new friend.
''',
  cta=('Post your ฿0 Bangkok spot', 'Film a short Reel at your favourite free spot in Bangkok and post it on Kring. Every like and save earns Rings, and people who like the same places can find you. Free, ages 20+.'),
  faq=[('What are the best free things to do in Bangkok with friends?', 'LV The Place Bangkok, BACC, Benjakitti Forest Park, Lumphini Park, Chao Phraya Sky Park, Talat Noi, Song Wat Road and Chatuchak Weekend Market.'),
       ('Which free places in Bangkok close on Mondays?', 'BACC, the Bangkok Butterfly Garden and the Bangkokian Museum. Many well-known Talat Noi shops also close on Mondays.'),
       ('Is LV The Place Bangkok free?', 'Yes, but pre-book a slot. Open daily 10:00–20:00 at Gaysorn Amarin, near BTS Chit Lom.'),
       ('What time does Chao Phraya Sky Park open?', 'Daily 05:00–20:00, free. The nearest station is MRT Sanam Chai.')],
 )),
]
