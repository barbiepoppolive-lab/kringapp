/**
 * Retention 10 (26 Nov 2026) — data + words. Server: m219–m224 (see docs/retention10/AUDIT.md).
 * One language per screen: Thai members see Thai only, everyone else English (other app languages fall back to English).
 * No push / LINE / email from anything here: in-app only.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { v5Client } from './v5Live';

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const c = await v5Client();
  const res = await c.rpc(fn, args);
  if (res.error) throw res.error;
  return res.data as T;
}
export const errCode = (e: unknown): string => {
  const m = String((e as { message?: string })?.message ?? e ?? '').match(/KR8_([A-Z_0-9]+)/);
  return m ? m[1] : 'UNKNOWN';
};

// ───────── shapes ─────────
export interface R10Reel {
  id: string; author_id: string; name: string; verified?: boolean; poster_path: string; video_path: string; body?: string | null; at: string;
  likes: number; liked: boolean; saved: boolean; mine: boolean; place?: { en: string | null; th: string | null } | null; day?: string;
}
export interface WelcomeTask { id: 'welcome'; goal: number; rings: number; liked: number; done: boolean; claimed: boolean; reels: R10Reel[] }
export interface B5Task { id: 'b5'; rings: number; open: boolean; opens_at: string; closes_at: string; clip: string | null; status: string | null; done: boolean | null; claimed: boolean }
export interface TaskExtra { on: boolean; gated?: boolean; day?: string; cap_left?: number; welcome?: WelcomeTask | null; b5?: B5Task }
export interface B5Row { day: string; open: boolean; n_today: number; n: number; items: R10Reel[] }
export interface FollowSuggest { eligible: boolean; following?: number; area?: string; people?: { user_id: string; first_name: string; photo: string | null; area: string; reels: number }[] }
export interface ProfileOnly { reels: { id: string; poster_path: string; reason: string | null; at: string }[]; examples: R10Reel[] }
export interface OpenQ { user_id: string; on: boolean; q: string | null; thread: string | null }
export interface Bestie {
  id: string; status: 'pending' | 'active'; mine_invite: boolean; partner: { user_id: string; first_name: string; photo: string | null };
  started_on: string | null; streak: { count: number; alive: boolean; me_today: boolean; them_today: boolean } | null;
  nudged_me: boolean; nudge_new: boolean; i_nudged: boolean;
}
export interface BestieState { day: string; items: Bestie[] }
export interface BestieOf { count: number; partner: { user_id: string; first_name: string } | null }
export interface FairPlay {
  user_id: string; first_name: string; is_me: boolean; as_of: string; on_board: boolean; rings: number; rank: number | null;
  reels_total: number; reel_count: number; more_reels: number;
  likes_verified: { n: number; visitors: number; rings: number; who: { user_id: string | null; name: string | null; n: number; visitor: boolean }[] };
  likes_newer: { n: number; rings: number; day_cap: number; who: { user_id: string | null; name: string | null; n: number }[] };
  saves: { n: number; rings: number };
  opens: { n: number; rings: number; by_app: Record<string, number>; over_cap: number; not_counted: Record<string, number>; day_cap: number };
  rules_adjust: number; tasks: number; ask_opens: number; ask_awards?: number; daily_top?: number; daily_climb?: number; invites: number; invites_shown: boolean; lag: number;
  weights: { like: number; save: number; open: number; mult: number };
  days: { day: string; reels: number; tasks: number; bonus?: number; invites: number }[];
}
export interface Newcomers {
  week_start: string; ends_at: string; mine_new: boolean; top: number;
  rows: { rank: number; user_id: string; first_name: string; photo: string | null; rings: number; me: boolean }[];
  me: { rank: number; rings: number; next: { rank: number; need: number } | null } | null;
}

// ───────── calls ─────────
export const taskExtra = () => call<TaskExtra>('kr8_task_extra');
export const taskExtraClaim = (t: 'welcome' | 'b5') => call<TaskExtra>('kr8_task_extra_claim', { p_task: t });
export const b5Row = () => call<B5Row>('kr8_b5_row');
export const b5Mark = (post: string) => call<{ post_id: string }>('kr8_b5_mark', { p_post: post });
export const followSuggest = () => call<FollowSuggest>('kr8_onb_follow_suggest', { p_limit: 4 });
export const myProfileOnly = () => call<ProfileOnly>('kr8_my_profile_only');
export const openQOf = (user: string) => call<OpenQ>('kr8_open_q_of', { p_user: user });
export const setOpenQ = (q: string, on: boolean) => call<{ q: string | null; on: boolean }>('kr8_set_open_q', { p_q: q, p_on: on });
export const openQAnswer = (to: string, answer: string) => call<string>('kr8_open_q_answer', { p_to: to, p_answer: answer });
export const bestieState = () => call<BestieState>('kr8_bestie_state');
export const bestieInvite = (user: string) => call<string>('kr8_bestie_invite', { p_user: user });
export const bestieAct = (id: string, action: 'accept' | 'decline' | 'end' | 'restart') => call<BestieState>('kr8_bestie_act', { p_id: id, p_action: action });
export const bestieNudge = (id: string) => call<BestieState>('kr8_bestie_nudge', { p_id: id });
export const bestieSeen = () => call<void>('kr8_bestie_seen');
export const bestieOf = (user: string) => call<BestieOf[]>('kr8_bestie_of', { p_user: user });
export const fairPlay = (user: string) => call<FairPlay>('kr8_fair_play', { p_user: user });
export interface MemberPhoto { id: string; photo: string; body: string; at: string; likes: number; feed: boolean; reason: string | null; place: { en: string | null; th: string | null } | null }
export const createPhoto = (photo: string, area: string | null, body: string | null) => call<string>('kr8_create_photo', { p_photo: photo, p_area: area, p_body: body, p_place: null });
export const memberPhotos = (user: string) => call<MemberPhoto[]>('kr8_member_photos', { p_user: user });
export interface AskAward { answer_id: string; kind: 'helpful' | 'funny'; day: string }
export const askAwardsRecent = () => call<AskAward[]>('kr8_ask_awards_recent');
/** m228: today's top 3 + biggest climber (cache, refreshed every 5 min) */
export interface DailyPick { rank?: number; member_id: string; rings: number; bonus: number }
export interface DailyTop { on: boolean; state?: 'live' | 'won'; day?: string; min?: number; top?: DailyPick[]; climber?: DailyPick | null;
  who?: Record<string, { first_name: string; photo: string | null; me: boolean }>; bonus?: number[]; climb?: number }
export const dailyTop = () => call<DailyTop>('kr8_daily_top');
export const rulesCfg = () => call<Record<string, number>>('kr8_rings_rules');
export const newcomers = () => call<Newcomers>('kr8_newcomers_board', { p_limit: 10 });

// ───────── small shared stores (one read, many readers) ─────────
function store<T>(load: () => Promise<T>) {
  let cur: T | null = null; let inflight: Promise<void> | null = null; let gen = 0;
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  const refresh = (): Promise<void> => {
    if (inflight) return inflight;
    const g = gen;
    inflight = load().then((v) => { if (g === gen) { cur = v; emit(); } }).catch(() => undefined).finally(() => { inflight = null; });
    return inflight;
  };
  const set = (v: T | null) => { cur = v; emit(); };
  const reset = () => { gen += 1; cur = null; emit(); };
  const use = (on: boolean): T | null => {
    const v = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => cur, () => null);
    useEffect(() => { if (on && cur === null) void refresh(); }, [on]);
    return on ? v : null;
  };
  return { refresh, set, reset, use, get: () => cur };
}
export const extraStore = store(taskExtra);
export const b5Store = store(b5Row);
export const poStore = store(myProfileOnly);
export const bestieStore = store(bestieState);
export const awardStore = store(askAwardsRecent);
export const dailyStore = store(dailyTop);
export const rulesStore = store(rulesCfg);
/** r12 (m230): last closed week's paid seats (rank → Rings, ฿) from the real weekly prizes — the How to win hero */
export interface LastSeats { week: string; seats: { rank: number; rings: number; amount: number }[] }
export const seatsStore = store(() => call<LastSeats | null>('kr8_last_week_seats'));
/** r12: the How to win sheet (board ⓘ) is mounted once in the app and opened by this event */
export const HTW_OPEN = 'kr8:htw';
export function openHtw(from?: string) { try { window.dispatchEvent(new CustomEvent(HTW_OPEN, { detail: from || 'x' })); } catch { /* old browser */ } }
export interface HtwHero { perDay: number; week: number; won: { rank: number; amount: number } | null; next: { rank: number; amount: number; opens: number } | null; short: { rank: number; need: number } | null }
/** r12: the hero sentence, from the live task cap and last week's real seats. Pure (tested). */
export function htwHero(perDay: number, seats: LastSeats['seats'], open: number): HtwHero {
  const week = perDay * 7;
  const s = [...seats].filter((x) => x.rings > 0).sort((a, b) => a.rank - b.rank);
  if (!s.length) return { perDay, week, won: null, next: null, short: null };
  const won = s.find((x) => x.rings <= week) || null;
  if (!won) { const last = s[s.length - 1]; return { perDay, week, won: null, next: null, short: { rank: last.rank, need: last.rings - week + 1 } }; }
  const up = s.find((x) => x.rank === won.rank - 1);
  const next = up && open > 0 ? { rank: up.rank, amount: up.amount, opens: Math.ceil((up.rings + 1 - week) / open) } : null;
  return { perDay, week, won: { rank: won.rank, amount: won.amount }, next, short: null };
}
/** m228: the "How it works" rules sheet (board ⓘ, How to win, Ask BKK) is mounted once in the app and opened by this event */
export const HOW_OPEN = 'kr8:r10-how';
export function openHowItWorks(from?: string) { try { window.dispatchEvent(new CustomEvent(HOW_OPEN, { detail: from || '' })); } catch { /* old browser */ } }
const photoStores = new Map<string, ReturnType<typeof store<MemberPhoto[]>>>();
export function photoStore(user: string) { let st = photoStores.get(user); if (!st) { st = store(() => memberPhotos(user)); photoStores.set(user, st); } return st; }
/** the kindness check before an Ask BKK answer is posted (light: insults only, never blocks) */
const RUDE = [/\b(idiot|stupid|dumb|moron|loser|ugly|shut up|bitch|f+u+c+k+|shit|wtf|stfu|hate you)\b/i, /(ควาย|โง่|กาก|เหี้ย|สัส|อีดอก|ตอแหล|ส้นตีน|ไอ้บ้า|อีบ้า|เลวมาก|หน้าโง่)/];
export const askRude = (t: string) => RUDE.some((r) => r.test(t || ''));
export const AWARD_MIN = 40;

if (typeof window !== 'undefined') {
  let t = 0;
  // a like / Reel post may finish the welcome task or a 5pm clip: re-read after a moment (same poke the first-visit steps use)
  window.addEventListener('kr8-onb-poke', () => {
    window.clearTimeout(t);
    t = window.setTimeout(() => { if (extraStore.get()) void extraStore.refresh(); }, 700);
  });
}

// ───────── Bangkok at 5: the camera is opened from the banner / task; the Reel posted right after is marked ─────────
let b5ArmedAt = 0;
export const b5Arm = () => { b5ArmedAt = Date.now(); };
export const b5Armed = () => Date.now() - b5ArmedAt < 40 * 60_000;
/** called after every Reel post; marks it only when the member came from the 5pm banner / task */
export async function b5AfterPost(postId: string): Promise<boolean> {
  if (!postId || !b5Armed()) return false;
  b5ArmedAt = 0;
  try { await b5Mark(postId); void extraStore.refresh(); void b5Store.refresh(); return true; } catch { return false; }
}
const B5_HIDE = 'kr8_b5_hide';
export function b5Hidden(day: string): boolean { try { return localStorage.getItem(B5_HIDE) === day; } catch { return false; } }
export function b5Hide(day: string) { try { localStorage.setItem(B5_HIDE, day); } catch { /* private mode */ } }

// ───────── words ─────────
const EN = {
  rings: '+{0} Rings', ring1: '+1 Ring', claim: 'Claim', done: 'Done', go: 'Go', newTag: 'NEW', skip: 'Skip', close: 'Close', save: 'Save',
  // photo task (m226)
  phRow: 'Today’s photo', phRowS: 'Show your vibe · +3 Rings', phTitle: 'Today’s photo', phLine: 'Show your vibe, your face is optional',
  exBack: 'Your back', exSide: 'From the side', exOutfit: 'Your outfit', phRules: 'A real Bangkok spot · no screenshots, no food-only, no photos from the internet',
  phTake: 'Take a photo', phRetake: 'Retake', phCap: 'Where are you? (optional)', phPost: 'Post · up to +5 Rings', phPosted: 'On your profile · Rings added to today’s tasks',
  phDay: 'You posted today’s photo · see you tomorrow', phBad: 'That photo didn’t work. Try another one.', phFace: 'Do the 5-second face check first',
  // Ask BKK awards (m227)
  awHelpful: 'Most helpful', awFunny: 'Funniest', awNudge: 'Add your why to be in the running for today’s award', awOk: 'In the running for today’s award',
  kindT: 'Want to rephrase?', kindS: 'Kind words get more replies.', kindEdit: 'Edit', kindPost: 'Post anyway', fpAward: 'Ask BKK award',
  // leaderboard orb
  orbTo: '{0} to #{1}', orbFloor: '{0} to a prize seat', orbTop: 'Top of the week', orbJoin: 'Join the board', orbFace: 'Face check', orbLabel: 'Weekly board', orbNone: 'Post to join',
  // 1
  welcome3: 'Welcome {0} new Locals', welcome1: 'Welcome a new Local', welcomeSub: 'Their first Reels on Kring · a like says hi',
  ofLikes: '{0} of 5 likes', watchLike: 'Watch and like', welcomeDone: 'Thanks for the welcome ✓',
  // 5
  b5: 'Bangkok at 5', b5Banner: 'It’s 5pm in Bangkok · show us where you are', b5How: '10 seconds · no face needed · no editing',
  b5Post: 'Post my 5pm clip', b5Until: 'Open until 7pm', b5Opens: 'Opens at 5pm', b5Review: 'In review · it shows here once Kring approves it',
  b5Hidden: 'Not shown this time · try again tomorrow at 5', b5N: '{0} people posted their 5pm today', b5N1: '1 person posted their 5pm today',
  b5Yday: 'Yesterday’s 5pm in Bangkok', b5None: 'Be the first to post your 5pm today', b5TaskSub: 'A 10-second clip between 5 and 7pm', b5Tile: '5pm',
  // 3
  f3Row: 'Follow 3 people', f3Title: 'Follow 3 people in Bangkok', f3Near: 'Follow 3 people near {0}', f3Sub: 'They’ll see you followed them.',
  nReels: '{0} Reels', nReel1: '1 Reel', follow: 'Follow', following: 'Following', f3Prog: '{0} of 3 · follow one more', f3Done: 'Done · {0} followed',
  // 4
  poTag: 'On your profile', poTitle: 'Live on your profile', poSub: 'Not on the main feed yet. Your followers can see it and like it, and it still counts for the weekly board.',
  poWhy: 'Why it’s not on the main feed yet', poExamples: 'Clips that made the main feed', poPost: 'Post another clip', poWatch: 'Watch my clip',
  // 6
  asks: '{0} asks', answerStarts: 'Your answer starts the chat.', yourAnswer: 'Your answer', sendAnswer: 'Send answer',
  noHi: 'No “hi” messages. {0} sees your answer and chooses to reply.', answerFirst: 'Answer their question to start the chat',
  oqTitle: 'Opening question', oqSub: 'New chats with you start by answering it.', oqOn: 'On', oqOff: 'Off', oqPh: 'Ask something fun…',
  oqLine: 'Opening question · {0}', oqSaved: 'Saved', oqBad: 'Keep it short, with no links, numbers or handles.',
  // 7
  opA: 'What’s the one thing I can’t miss at {0}?', opB: 'This or that: {0} or somewhere nearby?', opC: 'Two truths and a lie about {0}, go!',
  opA0: 'What’s the one thing I can’t miss here?', opB0: 'This or that: here or somewhere nearby?', opC0: 'Two truths and a lie about this place, go!',
  // 8
  bs: 'Bestie streak', bsDays: '{0} days together', bsDay1: '1 day together', bsToday: 'Today, both of you need one task done', bsDone: 'Done', bsNot: 'Not yet',
  bsNudge: 'Nudge {0}', bsNudged: 'Nudged ✓', bsNudgedMe: '{0} nudged you · do one task today', bsStart: 'Start a bestie streak', bsSent: 'Invite sent',
  bsInvited: '{0} wants a bestie streak with you', bsAccept: 'Accept', bsLater: 'Not now', bsBroke: 'The streak broke · start again', bsWait: 'Waiting for {0}',
  bsEnd: 'End streak', bsMutual: 'For friends who follow each other', bsFull: 'You already have 3 streaks', bsNone: 'No streak yet',
  bsWith: '{0} days with {1}', bsCount: 'Bestie streak · {0} days', bsMe: 'Bestie streak · {0} days', bsNew: 'New', bsNoRings: 'No Rings for streaks, just bragging rights',
  // 9
  fpTitle: 'How {0} got {1} Rings', fpTitleMe: 'How you got {0} Rings', fpRank: '#{0} this week · open to everyone', fpOpen: 'Open to everyone',
  fpLikes: 'Likes from members', fpVer: '{0} face-verified members', fpVis: 'visitors count double', fpNew: '{0} from newer members (max {1} a day)', fpWho: 'see who', fpHide: 'hide',
  fpSaves: 'Saves', fpOpens: 'Link opens from outside', fpOther: 'Other apps', fpNot: 'Not counted: {0}', fpOver: 'over the {0} a day limit',
  why_robot: 'link previews and robots', why_line: 'LINE’s own link preview', why_repeat: 'same person opened again', why_own: 'opened on their own phone',
  why_same_phone: 'same phone as the poster', why_pending: 'opened too briefly', why_other: 'other checks',
  fpTasks: 'Daily tasks', fpAsk: 'Ask BKK link opens', fpInv: 'Friends invited (face-checked)', fpRules: 'Fair-play rules',
  fpRulesSub: 'Repeat likes from one person count half after 3, daily caps, farming cuts, rounding', fpLag: 'Arrived in the last minute',
  fpDays: 'See day by day', fpDaysHide: 'Hide days', fpProfile: 'View profile', fpMember: 'A member', fpSame: 'Same math for everyone.',
  fpShare: 'Share my Reel · each open +5', fpNone: 'No Rings yet this week.', fpReels: 'Best Reel of each day counts', fpMore: '{0} more Reels not counted (one per day counts)', fpMore1: '1 more Reel not counted (one per day counts)',
  dReels: 'Reels', dTasks: 'Tasks', dInv: 'Friends',
  // 10
  ncTitle: 'Newcomers league', ncSub: 'Only members who joined this week · top 3 get the Rising Local tag', ncTo: '{0} Rings to #{1}', ncTop: 'You’re #1 of the newcomers',
  // m228 daily bonuses
  dtTitle: 'Today’s top 3', dtSub: 'bonus at 23:59', dtEmpty: 'Be today’s top 3: earn {0} Rings', dtWon: 'Won last night', dtWonSub: 'next bonus at 23:59',
  dtYou: 'You', fpTop: 'Daily top 3 bonus', fpClimb: 'Biggest climber', dBonus: 'Bonus',
  hwTitle: 'Daily bonuses', hwSub: 'Extra Rings for the weekly board, every night',
  hwTopT: 'Today’s top 3: +{0}, +{1}, +{2}', hwTopS: 'Most Rings earned today, counted at 23:59. Needs a face check and {3}+ Rings that day. If tied, whoever got there first wins.',
  hwClimbT: 'Biggest climber: +{0}', hwClimbS: 'Beat your own usual day by the most. Needs a face check and {1}+ Rings that day.',
  hwAskT: 'Ask BKK awards: +5 each at 8pm', hwAskS: 'Most helpful (❤️💯) and Funniest (😂). Answers of 40+ characters, 2+ votes from face-checked members. No votes for yourself. Max 2 wins a week.',
  hwFpT: 'Every bonus shows in Fair play', hwFpS: 'Tap anyone on the board to see where their Rings came from.',
  hwWin: 'How to win the week', hwOk: 'Got it', hwLink: 'Daily bonuses and awards', askAwLine: 'Best answers win +5 at 8pm', askAwHow: 'How it works',
  ncEmpty: 'No newcomers on the board yet this week', ncYou: 'You',
};
type Tx = typeof EN;
const TH: Tx = {
  rings: '+{0} ริง', ring1: '+1 ริง', claim: 'รับ', done: 'เสร็จแล้ว', go: 'ไป', newTag: 'ใหม่', skip: 'ข้ามไปก่อน', close: 'ปิด', save: 'บันทึก',
  phRow: 'รูปประจำวัน', phRowS: 'โชว์ไวบ์ของคุณ · +3 ริง', phTitle: 'รูปประจำวัน', phLine: 'โชว์ไวบ์ของคุณ ไม่ต้องเห็นหน้าก็ได้',
  exBack: 'ด้านหลัง', exSide: 'ด้านข้าง', exOutfit: 'ลุคของคุณ', phRules: 'สถานที่จริงในกรุงเทพฯ · ไม่รับภาพแคปจอ รูปอาหารล้วน หรือรูปจากเน็ต',
  phTake: 'ถ่ายรูป', phRetake: 'ถ่ายใหม่', phCap: 'ตอนนี้อยู่ที่ไหน (ไม่ใส่ก็ได้)', phPost: 'โพสต์ · สูงสุด +5 ริง', phPosted: 'ขึ้นบนโปรไฟล์แล้ว · ได้ริงในภารกิจวันนี้แล้ว',
  phDay: 'วันนี้โพสต์รูปแล้ว · พรุ่งนี้มาใหม่นะ', phBad: 'รูปนี้ใช้ไม่ได้ ลองรูปอื่นนะ', phFace: 'ยืนยันใบหน้า 5 วินาทีก่อนนะ',
  awHelpful: 'มีประโยชน์ที่สุด', awFunny: 'ฮาที่สุด', awNudge: 'เล่าเหตุผลเพิ่มอีกนิด เพื่อลุ้นรางวัลวันนี้', awOk: 'ได้ลุ้นรางวัลวันนี้แล้ว',
  kindT: 'อยากเรียบเรียงใหม่ไหม?', kindS: 'คำพูดดี ๆ ได้คำตอบกลับมากกว่า', kindEdit: 'แก้ไข', kindPost: 'โพสต์เลย', fpAward: 'รางวัล ถาม BKK',
  orbTo: 'อีก {0} ถึงอันดับ {1}', orbFloor: 'อีก {0} ริงถึงที่นั่งรางวัล', orbTop: 'อันดับ 1 ของสัปดาห์', orbJoin: 'เข้าบอร์ด', orbFace: 'ยืนยันใบหน้า', orbLabel: 'บอร์ดประจำสัปดาห์', orbNone: 'โพสต์เพื่อเข้าบอร์ด',
  welcome3: 'ต้อนรับเพื่อนใหม่ {0} คน', welcome1: 'ต้อนรับเพื่อนใหม่ 1 คน', welcomeSub: 'รีลแรก ๆ ของเพื่อนใหม่บนกริ๊ง! · กดใจเป็นการทักทาย',
  ofLikes: 'ถูกใจแล้ว {0}/5', watchLike: 'ดูและกดใจ', welcomeDone: 'ขอบคุณที่ต้อนรับเพื่อนใหม่ ✓',
  b5: 'กรุงเทพฯ ตอน 5 โมงเย็น', b5Banner: '5 โมงเย็นแล้ว · ตอนนี้อยู่ที่ไหน ถ่ายให้ดูหน่อย', b5How: '10 วินาที · ไม่ต้องเห็นหน้า · ไม่ต้องตัดต่อ',
  b5Post: 'โพสต์คลิป 5 โมงเย็นของฉัน', b5Until: 'เปิดถึง 1 ทุ่ม', b5Opens: 'เปิด 5 โมงเย็น', b5Review: 'กำลังตรวจ · จะขึ้นที่นี่เมื่อกริ๊ง! อนุมัติ',
  b5Hidden: 'รอบนี้ยังไม่ได้ขึ้น · พรุ่งนี้ 5 โมงเย็นลองใหม่นะ', b5N: 'วันนี้มี {0} คนโพสต์ 5 โมงเย็นแล้ว', b5N1: 'วันนี้มี 1 คนโพสต์ 5 โมงเย็นแล้ว',
  b5Yday: '5 โมงเย็นเมื่อวานในกรุงเทพฯ', b5None: 'มาเป็นคนแรกที่โพสต์ 5 โมงเย็นวันนี้', b5TaskSub: 'คลิป 10 วินาที ช่วง 5 โมงเย็นถึง 1 ทุ่ม', b5Tile: '5 โมง',
  f3Row: 'ติดตาม 3 คน', f3Title: 'ติดตามคนในกรุงเทพฯ 3 คน', f3Near: 'ติดตามคนแถว{0} 3 คน', f3Sub: 'เขาจะเห็นว่าคุณติดตามแล้ว',
  nReels: '{0} รีล', nReel1: '1 รีล', follow: 'ติดตาม', following: 'ติดตามแล้ว', f3Prog: 'ติดตามแล้ว {0}/3 · อีกนิดเดียว', f3Done: 'เรียบร้อย · ติดตามแล้ว {0} คน',
  poTag: 'อยู่บนโปรไฟล์', poTitle: 'ขึ้นบนโปรไฟล์ของคุณแล้ว', poSub: 'ยังไม่ขึ้นฟีดหลัก แต่ผู้ติดตามเห็นและกดใจได้ และยังนับคะแนนบอร์ดประจำสัปดาห์',
  poWhy: 'ทำไมยังไม่ขึ้นฟีดหลัก', poExamples: 'คลิปที่ได้ขึ้นฟีดหลัก', poPost: 'โพสต์คลิปใหม่', poWatch: 'ดูคลิปของฉัน',
  asks: '{0} ถามว่า', answerStarts: 'คำตอบของคุณจะเป็นข้อความแรก', yourAnswer: 'คำตอบของคุณ', sendAnswer: 'ส่งคำตอบ',
  noHi: 'ไม่ต้องทักแค่ "หวัดดี" {0} จะเห็นคำตอบแล้วเลือกตอบกลับเอง', answerFirst: 'ตอบคำถามของเขาก่อนเพื่อเริ่มแชท',
  oqTitle: 'คำถามเปิดแชท', oqSub: 'ใครอยากทักคุณ ต้องตอบคำถามนี้ก่อน', oqOn: 'เปิด', oqOff: 'ปิด', oqPh: 'ถามอะไรสนุก ๆ…',
  oqLine: 'คำถามเปิดแชท · {0}', oqSaved: 'บันทึกแล้ว', oqBad: 'สั้น ๆ พอ และห้ามมีลิงก์ เบอร์โทร หรือไอดี',
  opA: 'ที่{0} อะไรที่ห้ามพลาดที่สุด?', opB: 'เลือกหนึ่ง: {0} หรือที่ใกล้ ๆ แถวนั้น?', opC: 'เล่ามา 2 จริง 1 โกหกเกี่ยวกับ{0} เดี๋ยวทายเอง!',
  opA0: 'ที่นี่มีอะไรที่ห้ามพลาดที่สุด?', opB0: 'เลือกหนึ่ง: ที่นี่ หรือที่ใกล้ ๆ แถวนั้น?', opC0: 'เล่ามา 2 จริง 1 โกหกเกี่ยวกับที่นี่ เดี๋ยวทายเอง!',
  bs: 'สตรีคเพื่อนซี้', bsDays: 'ติดกันมา {0} วัน', bsDay1: 'ติดกันมา 1 วัน', bsToday: 'วันนี้ทั้งคู่ต้องทำภารกิจอย่างน้อย 1 อย่าง', bsDone: 'ทำแล้ว', bsNot: 'ยังไม่ได้ทำ',
  bsNudge: 'สะกิด {0}', bsNudged: 'สะกิดแล้ว ✓', bsNudgedMe: '{0} สะกิดคุณ · วันนี้ทำภารกิจสักอย่างนะ', bsStart: 'เริ่มสตรีคเพื่อนซี้', bsSent: 'ส่งคำชวนแล้ว',
  bsInvited: '{0} ชวนคุณเริ่มสตรีคเพื่อนซี้', bsAccept: 'ตกลง', bsLater: 'ไว้ก่อน', bsBroke: 'สตรีคขาดแล้ว · เริ่มใหม่', bsWait: 'รอ {0} ตอบรับ',
  bsEnd: 'เลิกสตรีค', bsMutual: 'สำหรับเพื่อนที่ติดตามกันและกัน', bsFull: 'คุณมีสตรีคครบ 3 คนแล้ว', bsNone: 'ยังไม่มีสตรีค',
  bsWith: 'ซี้กับ {1} {0} วัน', bsCount: 'สตรีคเพื่อนซี้ {0} วัน', bsMe: 'สตรีคเพื่อนซี้ · {0} วัน', bsNew: 'ใหม่', bsNoRings: 'สตรีคไม่ได้ริง ได้ความภูมิใจล้วน ๆ',
  fpTitle: '{0} ได้ {1} ริงมาจากไหน', fpTitleMe: 'คุณได้ {0} ริงมาจากไหน', fpRank: 'อันดับ {0} สัปดาห์นี้ · ทุกคนดูได้', fpOpen: 'ทุกคนดูได้',
  fpLikes: 'ถูกใจจากสมาชิก', fpVer: 'สมาชิกที่ยืนยันหน้าแล้ว {0}', fpVis: 'นักท่องเที่ยวนับสองเท่า', fpNew: 'จากสมาชิกใหม่ {0} (นับได้วันละ {1})', fpWho: 'ดูว่าใคร', fpHide: 'ซ่อน',
  fpSaves: 'บันทึก', fpOpens: 'เปิดลิงก์จากแอปอื่น', fpOther: 'แอปอื่น', fpNot: 'ไม่นับ: {0}', fpOver: 'เกินวันละ {0}',
  why_robot: 'ตัวพรีวิวลิงก์และบอท', why_line: 'พรีวิวลิงก์ของ LINE', why_repeat: 'คนเดิมเปิดซ้ำ', why_own: 'เปิดจากมือถือของเจ้าของเอง',
  why_same_phone: 'มือถือเครื่องเดียวกับคนโพสต์', why_pending: 'เปิดแป๊บเดียว', why_other: 'การตรวจอื่น ๆ',
  fpTasks: 'ภารกิจรายวัน', fpAsk: 'เปิดลิงก์ ถาม BKK', fpInv: 'เพื่อนที่ชวนมา (ยืนยันหน้าแล้ว)', fpRules: 'กติกาแฟร์เพลย์',
  fpRulesSub: 'คนเดิมกดใจเกิน 3 รีลนับครึ่ง เพดานต่อวัน การตัดยอดปั่น และการปัดเศษ', fpLag: 'เข้ามาในนาทีล่าสุด',
  fpDays: 'ดูทีละวัน', fpDaysHide: 'ซ่อนรายวัน', fpProfile: 'ดูโปรไฟล์', fpMember: 'สมาชิก', fpSame: 'คิดแบบเดียวกันทุกคน',
  fpShare: 'แชร์รีลของฉัน · เปิดครั้งละ +5', fpNone: 'สัปดาห์นี้ยังไม่มีริง', fpReels: 'นับรีลที่ดีที่สุดของแต่ละวัน', fpMore: 'อีก {0} รีลไม่นับ (นับวันละ 1 รีล)', fpMore1: 'อีก 1 รีลไม่นับ (นับวันละ 1 รีล)',
  dReels: 'รีล', dTasks: 'ภารกิจ', dInv: 'เพื่อน',
  ncTitle: 'ลีกน้องใหม่', ncSub: 'เฉพาะคนที่เข้าร่วมสัปดาห์นี้ · 3 อันดับแรกได้ป้าย ดาวรุ่ง', ncTo: 'อีก {0} ริงถึงอันดับ {1}', ncTop: 'คุณคืออันดับ 1 ของน้องใหม่',
  // m228 daily bonuses
  dtTitle: 'ท็อป 3 วันนี้', dtSub: 'รับโบนัสตอน 23:59', dtEmpty: 'ติดท็อป 3 วันนี้: เก็บให้ได้ {0} ริง', dtWon: 'ผู้ชนะเมื่อคืน', dtWonSub: 'โบนัสรอบต่อไป 23:59',
  dtYou: 'คุณ', fpTop: 'โบนัสท็อป 3 รายวัน', fpClimb: 'ไต่อันดับแรงสุด', dBonus: 'โบนัส',
  hwTitle: 'โบนัสรายวัน', hwSub: 'ริงพิเศษเข้ากระดานประจำสัปดาห์ ทุกคืน',
  hwTopT: 'ท็อป 3 ของวัน: +{0}, +{1}, +{2}', hwTopS: 'ใครเก็บริงได้มากที่สุดในวันนั้น นับตอน 23:59 ต้องยืนยันใบหน้าแล้ว และเก็บได้ {3} ริงขึ้นไปในวันนั้น ถ้าเท่ากัน ใครถึงก่อนได้ก่อน',
  hwClimbT: 'ไต่อันดับแรงสุด: +{0}', hwClimbS: 'ทำได้ดีกว่าวันปกติของตัวเองมากที่สุด ต้องยืนยันใบหน้าแล้ว และเก็บได้ {1} ริงขึ้นไปในวันนั้น',
  hwAskT: 'รางวัล ถาม BKK: รางวัลละ +5 ตอน 2 ทุ่ม', hwAskS: 'ช่วยได้มากที่สุด (❤️💯) และฮาที่สุด (😂) คำตอบต้องยาว 40 ตัวอักษรขึ้นไป และได้โหวตจากสมาชิกที่ยืนยันใบหน้าแล้วอย่างน้อย 2 คน โหวตให้ตัวเองไม่นับ ได้สูงสุด 2 รางวัลต่อสัปดาห์',
  hwFpT: 'ทุกโบนัสดูได้ในแฟร์เพลย์', hwFpS: 'แตะใครก็ได้บนกระดาน เพื่อดูว่าริงของเขามาจากไหน',
  hwWin: 'วิธีชนะประจำสัปดาห์', hwOk: 'เข้าใจแล้ว', hwLink: 'โบนัสรายวันและรางวัล', askAwLine: 'คำตอบเด็ดรับ +5 ตอน 2 ทุ่ม', askAwHow: 'ดูกติกา',
  ncEmpty: 'สัปดาห์นี้ยังไม่มีน้องใหม่บนบอร์ด', ncYou: 'คุณ',
};
export type R10Tx = Tx;
export const r10Tx = (lang: string): Tx => (lang === 'th' ? TH : EN);
export const fmt = (s: string, ...a: (string | number)[]) => a.reduce<string>((o, v, i) => o.split(`{${i}}`).join(String(v)), s);

/** profile-only reasons (m220 kr8_profile_only_reasons): title + one plain tip, in the member's language */
export const PO_REASONS: Record<string, { en: [string, string]; th: [string, string] }> = {
  dark: { en: ['A bit too dark', 'Film in daylight or under bright lights.'], th: ['มืดไปนิด', 'ลองถ่ายตอนกลางวัน หรือที่ที่มีไฟสว่าง'] },
  blurry: { en: ['Blurry or shaky', 'Hold the phone steady and wipe the lens first.'], th: ['ภาพเบลอหรือสั่น', 'ถือมือถือให้นิ่ง และเช็ดเลนส์ก่อนถ่าย'] },
  noperson: { en: ['No person in the clip', 'The main feed shows people at places. Add yourself or a friend for a few seconds.'], th: ['ในคลิปยังไม่มีคน', 'ฟีดหลักคือคนกับสถานที่ ลองให้ตัวคุณหรือเพื่อนอยู่ในคลิปสักไม่กี่วินาที'] },
  noplace: { en: ['The place isn’t clear', 'Show the spot so people know where you are.'], th: ['ยังไม่เห็นว่าเป็นที่ไหน', 'ถ่ายให้เห็นสถานที่ คนดูจะได้รู้ว่าคุณอยู่ที่ไหน'] },
  sideways: { en: ['Sideways video', 'Hold your phone upright so it fills the screen.'], th: ['คลิปแนวนอน', 'ถือมือถือแนวตั้ง คลิปจะได้เต็มจอ'] },
  short: { en: ['Too short', '10 to 30 seconds tells the story best.'], th: ['สั้นไปนิด', 'ประมาณ 10–30 วินาทีเล่าเรื่องได้ดีที่สุด'] },
  sound: { en: ['Hard to hear', 'Find a quieter spot, or hold the phone closer when you talk.'], th: ['เสียงไม่ค่อยชัด', 'หามุมที่เงียบขึ้น หรือถือมือถือใกล้ตัวตอนพูด'] },
  slowstart: { en: ['Slow start', 'Open with your best moment. People decide in 3 seconds.'], th: ['ช่วงแรกช้าไป', 'เปิดด้วยช่วงที่ดีที่สุด คนตัดสินใจใน 3 วินาทีแรก'] },
  home: { en: ['Filmed indoors', 'Reels from a real Bangkok spot do best.'], th: ['ถ่ายในบ้าน', 'รีลจากสถานที่จริงในกรุงเทพฯ ไปได้ไกลที่สุด'] },
  _: { en: ['Not picked for the main feed', 'Clips with you at a lively Bangkok spot do best.'], th: ['ยังไม่ได้เลือกขึ้นฟีดหลัก', 'คลิปที่มีคุณอยู่ในสถานที่คึกคักในกรุงเทพฯ ไปได้ไกลที่สุด'] },
};
export const poReason = (lang: string, key: string | null | undefined): [string, string] => {
  const r = PO_REASONS[key && PO_REASONS[key] ? key : '_'];
  return lang === 'th' ? r.th : r.en;
};

/** opening-question presets per language (the member can also write their own) */
export const OQ_PRESETS: Record<'en' | 'th', string[]> = {
  en: ['Best rooftop for sunset that isn’t crazy expensive?', 'Where would you take a friend on their first day in Bangkok?', 'Café to work in or café to chill in?', 'Your favourite night market, and why?'],
  th: ['รูฟท็อปดูพระอาทิตย์ตกที่ไม่แพงเว่อร์ ที่ไหนดี?', 'ถ้าเพื่อนมากรุงเทพฯ วันแรก จะพาไปไหน?', 'คาเฟ่นั่งทำงาน หรือคาเฟ่นั่งชิล?', 'ตลาดนัดกลางคืนที่ชอบที่สุด เพราะอะไร?'],
};

/** the 3 one-tap openers for a Reel (feature 7); place = the Reel's pinned place in the reader's language */
export function reelOpeners(lang: string, place: string | null | undefined): string[] {
  const tx = r10Tx(lang);
  const p = (place || '').trim();
  return p ? [fmt(tx.opA, p), fmt(tx.opB, p), fmt(tx.opC, p)] : [tx.opA0, tx.opB0, tx.opC0];
}

/** feature 2: the "New in Bangkok" row covers 48 h; Reel tiles fewest likes first (max 10), first answers after them */
export function newFacesOrder<T extends { k: string; likes?: number; at: string }>(items: T[], maxReels = 10): T[] {
  const reels = items.filter((x) => x.k === 'reel').sort((a, b) => (a.likes || 0) - (b.likes || 0) || Date.parse(b.at) - Date.parse(a.at)).slice(0, maxReels);
  return [...reels, ...items.filter((x) => x.k !== 'reel')];
}

/** feature 9: the bar parts (Rings > 0 only), and the check that the parts add up to the board number */
export function fpParts(d: FairPlay): { key: string; rings: number }[] {
  const parts = [
    { key: 'likes', rings: d.likes_verified.rings + d.likes_newer.rings },
    { key: 'opens', rings: d.opens.rings },
    { key: 'saves', rings: d.saves.rings },
    { key: 'tasks', rings: d.tasks + d.ask_opens },
    { key: 'award', rings: d.ask_awards || 0 },
    { key: 'bonus', rings: (d.daily_top || 0) + (d.daily_climb || 0) },
    { key: 'invites', rings: d.invites_shown ? d.invites : 0 },
  ];
  return parts.filter((p) => p.rings > 0);
}
export const fpSum = (d: FairPlay) =>
  d.likes_verified.rings + d.likes_newer.rings + d.saves.rings + d.opens.rings + d.rules_adjust + d.tasks + d.ask_opens + (d.ask_awards || 0) + (d.daily_top || 0) + (d.daily_climb || 0) + (d.invites_shown ? d.invites : 0) + d.lag;

/** feature 8: the profile pill text */
export function bestiePill(lang: string, b: BestieOf): string {
  const tx = r10Tx(lang);
  return b.partner ? fmt(tx.bsWith, b.count, b.partner.first_name) : fmt(tx.bsCount, b.count);
}

/** The once-only "Live on your profile" sheet: remembered per Reel on this phone. */
const PO_SEEN = 'kr8_po_seen';
// 26 Nov (r15b): r14's push opt-in wrote "1" to this same key, which crashed the app for members with a profile-only Reel.
// Anything that is not a list of ids is ignored.
export function poSeen(): string[] {
  try { const v: unknown = JSON.parse(localStorage.getItem(PO_SEEN) || '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
}
export function poMarkSeen(id: string) { try { const s = poSeen(); if (!s.includes(id)) localStorage.setItem(PO_SEEN, JSON.stringify([...s, id].slice(-60))); } catch { /* private mode */ } }

/** feature 4: Me grid tiles that are profile-only (id → reason key); a tap on one opens the explanation sheet */
export const PO_OPEN = 'kr8:r10-po';
export function usePoMap(on: boolean): Record<string, string | null> {
  const d = poStore.use(on);
  return useMemo(() => Object.fromEntries((d?.reels || []).map((r) => [r.id, r.reason])), [d]);
}
export function poOpen(id: string) { try { window.dispatchEvent(new CustomEvent(PO_OPEN, { detail: id })); } catch { /* old browser */ } }
