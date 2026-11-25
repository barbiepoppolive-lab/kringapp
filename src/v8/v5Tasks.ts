/**
 * Daily tasks (0171, founder 20 Nov). Every Ring is decided on the server (kr8_task_*): the app only shows state and asks.
 *   ask (+3) answer 1 Ask BKK · vote (+1) quick vote · watch (+1) 3 Reels to the end · open (+1) daily check-in · say = "coming soon".
 * Only face-verified members can claim; others get KR8_TASK_FACE → the app shows "Verify your face to collect your Rings".
 */
import { v5Client, V5Error, v5ErrCode } from './v5Live';

export type TaskId = 'post' | 'ask' | 'say' | 'vote' | 'watch' | 'open' | 'bonus';
export interface TaskVote {
  kind: 'pair' | 'price' | 'roast'; q_en: string; q_th: string;
  a_en: string; a_th: string; a_img: string | null; b_en: string; b_th: string; b_img: string | null;
  c_en: string | null; c_th: string | null; img: string | null;
  pick: 'a' | 'b' | 'c' | null; pct: (Partial<Record<'a' | 'b' | 'c', number>> & { n?: number }) | null;   // pct only after this member voted (0177)
}
export interface TaskRow {
  id: TaskId; rings: number; done?: boolean; claimed?: boolean; soon?: boolean;
  progress?: number; goal?: number; question?: { id: string; body: string; details?: string | null } | null; min_chars?: number; vote?: TaskVote | null;
}
export interface TasksToday {
  on: boolean; day?: string; resets_at?: string; verified?: boolean; max?: number; rings_today?: number;
  streak?: boolean[]; tasks?: TaskRow[];
}
export type TaskState = 'go' | 'claim' | 'done' | 'soon';

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new V5Error('OFFLINE');
  const c = await v5Client();
  let res;
  try { res = await c.rpc(fn, args); } catch (e) { throw new V5Error(v5ErrCode(e)); }
  if (res.error) throw new V5Error(v5ErrCode(res.error));
  // m214: a This-or-That vote counts towards "answered like you" (onboard.ts re-reads)
  if (fn === 'kr8_task_vote') { try { window.dispatchEvent(new CustomEvent('kr8-onb-poke', { detail: fn })); } catch { /* old browser */ } }
  return res.data as T;
}

/** 24 Nov (founder): one vote looked broken as "100% / 0%" — digits appear only from this many votes. */
export const VOTE_NUMS_MIN = 10;
/** who voted today (m204): first names + photos only, and only after this member voted. `n` = other real voters. */
export interface VoteWho { first_name: string; photo: string | null; pick: 'a' | 'b' | 'c'; n: number }

/**
 * One-tap reasons (m204). The three presets per side live on kr8_task_votes as flat columns, but the app never reads them:
 * kr8_task_reason_presets() shapes them into {a,b,c} → [{k,th,en}] and every reason RPC returns the whole payload below,
 * so one call both writes and refreshes. Preset keys are side+ordinal — 'a1','a2','a3','b1'… (NOT 'a_r1').
 */
export interface ReasonPreset { k: string; th: string; en: string }
export interface VoteReason {
  id: string; pick: 'a' | 'b' | 'c'; key: string | null; th: string; en: string;
  own_words: boolean; ups: number; mine: boolean; upvoted: boolean; name: string | null; photo: string | null;
}
export interface VoteReasons {
  day: string; voted: boolean; my_pick?: 'a' | 'b' | 'c' | null;
  presets: Partial<Record<'a' | 'b' | 'c', ReasonPreset[]>>; reasons: VoteReason[];
}
/** The guess streak (m205): consecutive FINISHED days this member picked the majority side. `last` is newest-first, ≤ 7,
 *  and only holds days that had votes at all — fewer than 7 entries is normal and `mine: null` means they did not vote. */
export interface StreakDay { day: string; hit: boolean; mine: 'a' | 'b' | 'c' | null; majority: 'a' | 'b' | 'c' | null }
export interface VoteStreak { current: number; best: number; days: number; hits: number; through: string; last: StreakDay[] }

export const tasksToday = () => call<TasksToday>('kr8_tasks_today');
export const taskVoteWho = (day?: string) => call<VoteWho[]>('kr8_task_vote_who', day ? { p_day: day } : {});
export const taskReasonsToday = (day?: string) => call<VoteReasons>('kr8_task_reasons_today', day ? { p_day: day } : {});
/** The server takes exactly one of p_reason / p_text — never both, never neither. */
export const taskReason = (key: string) => call<VoteReasons>('kr8_task_reason', { p_reason: key });
/** 24 Nov (founder): own words as well as the presets. Server caps at 140 chars, runs kr8_text_ok then kr6_mask,
 *  and refuses anything under 2 characters once masked (KR8_BAD_TEXT). Presets stay first — most members never type. */
export const REASON_MAX = 140;
export const taskReasonText = (text: string) => call<VoteReasons>('kr8_task_reason', { p_text: text });
export const taskReasonUp = (id: string) => call<VoteReasons>('kr8_task_reason_up', { p_id: id });
export const taskStreak = () => call<VoteStreak>('kr8_task_streak');
export const taskClaim = (task: TaskId) => call<TasksToday>('kr8_task_claim', { p_task: task });
export const taskVote = (pick: 'a' | 'b' | 'c') => call<TasksToday>('kr8_task_vote', { p_pick: pick });
export const taskWatch = (post: string, phase: 'start' | 'end') =>
  call<{ counted: boolean; progress: number; goal?: number }>('kr8_task_watch', { p_post: post, p_phase: phase });

/** Order on the sheet: the main task first, the check-in last (it is always ready). */
export const TASK_ORDER: TaskId[] = ['post', 'ask', 'vote', 'watch', 'bonus'];   // rules v2 (30 Nov): open + say removed

export function taskState(t: TaskRow): TaskState {
  if (t.soon) return 'soon';
  if (t.claimed) return 'done';
  if (t.done) return 'claim';
  return 'go';
}

/** doable tasks (not "coming soon") */
export const doable = (d: TasksToday | null) => (d?.tasks || []).filter((t) => !t.soon && t.id !== 'bonus');
export const claimedCount = (d: TasksToday | null) => doable(d).filter((t) => t.claimed).length;
export const readyCount = (d: TasksToday | null) => doable(d).filter((t) => t.done && !t.claimed).length;
export const leftCount = (d: TasksToday | null) => doable(d).filter((t) => !t.claimed).length;

/** consecutive days with at least one claim, ending today (or yesterday if nothing is claimed yet today) */
export function streakDays(s: boolean[] | undefined): number {
  if (!s || !s.length) return 0;
  const a = [...s];               // oldest → today
  let i = a.length - 1;
  if (!a[i]) i -= 1;              // today not claimed yet: the streak is still alive from yesterday
  let n = 0;
  while (i >= 0 && a[i]) { n += 1; i -= 1; }
  return n;
}

/** "Resets in 5h 12m" */
export function resetsIn(iso: string | undefined, now = Date.now()): { h: number; m: number } | null {
  if (!iso) return null;
  const ms = Date.parse(iso) - now;
  if (!Number.isFinite(ms)) return null;
  const mins = Math.max(0, Math.round(ms / 60000));
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

/** Thai or English only (one language at a time); other app languages read the English line. */
export type TLang = 'th' | 'en';
export const tLang = (lang: string): TLang => (lang === 'th' ? 'th' : 'en');

const EN = {
    today: 'Today', allDone: 'All done', of: '{0} of {1}', ofN: 'of {0}', ofDone: '{0} of {1} done', resets: 'Resets in {0}h {1}m', ringsToday: "Today's Rings",
    seeTomorrow: 'see you tomorrow', streak: '{0}-day streak', go: 'Go', claim: 'Claim', done: 'Done', soon: 'Coming soon',
    open: 'Open Kring', openS: 'Daily check-in', openDone: 'Checked in',
    ask: 'Answer 1 Ask BKK', askRule: 'Answer 1 question ({0}+ characters)', askDone: 'Answer posted', askNone: 'Answer any question',
    vote: 'Quick vote', voteDone: 'You picked {0}', watch: 'Watch 3 Reels', watchS: 'To the end · {0} of {1}',
    say: 'Say it in Thai', sayS: 'Voice clips are coming soon',
    post: 'Post a photo or Reel', postS: 'Photo +3 · Reel +5 · today’s prompt +2', postDone: 'Posted · best one counts', bonus: 'All tasks done', bonusS: 'Counts for your streak', streakLine: 'Streak: day 3 +5 · day 5 +10 · day 7 +20',
    tasksLeft: '{0} tasks left today', taskLeft: '1 task left today', dailyTasks: 'Daily tasks',
    faceT: 'Verify your face to collect your Rings', faceS: 'Takes 5 seconds. Your task stays done, collect it right after.', faceGo: 'Verify my face', later: 'Later',
    quickVote: 'Quick vote', priceCheck: 'Price check', tapSide: 'Tap a side · see what everyone picked', voted: '{0} members voted', next: 'Done',
    thisOrThat: 'This or that', tapVote: 'Tap to vote · results after you pick', counted: 'Vote counted ✓', ringPlus: '+1 Ring', yourPick: 'Your pick', votesN: '{0} votes', votes1: '1 vote', locked: 'One vote each · locked in',
    guessQ: 'Which one did everyone else pick?', guessSub: 'Guess first', votedSoFar: '{0} voted so far · result at {1}', whoVoted: '{0} voted', whoMore: '{0} +{1}', youPicked: 'You picked {0}',
    whyQ: 'Why? Tap one', topReason: 'Top reason today', myReason: 'Your reason', agree: 'Agree',
    ownWords: 'In my own words', ownPh: 'Say it your way…', ownSend: 'Post', ownBad: 'Try different words.', ownLocked: 'People have agreed with this already, so it stays as it is.',
    streakRun: 'Right {0} days in a row', streakOne: 'Right yesterday', streakSome: 'Right {0} of {1} days', streakNew: 'Your first guess is in',
    pricePick: 'Results show after you pick', welcome: 'Good to see you, {0}', checkin: 'Day {0} · check-in +1 Ring', collect: 'Collect',
    watchBar: '{0}/{1} · +1', ringsShort: '+{0}', network: 'Couldn’t load your tasks. Try again.', claimFail: 'Couldn’t collect. Try again.',
    days: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], todayShort: 'Today', close: 'Close',
};
export type TaskTx = typeof EN;
const TH: TaskTx = {
    today: 'วันนี้', allDone: 'ครบแล้ว', of: '{0} จาก {1}', ofN: 'จาก {0}', ofDone: 'ทำแล้ว {0} จาก {1}', resets: 'รีเซ็ตใน {0} ชม. {1} นาที', ringsToday: 'ริงวันนี้',
    seeTomorrow: 'เจอกันพรุ่งนี้', streak: 'ต่อเนื่อง {0} วัน', go: 'ไป', claim: 'รับ', done: 'เสร็จ', soon: 'เร็วๆ นี้',
    open: 'เปิดกริ๊ง!', openS: 'เช็กอินรายวัน', openDone: 'เช็กอินแล้ว',
    ask: 'ตอบ 1 คำถามใน ถาม BKK', askRule: 'ตอบคำถาม 1 ข้อ ({0} ตัวอักษรขึ้นไป)', askDone: 'ตอบแล้ว', askNone: 'ตอบคำถามไหนก็ได้',
    vote: 'โหวตด่วน', voteDone: 'คุณเลือก {0}', watch: 'ดูรีล 3 อัน', watchS: 'ดูจนจบ · {0} จาก {1}',
    say: 'พูดเป็นภาษาไทย', sayS: 'คลิปเสียงมาเร็วๆ นี้',
    post: 'โพสต์รูปหรือรีล', postS: 'รูป +3 · รีล +5 · ตามโจทย์วันนี้ +2', postDone: 'โพสต์แล้ว · นับอันที่ดีที่สุด', bonus: 'ทำครบทุกอย่าง', bonusS: 'นับเป็นวันต่อเนื่อง', streakLine: 'ต่อเนื่อง: วันที่ 3 +5 · วันที่ 5 +10 · วันที่ 7 +20',
    tasksLeft: 'เหลืออีก {0} ภารกิจวันนี้', taskLeft: 'เหลืออีก 1 ภารกิจวันนี้', dailyTasks: 'ภารกิจรายวัน',
    faceT: 'ยืนยันใบหน้าเพื่อรับริงของคุณ', faceS: 'ใช้เวลา 5 วินาที ภารกิจที่ทำแล้วยังอยู่ รับได้ทันทีหลังยืนยัน', faceGo: 'ยืนยันใบหน้า', later: 'ไว้ทีหลัง',
    quickVote: 'โหวตด่วน', priceCheck: 'เช็กราคา', tapSide: 'แตะเลือก · ดูว่าทุกคนเลือกอะไร', voted: 'โหวตแล้ว {0} คน', next: 'เสร็จ',
    thisOrThat: 'อันไหนดี', tapVote: 'แตะเพื่อโหวต · ดูผลหลังเลือก', counted: 'นับโหวตแล้ว ✓', ringPlus: '+1 ริง', yourPick: 'คุณเลือก', votesN: '{0} โหวต', votes1: '1 โหวต', locked: 'โหวตได้คนละครั้ง · ล็อกแล้ว',
    guessQ: 'คนอื่นเลือกข้อไหน?', guessSub: 'ทายก่อน · เลือกเลย', votedSoFar: '{0} คนโหวตแล้ว · ผลออกเมื่อครบ {1}', whoVoted: '{0} โหวตแล้ว', whoMore: '{0} +{1}', youPicked: 'คุณเลือก {0}',
    whyQ: 'เพราะอะไร? แตะเลือก', topReason: 'เหตุผลยอดนิยมวันนี้', myReason: 'เหตุผลของคุณ', agree: 'เห็นด้วย',
    ownWords: 'พิมพ์เอง', ownPh: 'บอกเหตุผลในแบบของคุณ…', ownSend: 'ส่ง', ownBad: 'ลองใช้คำอื่นดู', ownLocked: 'มีคนเห็นด้วยกับเหตุผลนี้แล้ว จึงแก้ไม่ได้',
    streakRun: 'ทายถูก {0} วันติด', streakOne: 'ทายถูกเมื่อวาน', streakSome: 'ทายถูก {0} จาก {1} วัน', streakNew: 'ทายครั้งแรกของคุณ',
    pricePick: 'ผลโหวตจะขึ้นหลังคุณเลือก', welcome: 'ยินดีต้อนรับ {0}', checkin: 'วันที่ {0} · เช็กอิน +1 ริง', collect: 'รับเลย',
    watchBar: '{0}/{1} · +1', ringsShort: '+{0}', network: 'โหลดภารกิจไม่ได้ ลองอีกครั้ง', claimFail: 'รับไม่สำเร็จ ลองอีกครั้ง',
    days: ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'], todayShort: 'วันนี้', close: 'ปิด',
};
export const TX: Record<TLang, TaskTx> = { en: EN, th: TH };

export function fmt(s: string, ...a: Array<string | number>): string {
  return a.reduce<string>((x, v, i) => x.split(`{${i}}`).join(String(v)), s);
}
