import { describe, it, expect } from 'vitest'
import { maskTxt, isSolicitation, isAbusive, isIdLike, isAroundKring, PREPAY, OFFAPP } from './guard'
import { keepsNumbers, translateMaskedSync } from './translate'

describe('maskTxt: app IDs are hidden', () => {
  const hidden: [string, string][] = [
    ['my kakao is jiwoo_test', 'jiwoo_test'],
    ['My KakaoTalk ID is jiwoo_test', 'jiwoo_test'],
    ['my kakaotalk id: jiwoo_test', 'jiwoo_test'],
    ['제 카카오톡 아이디는 jiwoo_test예요', 'jiwoo_test'],
    ['카톡 jiwoo_test 로 연락주세요', 'jiwoo_test'],
    ['my wechat is liwei_cd2000', 'liwei_cd2000'],
    ['我的微信是 liwei_cd2000', 'liwei_cd2000'],
    ['微信号：liwei_cd2000', 'liwei_cd2000'],
    ['加我微信 liwei_cd2000', 'liwei_cd2000'],
    ['my line is jiwoo99', 'jiwoo99'],
    ['LINE ID: nicha.bkk', 'nicha.bkk'],
    ['line id nicha_bkk', 'nicha_bkk'],
    ['add me on line nicha', 'nicha'],
    ['ไลน์ไอดี nicha99', 'nicha99'],
    ['ไลน์ของฉันคือ nicha_bkk', 'nicha_bkk'],
    ['my ig is @jiwoo.k', 'jiwoo.k'],
    ['IG: jiwoo.k', 'jiwoo.k'],
    ['my instagram is jiwoo', 'jiwoo'],
    ['telegram: @liwei', 'liwei'],
    ['мой телеграм liwei_cd', 'liwei_cd'],
  ]
  for (const [input, secret] of hidden) {
    it(`hides the ID in "${input}"`, () => {
      const out = maskTxt(input)
      expect(out).not.toContain(secret)
      expect(out).toContain('••••')
    })
  }

  it('keeps the Korean words around the ID', () => {
    expect(maskTxt('제 카카오톡 아이디는 jiwoo_test예요')).toBe('제 카카오톡 아이디는 ••••예요')
  })
  it('keeps the Chinese words around the ID', () => {
    expect(maskTxt('我的微信是 liwei_cd2000')).toBe('我的微信是 ••••')
  })
  it('still hides phones, emails and messaging links', () => {
    expect(maskTxt('call 081 234 5678')).not.toMatch(/5678/)
    expect(maskTxt('mail me nicha@gmail.com')).not.toContain('nicha@gmail.com')
    expect(maskTxt('line.me/ti/p/abc')).not.toContain('line.me')
  })
})

describe('maskTxt: normal words are never masked', () => {
  const plain = [
    'I love walking',
    'I want to try the noodles',
    'Was it far from the station?',
    'We can walk to the wat after',
    'the line is long at the stall',
    'I will wait in line at 18:30',
    'Is the igloo bar open?',
    'Big fan of tea',
    'Telling my friends about this',
    'Snapping photos at the market',
    'See you at exit 1 at 18:30',
    'Can we meet at 19:00 instead? I have 2 friends.',
    'สวัสดีค่ะ เจอกันที่ MRT วัดมังกร ทางออก 1 ตอน 18:30 ค่ะ',
    '네, 조금만 맵게 해 주세요!',
    '谢谢！',
  ]
  for (const p of plain) {
    it(`leaves "${p}" unchanged`, () => {
      expect(maskTxt(p)).toBe(p)
    })
  }
})

describe('isSolicitation: sexual and solicitation messages are caught', () => {
  const bad = [
    'hotel room tonight? sexy',
    'come to my hotel room 1204',
    'I am in Room 1204',
    'can you spend the night with me',
    'you look s3xy',
    's e x?',
    'คุณไปค้างคืนด้วยได้ไหม',
    'มาที่ห้องโรงแรมฉันไหม',
    'อยากมีเซ็กส์',
    '晚上去酒店房间吗',
    '我们开房吧',
    '호텔 방으로 와요',
    'хочешь секс?',
    'होटल का कमरा',
    'jom ke bilik hotel saya',
  ]
  for (const b of bad) it(`blocks "${b}"`, () => expect(isSolicitation(b)).toBe(true))

  const ok = [
    'Is spicy OK? A little please',
    'My hotel is near BTS Asok, how far is the meeting point?',
    'We only have a short time before sunset',
    'I need to go to the bathroom ไปห้องน้ำก่อนนะ',
    'What does the market have? ที่ตลาดมีอะไรกันบ้าง',
    'Middlesex is my home county',
    'See you at 18:30!',
  ]
  for (const o of ok) it(`allows "${o}"`, () => expect(isSolicitation(o)).toBe(false))
})

describe('translation never changes times or numbers', () => {
  it('keepsNumbers checks every number', () => {
    expect(keepsNumbers('See you at 18:30', '18:30에 만나요')).toBe(true)
    expect(keepsNumbers('See you at 18:30', '18시에 만나요')).toBe(false)
  })
  it('a fixed phrase that would drop the minutes is not used', () => {
    const out = translateMaskedSync('be there in 10 min', 'th', 'en')
    expect(out).toContain('10')
  })
  it('keeps 18:30 when translating a meeting message', () => {
    for (const lang of ['en', 'zh', 'ko', 'hi', 'ru', 'ms'] as const) {
      expect(translateMaskedSync('สวัสดีค่ะ เจอกันที่ MRT วัดมังกร ทางออก 1 ตอน 18:30 ค่ะ', lang, 'th')).toContain('18:30')
    }
  })
})

/* ---------- Round 2: masking leaks found by Ploy, Wei, Ji-woo and Ben ---------- */
describe('maskTxt round 2: contact IDs are hidden', () => {
  const hidden: [string, string][] = [
    ['แอดไลน์พลอยได้นะคะ ploy_ari99', 'ploy_ari99'],
    ['แอดไลน์พลอยได้นะคะ ploy_ari99 เบอร์ 0812345678', 'ploy_ari99'],
    ['ไลน์ผม ben_test123', 'ben_test123'],
    ['add my line ploy_ari99', 'ploy_ari99'],
    ['add my line ployari99 please', 'ployari99'],
    ['j i w o o _ t e s t', 'j i w o o'],
    ['j i w o o _ t e s t 로 추가해주세요', 'w o o'],
    ['ID는 jiwoo_test (카카오)', 'jiwoo_test'],
    ['ID는 jiwoo99 (카카오)', 'jiwoo99'],
    ['jiwoo_test@kakao', 'jiwoo_test'],
    ['jiwoo99@kakao', 'jiwoo99'],
    ['open.kakao.com/o/abc', 'kakao'],
    ['open.kakao.com/o/abc123 여기로', 'abc123'],
    ['pf.kakao.com/_xyz', 'kakao'],
    ['카톡 검색: jiwoo 언더바 test', 'jiwoo'],
    ['공일공 일이삼사 오육칠팔', '일이삼사'],
    ['我的微信是 liwei_cd2000', 'liwei_cd2000'],
    ['微信号：liwei_cd2000', 'liwei_cd2000'],
    ['wechat id liwei_cd2000', 'liwei_cd2000'],
    ['加我微信 liwei_cd2000', 'liwei_cd2000'],
    ['加我微信吧 wxid_test123，电话 0812345678', 'wxid_test123'],
    ['微信 liwei2000 谢谢', 'liwei2000'],
    ['ig @ploy.ari', 'ploy.ari'],
    ['follow me on IG @ploy.ari', 'ploy.ari'],
    ['my telegram @dmitri_spb', 'dmitri_spb'],
    ['телеграм @dmitri_spb', 'dmitri_spb'],
    ['пиши в телегу:@dmitri88', 'dmitri88'],
    ['t.me/dmitri_spb', 'dmitri_spb'],
    ['line.me/ti/p/abc', 'line.me'],
    ['instagram.com/ploy.ari', 'ploy.ari'],
    ['my whatsapp is aarav_99', 'aarav_99'],
    ['व्हाट्सएप aarav99 पर मैसेज करो', 'aarav99'],
    ['tambah saya wasap aisyah_kl', 'aisyah_kl'],
    ['find me at nicha-bkk.com/me', 'nicha-bkk'],
  ]
  for (const [input, secret] of hidden) {
    it(`hides "${secret}" in "${input}"`, () => {
      const out = maskTxt(input)
      expect(out).not.toContain(secret)
      expect(out).toContain('••••')
    })
  }

  it('hides a bare ID once a messenger app was named earlier in the conversation', () => {
    for (const app of ['my kakao is below', '카톡 알려드릴게요', 'add me on line', 'wechat?', '微信可以吗']) {
      expect(maskTxt('jiwoo_test', [app])).toBe('••••')
      expect(maskTxt('liwei2000', [app])).toBe('••••')
    }
  })
  it('a bare word with letters only is not an ID, even after an app was named', () => {
    expect(maskTxt('thanks a lot', ['my kakao'])).toBe('thanks a lot')
    expect(maskTxt('See you at 18:30, MRT exit 2', ['my kakao'])).toBe('See you at 18:30, MRT exit 2')
  })
  it('keeps the Thai words around the ID', () => {
    expect(maskTxt('แอดไลน์พลอยได้นะคะ ploy_ari99')).toBe('แอดไลน์พลอยได้นะคะ ••••')
  })
  it('keeps a booking reference', () => {
    expect(maskTxt('my booking ID is KR-243683')).toBe('my booking ID is KR-243683')
  })
  it('keeps Google Maps and Kring links', () => {
    expect(maskTxt('maps.app.goo.gl/abc123')).toBe('maps.app.goo.gl/abc123')
    expect(maskTxt('see kring.app/help')).toBe('see kring.app/help')
  })
  it('isIdLike', () => {
    expect(isIdLike('ploy_ari99')).toBe(true)
    expect(isIdLike('walking')).toBe(false)
    expect(isIdLike('KR-243683')).toBe(false)
    expect(isIdLike('7pm')).toBe(false)
    expect(isIdLike('1500')).toBe(false)
  })
})

describe('maskTxt round 2: normal messages stay untouched', () => {
  const plain = [
    'walking', 'I want to walk', 'want', '18:30', 'See you at 18:30', '฿1,000', 'Is it 1,500 baht or ฿700?', 'Yaowarat', 'MRT exit 2',
    'We are at MRT exit 2 at 18:30, 2 people, ฿1,000 total', 'Online booking is easy', 'ซื้อออนไลน์ได้ไหม 1500 บาท',
    'The line at the stall was long, maybe 20 min', 'Can I bring my ID card?', 'Meet at Yaowarat Rd, 7pm?',
    'MRT Wat Mangkon 1号出口 18:30 见', '18:30에 MRT 2번 출구에서 만나요', 'Встречаемся в 16:00 у выхода 2',
    'Saya datang jam 7pm, 2 orang', 'मैं 18:30 पर आऊँगी', 'A1 or B2?', 'Can we do 10min later?', 'Thanks! See you soon :)',
  ]
  for (const p of plain) it(`leaves "${p}" unchanged`, () => expect(maskTxt(p)).toBe(p))
})

describe('isAbusive: insults and swearing are not sent', () => {
  const bad = [
    'you are a stupid fucking idiot', 'fuck you', 'f*ck', 'what the fuk', 'you bitch', 'b!tch', 'idiot', 'stupid host', 'piss off', 'bullshit', 'sh1t',
    'ไอ้ควาย', 'ควาย', 'เหี้ย', 'สัส', 'อีดอก', 'มึงจะมาไหม', 'ไอ้โง่', 'แม่งเอ๊ย',
    '傻逼', '他妈的', '씨발', '병신', 'сука', 'блять', 'चूतिया', 'bodoh',
  ]
  for (const b of bad) it(`blocks "${b}"`, () => expect(isAbusive(b)).toBe(true))
  const ok = [
    'Sorry if this is a stupid question, is it spicy?', 'Is there pork? ada babi?', 'ตีนไก่อร่อยไหม', 'ไปสวนสัตว์ได้ไหม', 'เนื้อควายมีไหม',
    'Can we pass the market?', 'What a classic place', 'See you at 18:30!', 'I am a bit late, sorry', 'แม่งานใจดีมาก',
  ]
  for (const o of ok) it(`allows "${o}"`, () => expect(isAbusive(o)).toBe(false))
})

describe('isSolicitation round 2: hotel-room, date and overnight phrasings', () => {
  const bad = [
    'ไปเจอกันที่โรงแรมได้ไหมคะ ห้อง 1203', 'อยากไปเที่ยวต่อหลังกิจกรรม แบบส่วนตัว เดทกันไหม', 'เดทกันไหม', 'คืนนี้ไปห้องผมไหม', 'ค้างคืนด้วยกันไหม', 'ไปห้องกัน', 'มาที่โรงแรมฉันสิ',
    'hotel room?', 'Can we go on a date after?', 'be my date tonight', 'Want to spend the night?', 'come to my hotel after', 'meet me at my hotel',
    'stay the night with me', 'come back to my place', 'just the two of us after the tour', 'room 1203', 'are you dating anyone',
    '我们约会吧', '来我酒店', '데이트 할래요?', 'пойдём на свидание', 'डेट पर चलोगे?',
  ]
  for (const b of bad) it(`blocks "${b}"`, () => expect(isSolicitation(b)).toBe(true))
  const ok = [
    'What date works for you?', 'Can we change the date?', 'My hotel is near BTS Asok, how far is the meeting point?', 'I will go back to the hotel after the walk',
    'โรงแรมฉันอยู่ใกล้ BTS อโศก', 'ไปห้องน้ำก่อนนะ', 'แฟนฉันมาด้วยได้ไหม', 'I need to go to sleep early',
  ]
  for (const o of ok) it(`allows "${o}"`, () => expect(isSolicitation(o)).toBe(false))
})

describe('payment nudges', () => {
  it('pay-before-meeting messages are noticed', () => {
    for (const m of ['Can I pay you now by bank transfer to secure my spot?', 'โอนมัดจำได้ไหมคะ', '我先转账给你', 'Can I pay cash?', 'Можно заплатить наличными?'])
      expect(PREPAY.test(m)).toBe(true)
    expect(PREPAY.test('See you at 18:30')).toBe(false)
  })
  it('off-app booking is noticed', () => {
    expect(OFFAPP.test('we can book outside the app and save the fee')).toBe(true)
    expect(OFFAPP.test('ไม่ผ่านแอปได้ไหม')).toBe(true)
    expect(OFFAPP.test('Is the walk gentle?')).toBe(false)
  })
})

describe('isSolicitation round 3: whole night, overnight, your place, massage after (audit 19)', () => {
  const bad = [
    'How much for the whole night?', 'Do you do overnight?', 'Can we stay all night?', 'all night with you', 'overnight stay?', 'over-night ok?',
    'Can I sleep over?', 'sleepover after the walk?', 'Can we go to your place after?', 'Can we meet at your place?', 'your place or mine?',
    'come to my hotel', 'Want to join me at my hotel later for drinks?', 'come to my room', 'come up to my room after', 'massage after?',
    'Can you give me a massage after the walk?', 'massage me later', 'we can do a massage together',
    'ทั้งคืนเท่าไหร่คะ', 'ค้างคืนได้ไหม', 'อยู่ด้วยกันตลอดคืน', 'นอนค้างได้ไหม', 'ไปบ้านคุณได้ไหม', 'นวดให้หน่อยได้ไหม',
    '包夜多少钱', '可以过夜吗', '整晚陪我', '밤새 같이 있을래요?', '외박 가능해요?', 'Сколько на всю ночь?', 'Можно ночевать у тебя?', 'Останешься всю ночь?',
    'पूरी रात कितने?', 'sepanjang malam berapa?',
  ]
  for (const b of bad) it(`blocks "${b}"`, () => expect(isSolicitation(b)).toBe(true))
  const ok = [
    'Is the night market busy on Saturday?', 'What time does the night food walk end?', 'I take the overnight bus to Chiang Mai after',
    'We arrive on the overnight train from Hat Yai', 'Is the market open all night?', 'Is there an all-night market nearby?', 'Good night, see you tomorrow!',
    'My hotel is near BTS Asok, how far is the meeting point?', 'Is your place of meeting near the MRT?', 'Where is the meeting place?', 'I had a Thai massage yesterday',
    'tonight is fine', 'ตลาดเปิดทั้งคืนไหม', 'ตลาดนัดกลางคืน', '夜市几点开?', '야시장 몇 시에 열어요?', 'Ночной рынок открыт?', 'Работает всю ночь?',
    'I need to go to sleep early', 'I will go back to the hotel after the walk',
  ]
  for (const o of ok) it(`allows "${o}"`, () => expect(isSolicitation(o)).toBe(false))
})

describe('isAroundKring: booking or paying around Kring is not sent (audit 19 #8)', () => {
  const bad = [
    'Can I pay you the 1000 by PromptPay now to skip the Kring ticket?', 'can we skip the app?', 'book with you directly and avoid the fee', 'let me book you directly',
    'without the Kring ticket ok?', 'ไม่ต้องซื้อตั๋วได้ไหม', 'จองตรงกับคุณได้ไหม', '不用买票可以吗', '티켓 없이 가능해요?', 'Можно без билета?', 'boleh tanpa tiket?',
  ]
  for (const b of bad) it(`blocks "${b}"`, () => expect(isAroundKring(b)).toBe(true))
  const ok = [
    'Can I pay you cash at the place?', 'Do you take PromptPay at the meeting point?', 'I bought the ticket already', 'Is the ticket refundable?',
    'Can I pay outside the app in cash, at the place?', 'จ่ายเงินสดที่จุดนัดได้ไหม',
  ]
  for (const o of ok) it(`allows "${o}"`, () => expect(isAroundKring(o)).toBe(false))
})

describe('round 5: going around Kring', () => {
  it('blocks "no need for the app" and "pay you extra"', () => {
    for (const m of ['no need for the app, just meet me', "we don't need the app", 'I can pay you extra']) expect(isAroundKring(m)).toBe(true)
  })
  it('keeps normal questions', () => {
    for (const m of ['I need the app to check in?', 'pay at the place by cash ok?', 'is there extra food?']) expect(isAroundKring(m)).toBe(false)
  })
})
