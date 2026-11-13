import type { V8Lang } from './v8I18n';

export interface V8PublicEvent {
  id: string;
  tag: string;
  tagByLang: Record<V8Lang, string>;
  name: string;
  nameByLang: Record<V8Lang, string>;
  whenWhere: string;
  whenWhereByLang: Record<V8Lang, string>;
  area: string;
  costThb: number; // 0 = Free, all <= 500 THB
  status: 'Confirmed' | 'Active';
  bgImage?: string;
  bgGradient: string;
  /** Bangkok time after which the event is no longer shown (dated events only). */
  endsAt?: string;
}

/**
 * Curated real public events in Bangkok from research/events/kring_events_v1.csv ( and E1–E3).
 * Rules enforced:
 * - Only rows with status Confirmed or Active
 * - Only events that are free (0 THB) or under 500 THB
 * - Zero alcohol venues, zero temples
 * - No library / stock photos (founder 8 Nov): colour cards only until venues send their own photos
 * - Dated events carry endsAt and disappear after it (A-04)
 */
export const V8_PUBLIC_EVENTS: V8PublicEvent[] = [
  {
    id: 'ev-jodd-fairs',
    tag: 'Night market',
    tagByLang: {
      en: 'Night market',
      th: 'ตลาดนัดกลางคืน',
      zh: '夜市',
      hi: 'नाइट मार्केट',
      ja: 'ナイトマーケット',
      ko: '야시장',
    },
    name: 'Jodd Fairs Ratchada',
    nameByLang: {
      en: 'Jodd Fairs Ratchada',
      th: 'จ๊อดแฟร์ รัชดา',
      zh: 'Jodd Fairs 拉差达夜市',
      hi: 'Jodd Fairs राचादा',
      ja: 'ジョッドフェアーズ・ラチャダー',
      ko: '쩟페어 라차다 야시장',
    },
    whenWhere: 'Daily 5pm–1am · MRT Cultural Centre',
    whenWhereByLang: {
      en: 'Daily 5pm–1am · MRT Cultural Centre',
      th: 'ทุกวัน 17:00–01:00 · MRT ศูนย์วัฒนธรรม',
      zh: '每天 17:00–01:00 · MRT 文化中心站',
      hi: 'रोज़ शाम 5–रात 1 · MRT कल्चरल सेंटर',
      ja: '毎日 17:00–01:00 · MRTタイ文化センター駅',
      ko: '매일 17:00–01:00 · MRT 문화센터역',
    },
    area: 'Ratchada',
    costThb: 0,
    status: 'Active',
    bgGradient: 'linear-gradient(155deg, #5A2A5E 0%, #171543 100%)',
  },
  {
    id: 'ev-lumpini-run',
    tag: 'Run club',
    tagByLang: {
      en: 'Run club',
      th: 'ชมรมวิ่ง',
      zh: '跑步俱乐部',
      hi: 'रन क्लब',
      ja: 'ランクラブ',
      ko: '런 클럽',
    },
    name: 'Lumpini Running Club',
    nameByLang: {
      en: 'Lumpini Running Club',
      th: 'Lumpini Running Club',
      zh: '伦披尼跑步俱乐部',
      hi: 'लुम्पिनी रनिंग क्लब',
      ja: 'ルンピニー・ランニングクラブ',
      ko: '룸피니 러닝 클럽',
    },
    whenWhere: 'Tue & Thu 5:45pm · Gate 4',
    whenWhereByLang: {
      en: 'Tue & Thu 5:45pm · Gate 4',
      th: 'อ. และ พฤ. 17:45 · ประตู 4 สวนลุมพินี',
      zh: '周二及周四 17:45 · 伦披尼公园 4 号门',
      hi: 'मंगल और गुरु शाम 5:45 · गेट 4',
      ja: '火・木 17:45 · ルンピニー公園ゲート4',
      ko: '화·목 17:45 · 룸피니 공원 게이트 4',
    },
    area: 'Silom',
    costThb: 0,
    status: 'Confirmed',
    bgGradient: 'linear-gradient(155deg, #282B78 0%, #161845 100%)',
  },
  {
    id: 'ev-lang-exchange',
    tag: 'Language exchange',
    tagByLang: {
      en: 'Language exchange',
      th: 'แลกเปลี่ยนภาษา',
      zh: '语言交流',
      hi: 'भाषा एक्सचेंज',
      ja: '言語交換',
      ko: '언어 교환',
    },
    name: 'Sunday Language Exchange',
    nameByLang: {
      en: 'Sunday Language Exchange',
      th: 'แลกเปลี่ยนภาษาวันอาทิตย์',
      zh: '周日语言文化交流',
      hi: 'संडे लैंग्वेज एक्सचेंज',
      ja: '日曜ランゲージエクスチェンジ',
      ko: '일요일 언어교환 모임',
    },
    whenWhere: 'Sundays 2pm · BTS Chong Nonsi Exit 2',
    whenWhereByLang: {
      en: 'Sundays 2pm · BTS Chong Nonsi Exit 2',
      th: 'อาทิตย์ 14:00 · BTS ช่องนนทรี ทางออก 2',
      zh: '周日 14:00 · BTS 钟那席站 2 号口',
      hi: 'रविवार दोपहर 2 · BTS चोंग नोनसी गेट 2',
      ja: '日曜 14:00 · BTSチョンノンシー駅2番出口',
      ko: '일요일 14:00 · BTS 총논시역 2번 출구',
    },
    area: 'Silom',
    costThb: 40,
    status: 'Confirmed',
    bgGradient: 'linear-gradient(155deg, #1E3A5F 0%, #141842 100%)',
  },
  {
    id: 'ev-tk-boardgames',
    tag: 'Board games',
    tagByLang: {
      en: 'Board games',
      th: 'บอร์ดเกม',
      zh: '桌游聚会',
      hi: 'बोर्ड गेम्स',
      ja: 'ボードゲーム',
      ko: '보드게임',
    },
    name: 'TK Boardgame Club',
    nameByLang: {
      en: 'TK Boardgame Club',
      th: 'ชมรมบอร์ดเกม TK Park',
      zh: 'TK Park 桌游俱乐部',
      hi: 'TK बोर्डगेम क्लब',
      ja: 'TKパーク・ボードゲーム会',
      ko: 'TK 파크 보드게임 클럽',
    },
    whenWhere: '2nd Sun 11am–7pm · TK Park CentralWorld',
    whenWhereByLang: {
      en: '2nd Sun 11am–7pm · TK Park CentralWorld',
      th: 'อาทิตย์ที่ 2 ของเดือน 11:00–19:00 · TK Park เซ็นทรัลเวิลด์',
      zh: '每月第二个周日 11:00–19:00 · CentralWorld TK Park',
      hi: 'दूसरा रविवार 11am–7pm · TK पार्क सेंट्रलवर्ल्ड',
      ja: '第2日曜 11:00–19:00 · セントラルワールド TK Park',
      ko: '둘째 일요일 11:00–19:00 · 센트럴월드 TK Park',
    },
    area: 'Siam',
    costThb: 0,
    status: 'Confirmed',
    bgGradient: 'linear-gradient(155deg, #2A246B 0%, #15163F 100%)',
  },
  {
    id: 'ev-think-fest-ari',
    endsAt: '2026-11-29T23:59:00+07:00',
    tag: 'Neighbourhood fest',
    tagByLang: {
      en: 'Neighbourhood fest',
      th: 'เทศกาลย่านอารีย์',
      zh: '街区艺术节',
      hi: 'लोकल फ़ेस्टिवल',
      ja: 'エリアフェス',
      ko: '동네 페스티벌',
    },
    name: 'Think Fest Ari',
    nameByLang: {
      en: 'Think Fest Ari',
      th: 'Think Fest อารีย์',
      zh: 'Think Fest 阿里街区节',
      hi: 'Think Fest आरी',
      ja: 'Think Fest アーリー',
      ko: 'Think Fest 아리',
    },
    whenWhere: '27–29 Nov · BTS Ari',
    whenWhereByLang: {
      en: '27–29 Nov · BTS Ari',
      th: '27–29 พ.ย. · BTS อารีย์',
      zh: '11 月 27–29 日 · BTS 阿里站',
      hi: '27–29 नवंबर · BTS आरी',
      ja: '11月27–29日 · BTSアーリー駅',
      ko: '11월 27–29일 · BTS 아리역',
    },
    area: 'Ari',
    costThb: 0,
    status: 'Confirmed',
    bgGradient: 'linear-gradient(155deg, #35235E 0%, #14163D 100%)',
  },
  {
    id: 'ev-wholesome-books',
    endsAt: '2026-11-21T18:00:00+07:00',
    tag: 'Book club',
    tagByLang: {
      en: 'Book club',
      th: 'ชมรมหนังสือ',
      zh: '双语读书会',
      hi: 'बुक क्लब',
      ja: 'ブッククラブ',
      ko: '북클럽',
    },
    name: 'theWHOLESOME Book Club',
    nameByLang: {
      en: 'theWHOLESOME Book Club',
      th: 'ชมรมหนังสือสองภาษา theWHOLESOME',
      zh: 'theWHOLESOME 双语读书会',
      hi: 'theWHOLESOME बुक क्लब',
      ja: 'theWHOLESOME バイリンガル読書会',
      ko: 'theWHOLESOME 이중언어 북클럽',
    },
    whenWhere: 'Sat 21 Nov 2pm · theCOMMONS Thonglor',
    whenWhereByLang: {
      en: 'Sat 21 Nov 2pm · theCOMMONS Thonglor',
      th: 'ส. 21 พ.ย. 14:00 · theCOMMONS ทองหล่อ',
      zh: '11 月 21 日周六 14:00 · theCOMMONS 通罗',
      hi: 'शनि 21 नवंबर दोपहर 2 · theCOMMONS थोंगलोर',
      ja: '11月21日(土) 14:00 · theCOMMONS トンロー',
      ko: '11월 21일(토) 14:00 · 더커먼스 통로',
    },
    area: 'Thonglor',
    costThb: 329,
    status: 'Confirmed',
    bgGradient: 'linear-gradient(155deg, #2D2A6E 0%, #151742 100%)',
  },
  {
    id: 'ev-song-wat',
    endsAt: '2026-11-22T23:59:00+07:00',
    tag: 'Street festival',
    tagByLang: {
      en: 'Street festival',
      th: 'เทศกาลถนนทรงวาด',
      zh: '老街文化节',
      hi: 'स्ट्रीट फ़ेस्टिवल',
      ja: 'ストリートフェス',
      ko: '스트리트 페스티벌',
    },
    name: 'Song Wat Week',
    nameByLang: {
      en: 'Song Wat Week',
      th: 'Song Wat Week ถนนทรงวาด',
      zh: '嵩越路文化周 (Song Wat Week)',
      hi: 'सोंग वात वीक',
      ja: 'ソンワット・ウィーク',
      ko: '송왓 위크',
    },
    whenWhere: '19–22 Nov · Song Wat Road, Talat Noi',
    whenWhereByLang: {
      en: '19–22 Nov · Song Wat Road, Talat Noi',
      th: '19–22 พ.ย. · ถนนทรงวาด ตลาดน้อย',
      zh: '11 月 19–22 日 · 哒叻仔嵩越路',
      hi: '19–22 नवंबर · सोंग वात रोड, तलात नोई',
      ja: '11月19–22日 · タラートノイ・ソンワット通り',
      ko: '11월 19–22일 · 탈랏노이 송왓 로드',
    },
    area: 'Talad Noi',
    costThb: 0,
    status: 'Confirmed',
    bgGradient: 'linear-gradient(155deg, #3A225D 0%, #15163F 100%)',
  },
];

/** Events still on (dated ones vanish after endsAt) in the chosen area ('All Bangkok' = every area). */
export function v8LiveEvents(area: string, now: number = Date.now()): V8PublicEvent[] {
  return V8_PUBLIC_EVENTS.filter((ev) => (!ev.endsAt || Date.parse(ev.endsAt) > now) && (area === 'All Bangkok' || ev.area === area));
}
