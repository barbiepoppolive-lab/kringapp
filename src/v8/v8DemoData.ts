import { PROTO_IMG_16 } from './protoImages';
import type { V8ChatThread, V8Deal, V8FeedItem, V8HelloRequest, V8Person, V8StorySlide } from './v8Data';
import type { V8UserAccount } from './KringAppV8';

/* DEMO-ONLY example data (?demo=1). Loaded with a dynamic import so none of these
   example people, places or clips are in the production bundle.
   App demo v2 (13 Nov): matches the website. Places and new friends first; Bang Pu gulls is always the first Reel.
   At most 2 food items, never in the first 4 (see v8DemoData.test.ts). Example Kring Locals are AI faces, not real people. */

const M = `${import.meta.env.BASE_URL}media/demo/`;
const clip = (k: string) => ({ video: `${M}${k}.mp4`, poster: `${M}${k}.jpg`, img: `${M}${k}.jpg` });
const C = ['mint', 'ploy', 'nat', 'ton', 'aom', 'yui', 'minjun', 'arjun', 'lena', 'marcus', 'valeria', 'liam'] as const;
type CastId = (typeof C)[number];
const FACE = Object.fromEntries(C.map((k) => [k, `${M}faces/${k}.jpg`])) as Record<CastId, string>;
/* Example Kring cast (AI faces, never real people). Thai locals + travellers with their home city. */
const CAST: Record<CastId, { name: string; langs: string; langCodes: string[]; who: 'local' | 'traveller'; from: string }> = {
  mint: { name: 'มิ้นท์ Mint', langs: 'TH · EN', langCodes: ['TH', 'EN'], who: 'local', from: 'Bangkok' },
  ploy: { name: 'พลอย Ploy', langs: 'TH · EN · CN', langCodes: ['TH', 'EN', 'CN'], who: 'local', from: 'Ari' },
  nat: { name: 'นัท Nat', langs: 'TH · EN', langCodes: ['TH', 'EN'], who: 'local', from: 'Bangkok' },
  ton: { name: 'ต้น Ton', langs: 'TH · EN', langCodes: ['TH', 'EN'], who: 'local', from: 'Silom' },
  aom: { name: 'ออม Aom', langs: 'TH · EN', langCodes: ['TH', 'EN'], who: 'local', from: 'Bangkok' },
  yui: { name: 'Yui', langs: 'JP · EN', langCodes: ['JP', 'EN'], who: 'traveller', from: 'Osaka, Japan' },
  minjun: { name: 'Min-jun', langs: 'KR · EN', langCodes: ['KR', 'EN'], who: 'traveller', from: 'Seoul, Korea' },
  arjun: { name: 'Arjun', langs: 'EN · HI', langCodes: ['EN', 'HI'], who: 'traveller', from: 'Bengaluru, India' },
  lena: { name: 'Lena', langs: 'EN · DE', langCodes: ['EN'], who: 'traveller', from: 'Berlin, Germany' },
  marcus: { name: 'Marcus', langs: 'EN', langCodes: ['EN'], who: 'traveller', from: 'London, UK' },
  valeria: { name: 'Valeria', langs: 'EN · ES', langCodes: ['EN'], who: 'traveller', from: 'Mexico City' },
  liam: { name: 'Liam', langs: 'EN', langCodes: ['EN'], who: 'traveller', from: 'Sydney, Australia' },
};
const reel = (id: string, k: string, who: CastId, area: string, cap: string, likes: number, here = false): V8FeedItem => ({
  id, type: 'photo', ...clip(k), name: CAST[who].name, av: FACE[who], langs: CAST[who].langs, area, here, cap, likes, hiCount: 0,
});

export const INITIAL_FEED_ITEMS: V8FeedItem[] = [
  reel('reel-bangpu', 'bangpu', 'mint', 'Bang Pu', 'นกนางนวลบินมาเต็มสะพาน ไปกับเพื่อนใหม่ 3 คน 🕊 บางปู · ฟรี · BTS เคหะฯ', 128, true),
  reel('reel-lantern', 'lantern', 'minjun', 'Phloen Chit', 'ห้องโคมไฟกระจก ชั้น 58 ✨ Mirror room on the 58th floor, lights forever · Bangkok Reflection · BTS เพลินจิต', 96),
  reel('reel-dusit', 'dusit', 'lena', 'Sala Daeng', 'ป่าบนดาดฟ้า 🌿 A forest on a roof, all of Lumpini below · ดุสิต อรุณ · ฟรี · BTS ศาลาแดง', 84, true),
  reel('reel-fireworks', 'fireworks', 'nat', 'Rama VIII', 'พลุกับเลเซอร์เหนือสะพานพระราม 8 ทั้งฟ้าเป็นสีทอง 🎆 วิจิตรเจ้าพระยา · ท่าเรือพระอาทิตย์', 142),
  reel('reel-benjakitti', 'benjakitti', 'aom', 'Benjakitti', 'สะพานลอยฟ้าเหนือบึง ไฟเพิ่งติดตอนฟ้าชมพู 🌆 สวนเบญจกิติ · ฟรี · MRT ศูนย์สิริกิติ์', 77),
  reel('post-nam-yaowarat', 'yaowarat', 'yui', 'Yaowarat', 'เยาวราชตอนค่ำ 🔥 The auntie knew our order before we spoke · MRT วัดมังกร', 58),
  reel('reel-sohengtai', 'sohengtai', 'ton', 'Talad Noi', 'บ้านจีนอายุ 200 ปี มีสระดำน้ำกลางบ้าน! 🤿 โซวเฮงไถ่ ตลาดน้อย · MRT หัวลำโพง', 113),
  reel('reel-lumpini', 'lumpini', 'marcus', 'Lumpini', 'ตัวเงินตัวทอง 🦎 Giant lizards chilling by the running track · สวนลุมพินี · ฟรี · BTS ศาลาแดง', 91, true),
  reel('reel-erawan', 'erawan', 'ploy', 'Erawan', 'โดมกระจกสีในท้องช้างสามเศียร เงยหน้าแล้วว้าว 🐘 พิพิธภัณฑ์ช้างเอราวัณ · BTS ช้างเอราวัณ', 69),
  reel('reel-skypark', 'skypark', 'valeria', 'Old Town', 'สวนลอยฟ้า 🌅 A garden on an old rail bridge, sunset over the river · เจ้าพระยาสกายปาร์ค · ฟรี · MRT สนามไชย', 104),
];

/* Today: small group plans tied to the same places, in "new friends" wording. */
export const INITIAL_STORIES: Record<string, V8StorySlide[]> = {
  'Bang Pu': [
    { img: `${M}bangpu.jpg`, who: 'มิ้นท์ Mint · TH · EN', av: FACE.mint, cap: 'เย็นนี้ บางปู · 3 คนไปแล้ว · Mint, Arjun, Liam', time: '12m ago', expiresAtMidnight: true },
  ],
  'Phloen Chit': [
    { img: `${M}lantern.jpg`, who: 'พลอย Ploy · TH · EN · CN', av: FACE.ploy, cap: 'คืนนี้ ห้องโคมไฟ ชั้น 58 · 4 คนไปแล้ว · Ploy, Min-jun, Valeria', time: '25m ago', expiresAtMidnight: true },
  ],
  'Sala Daeng': [
    { img: `${M}dusit.jpg`, who: 'ต้น Ton · TH · EN', av: FACE.ton, cap: 'พรุ่งนี้เช้า สวนลุม แล้วขึ้นดาดฟ้าดุสิต อรุณ · Ton, Lena, Marcus', time: '40m ago', expiresAtMidnight: true },
  ],
  'Rama VIII': [
    { img: `${M}fireworks.jpg`, who: 'นัท Nat · TH · EN', av: FACE.nat, cap: 'คืนนี้ 2 ทุ่ม พลุวิจิตร ริมสะพานพระราม 8 · 5 คนไปแล้ว', time: '1h ago', expiresAtMidnight: true },
  ],
};

const person = (k: CastId, hook: string, tags: string, area: string, here: boolean, online = true): V8Person =>
  ({ id: `p-${k}`, name: CAST[k].name, langs: CAST[k].langs, langCodes: CAST[k].langCodes, who: CAST[k].who, online, verified: true, img: FACE[k], hook, tags, area, here });

export const DEMO_PEOPLE: V8Person[] = [
  person('mint', 'เย็นนี้ บางปู · 3 คนไปแล้ว', 'bang pu sunset gulls seaside photography', 'Bang Pu', true),
  person('arjun', 'From Bengaluru · Day 3 · Bang Pu tonight with new friends', 'photography sunsets river walks', 'Bang Pu', true),
  person('ploy', 'คืนนี้ ห้องโคมไฟ ชั้น 58 · 4 คนไปแล้ว', 'art light rooms views design erawan', 'Phloen Chit', true),
  person('minjun', 'From Seoul · Day 2 · lantern room tonight, 4 going', 'design night views film', 'Phloen Chit', true),
  person('ton', 'พรุ่งนี้เช้า วิ่งสวนลุม + ดาดฟ้าดุสิต อรุณ', 'running parks rooftops lumpini', 'Sala Daeng', true),
  person('lena', 'From Berlin · Day 4 · Lumpini morning walk with new friends', 'parks rooftops architecture', 'Sala Daeng', false),
  person('nat', 'คืนนี้ พลุวิจิตร พระราม 8 · 5 คนไปแล้ว', 'fireworks river sky park old town design', 'Rama VIII', true),
  person('marcus', 'From London · Day 5 · fireworks at Rama VIII tonight', 'music fireworks street style', 'Rama VIII', true),
  person('aom', 'เย็นนี้ สะพานเบญจกิติ ตอนฟ้าชมพู', 'parks sunsets fashion photography', 'Benjakitti', true),
  person('yui', 'From Osaka · Day 1 · film camera walks in Talad Noi', 'film photography old town', 'Talad Noi', false, false),
  person('valeria', 'From Mexico City · Day 3 · Sky Park at sunset, 3 going', 'sunsets river art', 'Old Town', true),
  person('liam', 'From Sydney · Day 6 · joining Bang Pu with new friends', 'seaside sunsets running', 'Bang Pu', false),
];

/* Partner perks (examples): places and experiences only, no food or drink. */
export const INITIAL_DEALS: V8Deal[] = [
  {
    id: 'd1', cat: 'fun', tag: '2 passes · Light room', title: 'Lantern mirror room, 58F · 2 entries',
    venue: 'Bangkok Reflection', area: 'Phloen Chit', now: 600, was: 900, claimed: 19, leftCount: 12,
    validWindow: 'Tonight · 6–9pm', img: `${M}lantern.jpg`, code: 'KR-4821',
  },
  {
    id: 'd2', cat: 'fun', tag: '2 passes · Museum', title: 'Erawan Museum · stained-glass dome · 2 entries',
    venue: 'Erawan Museum', area: 'Samut Prakan', now: 400, was: 600, claimed: 11, leftCount: 8,
    validWindow: 'Today · 9am–6pm', img: `${M}erawan.jpg`, code: 'KR-7194',
  },
  {
    id: 'd3', cat: 'classes', tag: 'Studio class · Pottery', title: 'Riverside pottery wheel class for 2',
    venue: 'Riverside studio', area: 'Talad Noi', now: 590, was: 900, claimed: 9, leftCount: 6,
    validWindow: 'Today · 1–4pm', img: `${M}sohengtai.jpg`, code: 'KR-9203',
  },
];

export const DEMO_REQUESTS: V8HelloRequest[] = [
  {
    id: 'req-mint', name: 'มิ้นท์ Mint', meta: 'Speaks TH · EN · 14m ago', img: FACE.mint,
    msg: 'เย็นนี้ไปบางปูกัน 3 คนแล้ว ไปด้วยกันไหม · Going to Bang Pu this evening, 3 of us so far. Want to join?', verified: true,
  },
  {
    id: 'req-marcus', name: 'Marcus', meta: 'Traveller from London · Speaks EN · 1h ago', img: FACE.marcus,
    msg: 'Fireworks at Rama VIII tonight, 5 new friends going. Nat says the pier side has the best view!', verified: true,
  },
];

export const DEMO_THREADS: V8ChatThread[] = [
  {
    id: 'thread-bangpu-plan', personId: 'p-mint', name: 'Bang Pu this evening · 4', avatar: FACE.mint,
    langs: 'TH · EN · HI', verified: false, lastPreview: 'The gulls come right up to the rail at 5pm.', timeLabel: '2m', unread: true,
    plan: { title: 'Today · 16:30 · Mint, Arjun, Liam + you', venue: 'Bang Pu pier', area: 'BTS Kheha', time: '16:30' },
    messages: [
      { id: 'm1', sender: 'me', text: 'Count me in for Bang Pu this evening 👋', createdAt: '13:40' },
      { id: 'm2', sender: 'them', text: 'เจอกันที่ BTS เคหะฯ 4 โมงครึ่ง แล้วนั่งสองแถวไปด้วยกัน', translation: 'Let’s gather at BTS Kheha at 4:30, then take a songthaew together.', createdAt: '13:45' },
      { id: 'm3', sender: 'them', text: 'นกนางนวลบินมาถึงราวสะพานตอน 5 โมง', translation: 'The gulls come right up to the rail at 5pm.', createdAt: '13:46' },
    ],
  },
  {
    id: 'thread-fireworks-plan', personId: 'p-nat', name: 'Fireworks at Rama VIII · 6', avatar: FACE.nat, langs: 'TH · EN', verified: true,
    lastPreview: 'The pier by Phra Sumen Fort has the best view at 8pm!', timeLabel: '3h', unread: false,
    messages: [
      { id: 'm-nat-1', sender: 'me', text: 'Where is the best spot for the Rama VIII fireworks?', createdAt: '10:15' },
      { id: 'm-nat-2', sender: 'them', text: 'The pier by Phra Sumen Fort has the best view at 8pm!', createdAt: '10:22' },
    ],
  },
];


/** Demo-only signed-in member shown with ?demo=1. */
export const DEMO_USER_PROFILE: V8UserAccount = {
  id: 'me-rohan',
  name: 'Rohan',
  provider: 'Google',
  role: 'traveller',
  tripDay: 3,
  tripTotalDays: 6,
  langs: 'EN · HI',
  hook: 'river walks & sunsets',
  avatar: PROTO_IMG_16,
  currency: 'INR',
  level: 'anchan',
  postsCount: 2,
  questionsAnsweredToday: 2,
  streakDays: 4,
  freeSkipsLeft: 2,
};
