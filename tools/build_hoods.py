#!/usr/bin/env python3
"""Neighbourhood pages for search: /bangkok/<slug>/ (Thai) and /en/bangkok/<slug>/ (English), plus the two hub pages.
   Run: python3 tools/build_hoods.py"""
import os, json, html
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H = [
 dict(s='siam', en='Siam', th='สยาม',
  alt_en='Three friends crossing the road at Siam, Bangkok, under neon lights', alt_th='เพื่อนสามคนข้ามถนนย่านสยาม กรุงเทพฯ ใต้แสงนีออน',
  lead_en='Siam is where Bangkok crosses paths: two BTS lines, students, shoppers and visitors all in one place.',
  lead_th='สยามคือจุดที่คนกรุงเทพฯ มาเจอกัน รถไฟฟ้าสองสาย นักเรียน นักศึกษา และนักท่องเที่ยวอยู่ในที่เดียว',
  like_en='Siam BTS is the interchange of the Sukhumvit and Silom lines, so almost everyone passes through. Around it are Siam Square, Siam Paragon, Siam Center and the Bangkok Art and Culture Centre, all joined by a covered skywalk. It is busy from late morning until the last train.',
  like_th='สถานีสยามเป็นจุดเชื่อมสายสุขุมวิทกับสายสีลม แทบทุกคนต้องผ่าน รอบ ๆ มีสยามสแควร์ สยามพารากอน สยามเซ็นเตอร์ และหอศิลปวัฒนธรรมแห่งกรุงเทพมหานคร เดินถึงกันด้วยสกายวอล์ก คึกคักตั้งแต่สายจนรถไฟเที่ยวสุดท้าย',
  spots_en=['Siam Square and its small lanes','Bangkok Art and Culture Centre (free to enter)','The skywalk between Siam and National Stadium','Lido Connect for live music and small shows'],
  spots_th=['สยามสแควร์และซอยเล็ก ๆ','หอศิลปวัฒนธรรมแห่งกรุงเทพมหานคร (เข้าฟรี)','สกายวอล์กระหว่างสยามกับสนามกีฬาแห่งชาติ','ลิโด้ คอนเน็กต์ ดนตรีสดและโชว์เล็ก ๆ'],
  go_en='BTS Siam (Sukhumvit and Silom lines) or BTS National Stadium.', go_th='BTS สยาม (สายสุขุมวิทและสายสีลม) หรือ BTS สนามกีฬาแห่งชาติ'),
 dict(s='ari', en='Ari', th='อารีย์',
  alt_en='A friend taking a photo of two friends on a leafy soi in Ari, Bangkok', alt_th='เพื่อนถ่ายรูปให้เพื่อนในซอยร่มรื่นย่านอารีย์ กรุงเทพฯ',
  lead_en='Ari is leafy, low-rise and slow: quiet sois, small cafés and people who actually live in the neighbourhood.',
  lead_th='อารีย์ร่มรื่น ตึกไม่สูง จังหวะช้า ซอยเงียบ คาเฟ่เล็ก ๆ และคนที่อยู่ในย่านจริง ๆ',
  like_en='Ari sits on Phahonyothin Road, a few stops north of the city centre. The sois behind the BTS station are lined with old trees, houses turned into cafés, small galleries and design shops. It is one of the easiest parts of Bangkok to walk, and Chatuchak Weekend Market is two BTS stops away.',
  like_th='อารีย์อยู่บนถนนพหลโยธิน เหนือใจกลางเมืองไม่กี่สถานี ซอยหลังสถานี BTS มีต้นไม้ใหญ่ บ้านเก่าที่กลายเป็นคาเฟ่ แกลเลอรีเล็ก ๆ และร้านดีไซน์ เป็นย่านที่เดินง่ายที่สุดย่านหนึ่งของกรุงเทพฯ และห่างจากตลาดนัดจตุจักรแค่สองสถานี',
  spots_en=['Soi Ari and Soi Ari Samphan','House-turned-cafés under the big trees','Small galleries and design shops','Chatuchak Weekend Market, two stops north'],
  spots_th=['ซอยอารีย์และซอยอารีย์สัมพันธ์','คาเฟ่ในบ้านเก่าใต้ต้นไม้ใหญ่','แกลเลอรีและร้านดีไซน์เล็ก ๆ','ตลาดนัดจตุจักร ห่างไปสองสถานี'],
  go_en='BTS Ari (Sukhumvit line).', go_th='BTS อารีย์ (สายสุขุมวิท)'),
 dict(s='thonglor', en='Thonglor', th='ทองหล่อ',
  alt_en='Three friends on a Thonglor rooftop at night with the Bangkok skyline behind', alt_th='เพื่อนสามคนบนรูฟท็อปทองหล่อยามค่ำ มีตึกกรุงเทพฯ อยู่ด้านหลัง',
  lead_en='Thonglor is Bangkok dressed up: rooftops, late nights and the city skyline in every direction.',
  lead_th='ทองหล่อคือกรุงเทพฯ ในลุคแต่งตัวจัดเต็ม รูฟท็อป ชีวิตกลางคืน และวิวตึกรอบด้าน',
  like_en='Thonglor is Sukhumvit Soi 55. The main road runs north from the BTS station with side sois full of design-led cafés, community malls and rooftops, and it flows straight into Ekkamai next door. It comes alive after dark and stays up late.',
  like_th='ทองหล่อคือสุขุมวิทซอย 55 ถนนหลักวิ่งขึ้นเหนือจากสถานี BTS ซอยย่อยเต็มไปด้วยคาเฟ่ดีไซน์สวย คอมมูนิตี้มอลล์ และรูฟท็อป ต่อเนื่องไปถึงเอกมัย ย่านนี้คึกคักหลังพระอาทิตย์ตกและอยู่ดึก',
  spots_en=['Rooftops with a skyline view','The Commons on Thonglor Soi 17','The side sois between Thonglor and Ekkamai','Late-evening walks along Sukhumvit 55'],
  spots_th=['รูฟท็อปวิวตึก','เดอะคอมมอนส์ ทองหล่อซอย 17','ซอยย่อยระหว่างทองหล่อกับเอกมัย','เดินเล่นยามค่ำบนสุขุมวิท 55'],
  go_en='BTS Thong Lo (Sukhumvit line).', go_th='BTS ทองหล่อ (สายสุขุมวิท)'),
 dict(s='yaowarat', en='Yaowarat', th='เยาวราช',
  alt_en='Three friends walking under red lanterns and neon signs in Yaowarat, Bangkok', alt_th='เพื่อนสามคนเดินใต้โคมแดงและป้ายนีออนที่เยาวราช กรุงเทพฯ',
  lead_en="Yaowarat is Bangkok's Chinatown: one road of neon signs, lanterns and crowds that only gets busier after dark.",
  lead_th='เยาวราชคือไชน่าทาวน์ของกรุงเทพฯ ถนนสายเดียวที่เต็มไปด้วยป้ายนีออน โคมแดง และผู้คน ยิ่งค่ำยิ่งคึกคัก',
  like_en='Yaowarat Road runs through the old Chinese quarter, from Odeon Circle and its China Gate towards the river. By day it is gold shops and the narrow Sampeng Lane market; at night the signs light up and the pavements fill. The small lanes around Soi Nana have galleries and cafés in old shophouses.',
  like_th='ถนนเยาวราชตัดผ่านย่านคนจีนเก่า จากวงเวียนโอเดียนและซุ้มประตูเฉลิมพระเกียรติไปทางแม่น้ำ กลางวันเป็นร้านทองและตลาดสำเพ็ง กลางคืนป้ายไฟสว่างและทางเท้าเต็มไปด้วยคน ซอยเล็ก ๆ แถวซอยนานามีแกลเลอรีและคาเฟ่ในตึกแถวเก่า',
  spots_en=['Yaowarat Road under the neon signs','Odeon Circle and the China Gate','Sampeng Lane market','Soi Nana: shophouse cafés and galleries'],
  spots_th=['ถนนเยาวราชใต้ป้ายนีออน','วงเวียนโอเดียนและซุ้มประตูจีน','ตลาดสำเพ็ง','ซอยนานา คาเฟ่และแกลเลอรีในตึกแถว'],
  go_en='MRT Wat Mangkon (Blue line).', go_th='MRT วัดมังกร (สายสีน้ำเงิน)'),
 dict(s='talat-noi', en='Talat Noi', th='ตลาดน้อย',
  alt_en='Friends walking past street art and red lanterns in Talat Noi, Bangkok', alt_th='เพื่อนเดินผ่านสตรีทอาร์ตและโคมแดงที่ตลาดน้อย กรุงเทพฯ',
  lead_en='Talat Noi is an old riverside community of narrow lanes, street art and century-old houses, a short walk from Chinatown.',
  lead_th='ตลาดน้อยคือชุมชนเก่าริมแม่น้ำ ซอยแคบ สตรีทอาร์ต และบ้านอายุร้อยปี เดินจากเยาวราชไม่ไกล',
  like_en='Talat Noi lies between Yaowarat and Charoen Krung Road on the Chao Phraya. It grew up around Chinese traders and car-parts workshops, and the lanes still hold both. Today it is known for its murals, the 200-year-old So Heng Tai mansion, Holy Rosary Church and small riverside cafés.',
  like_th='ตลาดน้อยอยู่ระหว่างเยาวราชกับถนนเจริญกรุง ริมแม่น้ำเจ้าพระยา เติบโตมากับพ่อค้าชาวจีนและร้านอะไหล่รถเก่า ซึ่งยังอยู่ในซอยจนวันนี้ ปัจจุบันขึ้นชื่อเรื่องภาพวาดบนกำแพง บ้านโซวเฮงไถ่อายุราว 200 ปี วัดแม่พระลูกประคำ (กาลหว่าร์) และคาเฟ่เล็ก ๆ ริมน้ำ',
  spots_en=['The mural lanes off Soi Wanit 2','So Heng Tai mansion','Holy Rosary Church by the river','Riverside cafés at sunset'],
  spots_th=['ซอยสตรีทอาร์ตแถวซอยวานิช 2','บ้านโซวเฮงไถ่','วัดแม่พระลูกประคำ ริมแม่น้ำ','คาเฟ่ริมน้ำตอนพระอาทิตย์ตก'],
  go_en='MRT Hua Lamphong (Blue line), then about 10 minutes on foot, or a river boat to Marine Department pier.', go_th='MRT หัวลำโพง (สายสีน้ำเงิน) แล้วเดินประมาณ 10 นาที หรือเรือด่วนลงท่ากรมเจ้าท่า'),
 dict(s='thonburi', en='Thonburi riverside', th='ฝั่งธนฯ ริมแม่น้ำ',
  alt_en='Three friends sitting on a wooden deck by the Chao Phraya river at sunset, Thonburi side', alt_th='เพื่อนสามคนนั่งบนลานไม้ริมแม่น้ำเจ้าพระยายามเย็น ฝั่งธนบุรี',
  lead_en='The Thonburi side is the calm bank of the Chao Phraya: wooden decks, river breeze and the skyline across the water.',
  lead_th='ฝั่งธนฯ คือฝั่งสงบของแม่น้ำเจ้าพระยา ลานไม้ ลมแม่น้ำ และวิวตึกฝั่งตรงข้าม',
  like_en='Thonburi is the west bank of the river, older and slower than the centre. Along the water you find ICONSIAM, the Chao Phraya Sky Park, a garden walkway built across the river, the lanes of Khlong San and the market at Wang Lang. The best hour is sunset, when the towers across the water turn gold.',
  like_th='ธนบุรีคือฝั่งตะวันตกของแม่น้ำ เก่าและช้ากว่าใจกลางเมือง ริมน้ำมีไอคอนสยาม สวนลอยฟ้าเจ้าพระยาที่เป็นทางเดินสวนข้ามแม่น้ำ ซอยย่านคลองสาน และตลาดวังหลัง ช่วงที่สวยที่สุดคือพระอาทิตย์ตก ตอนตึกฝั่งตรงข้ามเป็นสีทอง',
  spots_en=['Chao Phraya Sky Park','The riverside promenade at ICONSIAM','Khlong San lanes','Wang Lang market'],
  spots_th=['สวนลอยฟ้าเจ้าพระยา','ทางเดินริมน้ำหน้าไอคอนสยาม','ซอยย่านคลองสาน','ตลาดวังหลัง'],
  go_en='BTS Gold line to Charoen Nakhon, or a ferry across from Sathorn or Tha Chang piers.', go_th='BTS สายสีทอง สถานีเจริญนคร หรือเรือข้ามฟากจากท่าสาทรหรือท่าช้าง'),
]
T = {
 'en': dict(home='/en/', hub='/en/bangkok/', hubname='Bangkok neighbourhoods', h1='Make new friends in %s', title='Make new friends in %s, Bangkok · Kring',
   desc='%s Kring is the app for making new friends in Bangkok: post Reels at real places and talk to people who live here. Opens 1 Dec 2026.',
   like='What %s is like', spots='Places people love here', go='Getting there', how='How Kring works in %s',
   steps=['Make your card: your name, your neighbourhoods, what you are into.','Post a short Reel and tag the real place.','Talk to people who love the same places. Chats translate between Thai and English.'],
   faq='Good to know', q=[('Is Kring free?','Yes. Making a card, posting Reels and chatting are free.'),('Do I need to speak Thai?','No. Chats translate between Thai and English, so locals and travellers can talk.'),('Where do people get together?','Always in public places such as cafés, markets and parks. Never private addresses.'),('When does Kring open?','Kring opens in Bangkok on 1 December 2026. You can make your card now.')],
   cta='Open Kring', sub='Free · LINE or email · 18+', more='More Bangkok neighbourhoods', hubh1='Make new friends in every Bangkok neighbourhood', hubtitle='Bangkok neighbourhoods: where to make new friends · Kring',
   hubdesc='Siam, Ari, Thonglor, Yaowarat, Talat Noi and the Thonburi riverside: what each Bangkok neighbourhood is like and how to make new friends there with Kring.',
   hublead='Every part of Bangkok has its own crowd. Pick a neighbourhood, see what it is like and who is posting from there.', bc='Home', other='ไทย'),
 'th': dict(home='/', hub='/bangkok/', hubname='ย่านในกรุงเทพฯ', h1='หาเพื่อนใหม่ย่าน%s', title='หาเพื่อนใหม่ย่าน%s กรุงเทพฯ · กริ๊ง!',
   desc='%s กริ๊ง! แอปหาเพื่อนใหม่ในกรุงเทพฯ โพสต์ Reels ที่สถานที่จริง คุยกับคนในย่าน เปิด 1 ธ.ค. 2026',
   like='ย่าน%sเป็นแบบไหน', spots='ที่ที่คนชอบในย่านนี้', go='ไปยังไง', how='กริ๊ง! ในย่าน%s',
   steps=['ทำการ์ดของคุณ ชื่อ ย่านที่ชอบ และสิ่งที่สนใจ','โพสต์ Reel สั้น ๆ แล้วแท็กสถานที่จริง','คุยกับคนที่ชอบที่เดียวกัน แชตแปลไทย-อังกฤษให้อัตโนมัติ'],
   faq='เรื่องที่ควรรู้', q=[('กริ๊ง! ใช้ฟรีไหม','ฟรี ทำการ์ด โพสต์ Reels และแชตได้ไม่มีค่าใช้จ่าย'),('ต้องพูดอังกฤษได้ไหม','ไม่ต้อง แชตแปลระหว่างไทยกับอังกฤษให้ คนกรุงเทพฯ กับนักท่องเที่ยวคุยกันได้'),('นัดเจอกันที่ไหน','ที่สาธารณะเท่านั้น เช่น คาเฟ่ ตลาด และสวน ไม่ใช่ที่อยู่ส่วนตัว'),('กริ๊ง! เปิดเมื่อไหร่','กริ๊ง! เปิดในกรุงเทพฯ วันที่ 1 ธันวาคม 2026 ทำการ์ดไว้ก่อนได้เลย')],
   cta='เปิดกริ๊ง!', sub='ฟรี · LINE หรืออีเมล · 18+', more='ย่านอื่นในกรุงเทพฯ', hubh1='หาเพื่อนใหม่ได้ทุกย่านในกรุงเทพฯ', hubtitle='ย่านในกรุงเทพฯ: หาเพื่อนใหม่ที่ไหนดี · กริ๊ง!',
   hubdesc='สยาม อารีย์ ทองหล่อ เยาวราช ตลาดน้อย และฝั่งธนฯ ริมแม่น้ำ แต่ละย่านเป็นแบบไหน และหาเพื่อนใหม่ในย่านนั้นกับกริ๊ง! ได้ยังไง',
   hublead='แต่ละย่านของกรุงเทพฯ มีคนในแบบของตัวเอง เลือกย่าน ดูว่าเป็นแบบไหน และใครกำลังโพสต์จากที่นั่น', bc='หน้าแรก', other='EN'),
}
CSS = '''@font-face{font-family:Unbounded;font-weight:800;font-display:swap;src:url(/fonts/unbounded-latin-800-normal.woff2) format("woff2")}
@font-face{font-family:"Plus Jakarta Sans";font-weight:400;font-display:swap;src:url(/fonts/plus-jakarta-sans-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"Plus Jakarta Sans";font-weight:700;font-display:swap;src:url(/fonts/plus-jakarta-sans-latin-700-normal.woff2) format("woff2")}
@font-face{font-family:"Noto Sans Thai";font-weight:400;font-display:swap;src:url(/fonts/noto-sans-thai-thai-400-normal.woff2) format("woff2")}
@font-face{font-family:"Noto Sans Thai";font-weight:800;font-display:swap;src:url(/fonts/noto-sans-thai-thai-800-normal.woff2) format("woff2")}
*{box-sizing:border-box;margin:0;padding:0}body{background:#07060c;color:#fff;font:400 17px/1.65 "Plus Jakarta Sans","Noto Sans Thai",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:#3ff0ff}.top{position:absolute;top:0;left:0;right:0;z-index:3;display:flex;justify-content:space-between;align-items:center;padding:16px 18px}
.top a{color:#fff;text-decoration:none;font-weight:700}.logo{font:800 20px Unbounded,"Noto Sans Thai",sans-serif}.logo i{color:#ff4fd8;font-style:normal}
.lg{font-size:13px;border:1px solid rgba(255,255,255,.35);border-radius:99px;padding:6px 12px;background:rgba(7,6,12,.4)}
.hero{position:relative;min-height:min(92vh,820px);display:flex;align-items:flex-end;overflow:hidden}
.hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,6,12,.45),rgba(7,6,12,0) 28%,rgba(7,6,12,.2) 52%,#07060c 96%)}
.hero .in{position:relative;z-index:2;padding:0 20px 34px;max-width:760px;margin:0 auto;width:100%}
.bc{font-size:13px;color:rgba(255,255,255,.75);margin-bottom:10px}.bc a{color:inherit}
h1{font:800 clamp(30px,8.4vw,52px)/1.12 Unbounded,"Noto Sans Thai",sans-serif;text-shadow:0 2px 24px rgba(0,0,0,.6)}html[lang=th] h1{line-height:1.3}
h1 em{font-style:normal;color:#ff4fd8}.lead{margin-top:12px;font-size:18px;color:rgba(255,255,255,.92);text-shadow:0 1px 12px rgba(0,0,0,.7)}
.btn{display:inline-flex;align-items:center;gap:8px;margin-top:18px;background:linear-gradient(90deg,#ff4fd8,#8b5cff);color:#fff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:99px;box-shadow:0 0 28px rgba(255,79,216,.45)}
.sub{display:block;margin-top:9px;font-size:12.5px;color:rgba(255,255,255,.7)}
main{max-width:760px;margin:0 auto;padding:8px 20px 30px}section{padding:22px 0;border-top:1px solid rgba(255,255,255,.1)}section:first-child{border:0}
h2{font:800 21px/1.25 Unbounded,"Noto Sans Thai",sans-serif;margin-bottom:10px}html[lang=th] h2{line-height:1.4}
p,li{color:rgba(255,255,255,.84)}ul,ol{padding-left:20px;display:grid;gap:6px}
dt{font-weight:700;color:#fff;margin-top:12px}dd{color:rgba(255,255,255,.84)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;list-style:none;padding:0}
.grid a{position:relative;display:block;aspect-ratio:3/4;border-radius:16px;overflow:hidden;color:#fff;text-decoration:none;font:800 16px Unbounded,"Noto Sans Thai",sans-serif}
.grid img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.grid a::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,6,12,0) 45%,rgba(7,6,12,.85))}
.grid span{position:absolute;left:12px;right:12px;bottom:12px;z-index:1}
.end{text-align:center;padding:30px 0 10px}footer{max-width:760px;margin:0 auto;padding:18px 20px 40px;font-size:13px;color:rgba(255,255,255,.55);display:flex;flex-wrap:wrap;gap:6px 16px}footer a{color:rgba(255,255,255,.75);text-decoration:none}'''
e = html.escape
def head(L, title, desc, path, alt_path, img, ld):
    t = T[L]; th_url = 'https://kringapp.com' + (path if L == 'th' else alt_path); en_url = 'https://kringapp.com' + (path if L == 'en' else alt_path)
    return ('<!doctype html>\n<html lang="%s">\n<head>\n<meta charset="utf-8"/><meta content="width=device-width,initial-scale=1,viewport-fit=cover" name="viewport"/>\n<title>%s</title>\n<meta content="%s" name="description"/>\n'
      '<link href="https://kringapp.com%s" rel="canonical"/>\n<link href="%s" hreflang="th" rel="alternate"/>\n<link href="%s" hreflang="en" rel="alternate"/>\n<link href="%s" hreflang="x-default" rel="alternate"/>\n'
      '<meta content="#07060c" name="theme-color"/><link href="/icon-192.png" rel="icon" sizes="192x192" type="image/png"/>\n'
      '<meta content="website" property="og:type"/><meta content="Kring" property="og:site_name"/><meta content="%s" property="og:locale"/><meta content="https://kringapp.com%s" property="og:url"/>\n'
      '<meta content="%s" property="og:title"/><meta content="%s" property="og:description"/><meta content="https://kringapp.com/assets/hoods/og-%s.jpg" property="og:image"/><meta content="1200" property="og:image:width"/><meta content="630" property="og:image:height"/>\n'
      '<meta content="summary_large_image" name="twitter:card"/>\n<link as="image" href="/assets/hoods/%s.webp" rel="preload"/>\n<script type="application/ld+json">%s</script>\n<style>%s</style>\n</head>\n<body>\n') % (
      L, e(title), e(desc), path, th_url, en_url, th_url, 'th_TH' if L == 'th' else 'en_US', path, e(title), e(desc), img, img, json.dumps(ld, ensure_ascii=False, separators=(',', ':')), CSS)
def top(L, alt_path):
    t = T[L]; return '<div class="top"><a class="logo" href="%s">%s<i>!</i></a><a class="lg" href="%s" hreflang="%s">%s</a></div>\n' % (t['home'], 'กริ๊ง' if L == 'th' else 'Kring', alt_path, 'en' if L == 'th' else 'th', t['other'])
def foot(L):
    t = T[L]; return '<footer><a href="%s">%s</a><a href="%s">%s</a><a href="/locals/">Kring Locals</a><a href="/partners/">%s</a><a href="/safety">%s</a><a href="/terms">%s</a><a href="/privacy">%s</a></footer>\n</body>\n</html>\n' % (
      t['home'], t['bc'], t['hub'], t['hubname'], 'For venues' if L == 'en' else 'สำหรับร้าน', 'Safety' if L == 'en' else 'ความปลอดภัย', 'Terms' if L == 'en' else 'ข้อกำหนด', 'Privacy' if L == 'en' else 'ความเป็นส่วนตัว')
def grid(L, skip=None):
    t = T[L]; return '<ul class="grid">' + ''.join('<li><a href="%s%s/"><img alt="%s" decoding="async" height="1376" loading="lazy" src="/assets/hoods/%s.webp" width="768"/><span>%s</span></a></li>' % (t['hub'], h['s'], e(h['alt_' + L]), h['s'], e(h[L])) for h in H if h['s'] != skip) + '</ul>'
def cta(L):
    t = T[L]; return '<a class="btn" href="/app/?join=1">%s →</a><span class="sub">%s</span>' % (t['cta'], t['sub'])
def write(path, s):
    d = os.path.join(R, path.strip('/')); os.makedirs(d, exist_ok=True); open(os.path.join(d, 'index.html'), 'w', encoding='utf-8').write(s)
urls = []
for L in ('th', 'en'):
    t = T[L]; oL = 'en' if L == 'th' else 'th'
    for h in H:
        path = t['hub'] + h['s'] + '/'; alt = T[oL]['hub'] + h['s'] + '/'; n = h[L]
        title = t['title'] % n; desc = t['desc'] % h['lead_' + L]
        ld = {"@context": "https://schema.org", "@graph": [
          {"@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": 1, "name": "Kring", "item": "https://kringapp.com" + t['home']}, {"@type": "ListItem", "position": 2, "name": t['hubname'], "item": "https://kringapp.com" + t['hub']}, {"@type": "ListItem", "position": 3, "name": n, "item": "https://kringapp.com" + path}]},
          {"@type": "FAQPage", "inLanguage": L, "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in t['q']]}]}
        h1 = (t['h1'] % ('<em>%s</em>' % e(n))) + ('' if L == 'th' else ', Bangkok')
        s = head(L, title, desc, path, alt, h['s'], ld) + top(L, alt)
        s += '<header class="hero"><img alt="%s" fetchpriority="high" height="1376" src="/assets/hoods/%s.webp" width="768"/><div class="in"><p class="bc"><a href="%s">%s</a> › <a href="%s">%s</a></p><h1>%s</h1><p class="lead">%s</p>%s</div></header>\n<main>\n' % (e(h['alt_' + L]), h['s'], t['home'], t['bc'], t['hub'], t['hubname'], h1, e(h['lead_' + L]), cta(L))
        s += '<section><h2>%s</h2><p>%s</p></section>\n' % (e(t['like'] % n), e(h['like_' + L]))
        s += '<section><h2>%s</h2><ul>%s</ul></section>\n' % (t['spots'], ''.join('<li>%s</li>' % e(x) for x in h['spots_' + L]))
        s += '<section><h2>%s</h2><p>%s</p></section>\n' % (t['go'], e(h['go_' + L]))
        s += '<section><h2>%s</h2><ol>%s</ol></section>\n' % (e(t['how'] % n), ''.join('<li>%s</li>' % e(x) for x in t['steps']))
        s += '<section><h2>%s</h2><dl>%s</dl></section>\n' % (t['faq'], ''.join('<dt>%s</dt><dd>%s</dd>' % (e(q), e(a)) for q, a in t['q']))
        s += '<section><h2>%s</h2>%s</section>\n<div class="end">%s</div>\n</main>\n' % (t['more'], grid(L, h['s']), cta(L)) + foot(L)
        write(path, s); urls.append((path, alt, L))
    path = t['hub']; alt = T[oL]['hub']
    ld = {"@context": "https://schema.org", "@type": "ItemList", "name": t['hubname'], "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": h[L], "url": "https://kringapp.com" + path + h['s'] + '/'} for i, h in enumerate(H)]}
    alt_img = 'Friends watching fireworks at Rama VIII Bridge, Bangkok' if L == 'en' else 'เพื่อนดูพลุที่สะพานพระราม 8 กรุงเทพฯ'
    s = head(L, t['hubtitle'], t['hubdesc'], path, alt, 'bangkok', ld) + top(L, alt)
    s += '<header class="hero"><img alt="%s" fetchpriority="high" height="1376" src="/assets/hoods/bangkok.webp" width="768"/><div class="in"><p class="bc"><a href="%s">%s</a></p><h1>%s</h1><p class="lead">%s</p>%s</div></header>\n<main>\n<section><h2>%s</h2>%s</section>\n<div class="end">%s</div>\n</main>\n' % (e(alt_img), t['home'], t['bc'], e(t['hubh1']), e(t['hublead']), cta(L), t['hubname'], grid(L), cta(L)) + foot(L)
    write(path, s); urls.append((path, alt, L))
json.dump(urls, open(os.path.join(R, 'tools/hood_urls.json'), 'w'))
print(len(urls), 'pages')
