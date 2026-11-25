/**
 * Kring admin v2 (13 Nov): phone-first, English only, less clutter.
 * To do (count tiles) → one-at-a-time queues (Reels, Face checks, Reports, Replies, New venues) with Skip and a 5 s Undo;
 * Members (sources, recruiter checklist + CSV, Kring Locals by recruiter); Listings (Stay/Do stepper, Venues → detail); More (history, rules, sign out).
 * Every RPC and its parameters are the same as v1 (reelsAdmin / verifyAdmin / socialAdmin / stayAdmin / admin.ts).
 */
import { NOT_YET_GROUPS, NOT_YET_MAX, NOT_YET_RULE_BREAKS, chipsFromReasons, notYetEnglish, notYetNote } from './notYet';
import { V5_AREAS, v5VerifyCode } from '../v8/v5Live';
import { signReelPaths } from '../v8/v5Reel';
import { basePath, bkkTime, el, rpc, rpcWrite, sendKeepalive, staffLink, v5Client, type RpcWrite } from './shared';
import { checklistCsv, type Check } from './reelsAdmin';
import { mentionsKring } from './socialAdmin';
import { lineMessage, splitTreat, standLink, uploadPhotos } from './adminHelpers';
import { IG_TOP, type IgDm } from './igData';
import { pushSendArgs } from './pushAdmin';
import { bannedIn, fileSize, PLATFORMS, REEL_CAPTION, REEL_CAPTION_EN, shareReel, type Platform } from './postReel';
import { agentsByLabel, cleanRef, codeMeaning, funnelLine, funnelRate, isProblemLog, isRecruiters, kindName, uaInfo,
  type ProblemLog, type RecruitMember, type Recruiters } from './problemsAdmin';
import { awsLookalikes, buildClusters, flagText, isLookCardMap, joinDate, lookalikeBlock, ownPhotoLabel, type LookCard, type FaceLookalikes, istWhen, weekRange, type WeekRow, isDupOverview, isLinkReason, isWeekReview, linkText, prizeName, REASON_LABEL, weekFlags,
  type DupCluster, type DupFlagged, type DupHeld, type DupMember, type WeekReview } from './dupAdmin';
import './admin2.css';
import { info, v2Flush, v2Route, v2TabFor, v2Tabbar, v2TestToggle } from './adminV2';
import { photoStateChip } from './photoOk';   // 0122: one-tap Photo OK
import { checkReasons, holdLines, isRetiredFaceLink } from './adminClean';   // 19 Nov clean-up (old on-phone face checker retired)
import { copyLabel, feedLabel, feedOffReason, loadReelChecks, setReelFeed, type ReelCheck } from './reelChecks';   // 0145/0147

// ───────────────────────────── types (same rows as v1) ─────────────────────────────
type Reel = { id: string; author_id: string; author_name: string; ref_code: string | null; area: string; body: string; created_at: string;
  video_path: string; poster_path: string; duration_ms: number; status: 'pending' | 'approved' | 'hidden'; author_approved: number;
  /** 0070 kr8_admin_member_who: the member's own "I live here / Visiting" (audit P3-2: the card always said "Kring Local") */ author_who?: 'local' | 'traveller' | null };
type Counts = { id: string; views: number; likes: number; saves: number; shares: number; open_reports: number };
type Face = { id: string; user_id: string; first_name: string; profile_photo: string | null; selfie_path: string | null;
  live_check: { straight?: boolean; left?: boolean; right?: boolean; blink?: boolean; blink_fallback?: boolean; match?: number | null; device?: string;
    /** 0081 instant check */ auto?: 'pass' | 'review' | 'block'; review?: string[]; engine?: string; ms?: number; order?: string; same?: number | null; real?: number | null; dup_sim?: number | null; model?: string;
    /** 0125 server check (AWS) */ aws_dup?: { user_id?: string; member_no?: number | null; first_name?: string | null; sim?: number } | null; yaw?: Record<string, number> };
  status: 'pending' | 'approved' | 'rejected'; created_at: string; reviewed_at: string | null; reject_reason: string | null; approved_reels: number; account_created: string };
type Report = { id: string; created_at: string; category: string | null; reason: string; reporter_name: string | null; target_id: string | null; target_name: string | null;
  post_id: string | null; post_kind: string | null; post_body: string | null; video_path: string | null; poster_path: string | null; post_hidden: boolean | null;
  post_reports: number; target_reports: number; handled_at: string | null; resolution: string | null };
type Social = { id: string; subreddit: string; thread_url: string; thread_title: string; reply_text: string; why_helps: string; mentions_kring: boolean;
  status: 'pending' | 'sending' | 'sent' | 'skipped'; send_mode: 'api' | 'manual' | null; final_text: string | null; result_url: string | null; error: string | null;
  created_at: string; sent_at: string | null };
type SStatus = { sent_today: number; max_per_day: number; next_allowed_at: string; kring_allowed: boolean };
type App = { id: string; venue_name: string; owner_name: string; line_id: string | null; phone: string | null; category: string; band: number;
  band1_discount_thb: number | null; band1_min_bill_thb: number | null; city: string; district: string | null; maps_url: string; referral_host_code: string | null;
  created_at: string; photo_b64: string | null; kind: string | null; treat_text: string | null; extra_photos_b64: string[]; licensed_stay?: boolean | null };
type Stat = { venue_id: string; name: string; area: string; status: 'live' | 'paused'; approved_at: string; approved_by: string; referral_host_code: string | null;
  first_redeemed_at: string | null; redemptions: number; claims: number; failed_pin_tries_7d: number; pin_locked_until: string | null };
type Guests = { venue_id: string; guests: number; live_confirmed_at: string | null; new_account_guests: number; locked_phones: number; locked_until: string | null };
type Flags = { venue_id: string; practice: boolean; daily_cap: number; used_today: number; deal_en: string | null; deal_th: string | null; name_th: string | null; licensed_stay: boolean | null };
type Listing = { id: string; kind: 'stay' | 'do'; name: string; name_th: string | null; area: string; blurb_en: string | null; blurb_th: string | null; photos: string[];
  member_price_thb: number; price_unit_en: string | null; price_unit_th: string | null; saving_thb: number | null; booking_kind: 'line_oa' | 'line' | 'ig' | 'url';
  booking_contact: string; live: boolean; live_at: string | null; taps: number; members: number; taps_7d: number; last_tap_at: string | null; by_ref: Record<string, number> };
type Attr = { kind: 'ref' | 'src'; code: string; signed_up: number; first_reel: number; live_14d: number; three_reels_2days: number };
type Creator = { user_id: string; first_name: string; ref_code: string | null; joined_at: string; reels_total: number; approved: number; pending: number; hidden: number;
  first_approved_at: string | null; approved_first_14d: number; approved_last_14d: number };
type Award = { award_id: string; period: 'day' | 'week'; period_start: string; rank: number; prize: string; reel_id: string; author_name: string; area: string; poster_path: string };

// ───────────────────────────── icons ─────────────────────────────
const P: Record<string, string> = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M17 14.5c2.4.2 4 1.8 4.5 4.5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8 20h8M9.5 17h5"/>',
  store: '<path d="M4 9l1.5-5h13L20 9M4 9h16v2a3 3 0 0 1-5.3 1.9A3 3 0 0 1 12 14a3 3 0 0 1-2.7-1.1A3 3 0 0 1 4 11zM5 13v7h14v-7M10 20v-4h4v4"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', chev: '<path d="M9 5l7 7-7 7"/>', back: '<path d="M15 5l-7 7 7 7"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>', eyeoff: '<path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3 3.5M6.6 6.6C4.2 8.2 3 12 3 12s4 6 9 6a8.7 8.7 0 0 0 4.4-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  eye: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6S18 18 12 18 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  save: '<path d="M6 3.5h12v17l-6-4.5-6 4.5z"/>', share: '<path d="M14 5l6 6-6 6M20 11H10a6 6 0 0 0-6 6v1"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', play: '<path d="M7 4.5v15l12-7.5z"/>',
  vol: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/>', mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5"/>',
  skip: '<path d="M6 5l8 7-8 7M18 5v14"/>', clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', warn: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.4v.1"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.1"/>', face: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M9.5 10v.5M14.5 10v.5M9.5 15s1 1 2.5 1 2.5-1 2.5-1"/>',
  left: '<path d="M9 14L4.5 9.5 9 5"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-2"/>', right: '<path d="M15 14l4.5-4.5L15 5"/><path d="M19.5 9.5H10a5.5 5.5 0 0 0 0 11h2"/>',
  blink: '<path d="M4 10c2.5 3 5 4.5 8 4.5s5.5-1.5 8-4.5M7 13.5L5.5 16M12 14.5V17M17 13.5l1.5 2.5"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  edit: '<path d="M4 20h4l11-11-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  bed: '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-8v5"/><circle cx="6.5" cy="10.5" r="1.8"/>', brush: '<path d="M18 3l3 3-9 9-3-3zM9 12c-3 0-5 2-5 5 0 1.5-1 2.5-2 3 4 1 9 0 9-5z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>', key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14.5 8.5l2 2"/>',
  pause: '<path d="M8 5v14M16 5v14"/>', msg: '<path d="M4 5h16v11H9l-5 4z"/>', print: '<path d="M7 9V3.5h10V9M7 17H4.5V9h15v8H17M7 14h10v6.5H7z"/>',
  hist: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4v4.5H8"/><path d="M12 8v4l3 2"/>', book: '<path d="M4 4.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H4zM20 4.5h-6a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h6z"/>',
  out: '<path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M10 16l-4-4 4-4M6 12h10"/>', trash: '<path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13"/>', reel: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M10 9.5v5l4-2.5z"/>',
  dl: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>', party: '<path d="M4 20l4.5-12L16 15.5z"/><path d="M14 4.5c0 1.5 1 2 2 2M19 9c-1 0-2 .5-2 2M20 4l-1 1M12 9l1-1"/>', spark: '<path d="M12 3l2 6.5L20.5 12 14 14l-2 7-2-7-6.5-2L10 9.5z"/>',
};
function ic(name: string): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = P[name] || '';
  return s;
}

// ───────────────────────────── small helpers ─────────────────────────────
type Kid = Node | string | null | undefined | false;
const app = document.getElementById('app')!;
const btn = (cls: string, kids: Kid[], onClick?: () => void, attrs: Record<string, string | boolean | undefined> = {}) => {
  const b = el('button', { class: 'btn ' + cls, type: 'button', ...attrs }, ...kids);
  if (onClick) b.onclick = onClick;
  return b;
};
const ERR: Record<string, string> = {
  KR8_ADMIN_ONLY: 'This account is not an admin', KR8_DEAL_WORDS: 'No percent sign, quiet-hours words, links or phone numbers',
  KR8_DEAL_TEXT_REQUIRED: 'Add the treat words (in baht) in at least one language', KR8_ALREADY_REVIEWED: 'Already reviewed',
  KR8_BAD_PHOTOS: 'Photo upload failed', KR8_BAD_AREA: 'Pick an area', KR8_REASON_REQUIRED: 'Give a reason (3+ characters)', KR8_NEED_PHOTO: 'At least one photo is needed',
  KR8_NO_REEL: 'This Reel is not approved or is hidden', KR8_SOCIAL_DAY_LIMIT: '5 sent today already · send tomorrow', KR8_SOCIAL_TOO_SOON: 'Less than 20 minutes since the last one',
  KR8_PUSH_TITLE: 'Title: 1–80 characters', KR8_PUSH_BODY: 'Message: 1–240 characters', KR8_PUSH_URL: 'The link must be a page inside the app (/app/…)',
  KR8_PUSH_TARGET: 'Pick one member or all members', KR8_NO_MEMBER: 'No member with that number',
  KR8_NO_PERSON: 'No member card on this account yet', KR8_GHOST: 'Ghost mode is on for this account',
  KR8_SOCIAL_RATIO: 'Not yet: Kring needs 9 replies without it first', KR8_SOCIAL_NOT_PENDING: 'Already sent or skipped', REDDIT_OFF: 'Reddit API not connected yet · use Copy + open thread',
};
const errText = (e: unknown) => { const m = String((e as Error)?.message || e); const k = (m.match(/KR8_[A-Z_]+|REDDIT_OFF/) || [''])[0]; return ERR[k] || 'Failed: ' + m; };
const errP = (e: unknown) => el('p', { class: 'err' }, errText(e));
const ago = (iso: string | null | undefined) => {
  if (!iso) return '–';
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};
const reelLink = (id: string) => `${location.origin}${basePath()}?reel=${encodeURIComponent(id)}`;
const bkkToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const mondayOf = (d: string) => { const t = new Date(d + 'T00:00:00Z'); const k = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - k); return t.toISOString().slice(0, 10); };
const addDays = (d: string, n: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const loading = () => el('div', { class: 'load' }, 'Loading…');
const empty = (title: string, sub = '') => el('div', { class: 'card empty' }, el('b', {}, title), sub);
const pill = (txt: string, cls = '') => el('span', { class: 'pill ' + cls }, txt);
const LS = (k: string, v?: string) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* private mode */ } return null; };

function sw(id: string, label: Kid, checked: boolean, onChange: (on: boolean) => void): HTMLLabelElement {
  const inp = el('input', { type: 'checkbox', id, checked });
  inp.onchange = () => onChange(inp.checked);
  return el('label', { class: 'sw' }, el('span', { class: 'grow' }, label), inp, el('span', { class: 'tg' }));
}

// ───────────────────────────── sheet + toast ─────────────────────────────
function sheet(...kids: Kid[]): { close: () => void; box: HTMLElement } {
  const box = el('div', { class: 'sheet', role: 'dialog' }, el('div', { class: 'grab' }), ...kids);
  const scrim = el('div', { class: 'scrim' }, box);
  const close = () => { scrim.remove(); window.removeEventListener('hashchange', close); };
  scrim.onclick = (e) => { if (e.target === scrim) close(); };
  window.addEventListener('hashchange', close);
  document.body.append(scrim);
  return { close, box };
}

let toastEl: HTMLElement | null = null;
function toast(text: string, opts: { undo?: () => void; ms?: number } = {}) {
  toastEl?.remove();
  const ms = opts.ms ?? 5000;
  const t = el('div', { class: 'toast', role: 'status', id: 'toast' }, el('span', { class: 'grow' }, text));
  if (opts.undo) { const u = el('button', { type: 'button', id: 'toastUndo' }, 'Undo'); u.onclick = () => { t.remove(); opts.undo!(); }; t.append(u); }
  const bar = el('i', {}); bar.style.animationDuration = ms + 'ms'; t.append(bar);
  const qa = document.querySelector<HTMLElement>('.qact');
  if (qa) t.style.bottom = `${qa.offsetHeight + 6}px`;
  document.body.append(t); toastEl = t;
  setTimeout(() => { if (toastEl === t) { t.remove(); toastEl = null; } }, ms);
}

/** One delayed write at a time: the RPC is sent when the 5 s Undo runs out, when another action starts, or when the screen is left. */
let pendingWrite: { run: RpcWrite; timer: number } | null = null;
function flushWrite(leaving = false) {
  if (!pendingWrite) return;
  const p = pendingWrite; pendingWrite = null; clearTimeout(p.timer);
  // the tab is closing: send with keepalive so the last Hide / Approve is not lost (audit P3-11)
  void (leaving ? sendKeepalive(p.run) : p.run()).then(() => { counts = null; }).catch((e) => toast(errText(e), { ms: 6000 }));
}
function laterWrite(run: RpcWrite) {
  flushWrite();
  pendingWrite = { run, timer: window.setTimeout(flushWrite, 5000) };
}
function cancelWrite() { if (pendingWrite) { clearTimeout(pendingWrite.timer); pendingWrite = null; } }
window.addEventListener('pagehide', () => flushWrite(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushWrite(true); });

// ───────────────────────────── shell ─────────────────────────────
type Tab = 'todo' | 'members' | 'listings' | 'more';
let counts: { reels: number; faces: number; reports: number; hiddenNow: number; held: number; heldReview: number; replies: number; venues: number; newToday: number | null; visits: SiteVisits | null; status: SStatus | null } | null = null;
let me = '';

function tabbar(active: Tab): HTMLElement {
  // admin v2 (17 Nov): one tab bar everywhere — Today · Needs you · People · Money · More (old screens map onto it)
  return v2Tabbar(v2TabFor(active));
}
function screen(active: Tab, ...kids: Kid[]): HTMLElement {
  const s = el('div', { class: 'scr' }, ...kids);
  app.replaceChildren(s, tabbar(active));
  window.scrollTo(0, 0);
  return s;
}
function head(kicker: string, title: string, sub?: string, right?: Kid): HTMLElement {
  return el('div', { class: 'hd' }, el('div', { class: 'grow' }, el('div', { class: 'k' }, kicker), el('h1', {}, title), sub ? el('div', { class: 'sub' }, sub) : null), right || null);
}

// ───────────────────────────── sign in ─────────────────────────────
function signIn(msg?: string) {
  const email = el('input', { id: 'adminEmail', type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'you@example.com' });
  const send = btn('pri big full', ['Send code'], undefined, { id: 'adminSend' });
  const out = el('div', {}, msg ? el('p', { class: 'err' }, msg) : null);
  const form = el('div', { class: 'stack' }, el('label', { class: 'f' }, 'Admin email', email), send, out);
  send.onclick = async () => {
    send.disabled = true;
    try {
      const { error } = await (await v5Client()).auth.signInWithOtp({ email: email.value.trim().toLowerCase(), options: { shouldCreateUser: false } });
      if (error) throw error;
    } catch (e) { send.disabled = false; out.replaceChildren(el('p', { class: 'err' }, String((e as Error).message))); return; }
    const code = el('input', { id: 'adminCode', inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code', 'aria-label': '6-digit code' });
    const boxes = el('div', { class: 'boxes' }, ...Array.from({ length: 6 }, () => el('span', {})));
    const paint = () => { const v = code.value.replace(/\D/g, '').slice(0, 6); if (v !== code.value) code.value = v; [...boxes.children].forEach((b, i) => { b.textContent = v[i] || ''; b.className = i === v.length && document.activeElement === code ? 'cur' : ''; }); };
    code.oninput = paint; code.onfocus = paint; code.onblur = paint;
    const ver = btn('pri big full', ['Sign in'], undefined, { id: 'adminVerify' });
    const again = el('button', { type: 'button', class: 'skip' }, 'Send the code again');
    again.onclick = () => signIn();
    const out2 = el('div', {});
    ver.onclick = async () => {
      ver.disabled = true;
      try { await v5VerifyCode(email.value, code.value); void boot(); } catch (e) { ver.disabled = false; out2.replaceChildren(el('p', { class: 'err' }, (e as Error).message === 'BAD_CODE' ? 'Wrong or old code' : String((e as Error).message))); }
    };
    form.replaceChildren(el('label', { class: 'f' }, `6-digit code sent to ${email.value.trim()}`, el('div', { class: 'otp' }, code, boxes)), ver, out2, again);
    code.focus(); paint();
  };
  app.replaceChildren(el('div', { class: 'login' }, el('div', { class: 'logo' }, 'K'), el('h1', {}, 'Kring admin'),
    el('p', { class: 'dim', style: 'margin:6px 0 26px' }, 'Sign in with your admin email.'), form));
}

// ───────────────────────────── To do ─────────────────────────────
async function loadCounts() {
  const [reels, faces, reports, social, st, apps, nt, sv] = await Promise.all([
    rpc<Reel[]>('kr8_admin_reels', { p_status: 'pending', p_limit: 100 }).catch(() => [] as Reel[]),
    rpc<Face[]>('kr8_admin_verifications', { p_status: 'pending' }).catch(() => [] as Face[]),
    rpc<Report[]>('kr8_admin_reports', { p_open: true, p_limit: 200 }).catch(() => [] as Report[]),
    rpc<Social[]>('kr8_admin_social_list', { p_status: 'pending' }).catch(() => [] as Social[]),
    rpc<SStatus[]>('kr8_social_status').then((r) => r[0] || null).catch(() => null),
    rpc<App[]>('kr8_admin_applications', { p_status: 'pending' }).catch(() => [] as App[]),
    rpc<{ real: number; test: number }>('kr8_admin_new_members_today').catch(() => null),
    rpc<SiteVisits>('kr8_admin_site_visits').catch(() => null),
  ]);
  // T-301: prize claims waiting for the founder (held: same person? / 0075 face check). Before 0075 is live: 0.
  const hc = await rpc<{ held: number; review: number } | null>('kr8_admin_held_count').catch(() => null);
  counts = { reels: reels.length, faces: faces.length, reports: reports.length, hiddenNow: reports.filter((r) => r.post_hidden).length,
    held: Number(hc?.held) || 0, heldReview: Number(hc?.review) || 0,
    replies: social.filter((s) => s.status === 'pending').length + redditToday().length + igToday().length, venues: apps.length, newToday: nt ? nt.real : null, visits: isSiteVisits(sv) ? sv : null, status: st };
  return counts;
}

async function todoView() {
  const now = new Date();
  const date = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short' });
  const body = el('div', {}, loading());
  screen('todo', head('Kring admin', 'To do today', date), body);
  const c = counts || await loadCounts().catch(() => null);
  if (!c) { body.replaceChildren(empty('Could not load', 'Pull down to try again.')); return; }
  app.querySelector('.tabbar')?.replaceWith(tabbar('todo'));
  const tile = (id: string, href: string, n: number, title: string, cls: string, hint?: string) =>
    el('a', { class: `tile ${cls} ${n ? '' : 'zero'}`, href, id }, el('span', { class: 'go' }, ic('chev')), el('span', { class: 'n' }, String(n)),
      el('span', {}, el('span', { class: 't', style: 'display:block' }, title), hint ? el('span', { class: 'h', style: 'display:block' }, hint) : null));
  const st = c.status;
  void st;
  const total = c.reels + c.faces + c.reports + c.replies + c.venues + c.held;
  const heldLine = c.held ? el('a', { class: 'tile wide', href: '#dups', id: 'todo-held', style: 'margin-bottom:12px;border:1.5px solid var(--bad, #e5484d)' },
    el('span', { class: 'n' }, String(c.held)),
    el('span', { class: 'grow' }, el('span', { class: 't', style: 'display:block' }, c.held === 1 ? 'Prize claim held' : 'Prize claims held'),
      el('span', { class: 'h', style: 'display:block' }, `${c.heldReview ? `${c.heldReview} face check · ` : ''}Pay or Refuse · no code goes out until you decide`)),
    el('span', { class: 'go', style: 'position:static' }, ic('chev'))) : '';
  const venueTile = el('a', { class: `tile wide ${c.venues ? '' : 'zero'}`, href: '#q/venues', id: 'todo-venues' }, el('span', { class: 'n' }, String(c.venues)),
    el('span', { class: 'grow' }, el('span', { class: 't', style: 'display:block' }, c.venues === 1 ? 'New venue' : 'New venues'), el('span', { class: 'h', style: 'display:block' }, 'Waiting for approval')),
    el('span', { class: 'go', style: 'position:static' }, ic('chev')));
  const newLine = c.newToday == null ? '' : el('a', { class: 'tile wide', href: '#members/all', id: 'todo-newmembers', style: 'margin-bottom:12px' },
    el('span', { class: 'grow' }, el('span', { class: 't', style: 'display:block' }, `New members today: ${c.newToday}`), el('span', { class: 'h', style: 'display:block' }, 'Real sign-ups, India time · tap to see them')),
    el('span', { class: 'go', style: 'position:static' }, ic('chev')));
  const visitsLine = c.visits ? (() => {
    const b = el('button', { class: 'tile wide', type: 'button', id: 'todo-visits', style: 'margin-bottom:12px;width:100%' },
      el('span', { class: 'grow' }, el('span', { class: 't', style: 'display:block' }, visitsHeadline(c.visits.today)),
        el('span', { class: 'h', style: 'display:block' }, visitsHint(c.visits.today))),
      el('span', { class: 'go', style: 'position:static' }, ic('chev')));
    b.onclick = () => visitsSheet(c.visits!);
    return b;
  })() : '';
  body.replaceChildren(
    heldLine,
    newLine,
    visitsLine,
    total ? '' : el('div', { class: 'clear', id: 'allClear' }, ic('check'), el('div', {}, el('b', {}, 'All clear'), el('span', { class: 'dim sm' }, 'Nothing waiting. Nice work.'))),
    el('div', { class: 'tiles' },
      tile('todo-reels', '#q/reels', c.reels, 'Reels waiting', 'pink', 'Approve or hide'),
      tile('todo-faces', '#q/faces', c.faces, 'Face checks', 'blue', 'Verify members'),
      tile('todo-reports', '#q/reports', c.reports, 'Reports', 'red', c.hiddenNow ? `${c.hiddenNow} Reel hidden now` : 'Open reports'),
      tile('todo-replies', '#q/replies', c.replies, 'Replies to send', '', 'Reddit + Instagram'),
      venueTile),
    total ? el('div', { class: 'est' }, ic('clock'), `About ${total} min in all`) : '');
}

// Places members type in decide themselves since 0086 (live / linked to an existing place / quietly refused, then pinned
// in the background). They are browsed and undone in admin v2 → More → Places (adminV2.ts placesView).

// ───────────────────────────── site visits (0052_kr8_admin_site_visits) ─────────────────────────────
type VisitDay = { visitors: number; th: number; other: number; us: number; signups: number };
export type SiteVisits = { today: VisitDay; week: VisitDay; days: (VisitDay & { day: string })[];
  sources_today: { ref: string; visitors: number }[]; sources_week: { ref: string; visitors: number }[] };
const isDay = (d: unknown): d is VisitDay => !!d && typeof d === 'object' && ['visitors', 'th', 'other', 'us', 'signups'].every((k) => typeof (d as Record<string, unknown>)[k] === 'number');
export function isSiteVisits(v: unknown): v is SiteVisits {
  const o = v as SiteVisits | null;
  return !!o && isDay(o.today) && isDay(o.week) && Array.isArray(o.days) && o.days.every(isDay) && Array.isArray(o.sources_today) && Array.isArray(o.sources_week);
}
/** Real visitors = Thailand + other countries. The US is kept apart: most of it is our own testing. */
export const realVisitors = (d: VisitDay) => d.th + d.other;
export const visitsHeadline = (d: VisitDay) => `Site visits today: ${realVisitors(d)} (TH ${d.th} · other ${d.other})`;
export const visitsHint = (d: VisitDay) => `unique phones per day (from 16 Nov) · ${d.us ? `+${d.us} US, mostly our own testing · ` : ''}tap for 7 days`;
export const sourceName = (ref: string) => (ref === 'direct' || ref === '(none)' || !ref ? 'direct (no link code)' : ref);
export function joinedLine(d: VisitDay, when: 'today' | 'in 7 days'): string {
  const v = realVisitors(d);
  const pct = v ? Math.round((d.signups / v) * 1000) / 10 : 0;
  return `${d.signups} new ${d.signups === 1 ? 'member' : 'members'} from ${v} ${v === 1 ? 'visitor' : 'visitors'} ${when}` + (v ? ` (${pct}%)` : '');
}
// ───────────────────────────── where visitors come from (0056_kr8_admin_traffic_sources) ─────────────────────────────
export type TrafficChannel = { key: string; label: string; visitors: number; signups: number };
export type TrafficPeriod = { channels: TrafficChannel[]; us: number; codes: { code: string; visitors: number; signups: number }[]; hosts: { host: string; visitors: number }[] };
export type Traffic = { today: TrafficPeriod; week: TrafficPeriod; month: TrafficPeriod };
const isTrafficPeriod = (p: unknown): p is TrafficPeriod => {
  const o = p as TrafficPeriod | null;
  return !!o && typeof o.us === 'number' && Array.isArray(o.channels) && Array.isArray(o.codes) && Array.isArray(o.hosts)
    && o.channels.every((c) => typeof c.key === 'string' && typeof c.visitors === 'number' && typeof c.signups === 'number');
};
export const isTraffic = (v: unknown): v is Traffic => !!v && isTrafficPeriod((v as Traffic).today) && isTrafficPeriod((v as Traffic).week) && isTrafficPeriod((v as Traffic).month);
/** Same rules as the SQL: a channel word in ?ref=/?src= first, then the referrer site, then a member/partner code, else direct. */
const REF_ALIAS: Record<string, string> = { ig: 'instagram', insta: 'instagram', instagram: 'instagram', tt: 'tiktok', tiktok: 'tiktok', x: 'x', twitter: 'x',
  yt: 'youtube', youtube: 'youtube', fb: 'facebook', facebook: 'facebook', line: 'line', google: 'google', reddit: 'reddit', chatgpt: 'ai', ai: 'ai' };
export function channelOf(ref: string | null | undefined, referrer: string | null | undefined): string {
  const rv = (ref || '').trim().toLowerCase();
  const code = rv && rv !== 'direct' && rv !== '(none)' ? rv : '';
  if (code && REF_ALIAS[code]) return REF_ALIAS[code];
  const h = (referrer || '').trim().toLowerCase().replace(/^(www\.|m\.)/, '');
  if (h && !/(^|\.)kringapp\.com$/.test(h)) {
    if (/(^|\.)instagram\.com$/.test(h)) return 'instagram';
    if (/(^|\.)tiktok\.com$/.test(h)) return 'tiktok';
    if (/^(t\.co|(.+\.)?(x|twitter)\.com)$/.test(h)) return 'x';
    if (/^(chatgpt\.com|chat\.openai\.com|gemini\.google\.com|claude\.ai|copilot\.microsoft\.com)$/.test(h) || /(^|\.)perplexity\.ai$/.test(h)) return 'ai';
    if (/(^|\.)google\.[a-z.]+$/.test(h)) return 'google';
    if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return 'youtube';
    if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(h)) return 'facebook';
    if (/(^|\.)line\.me$/.test(h)) return 'line';
    if (/(^|\.)(reddit\.com|redd\.it)$/.test(h)) return 'reddit';
    if (/(^|\.)(bing\.com|duckduckgo\.com)$/.test(h)) return 'other_search';
    return 'other_sites';
  }
  return code ? 'member_links' : 'direct';
}
export const conversionPct = (signups: number, visitors: number) => (visitors ? `${Math.round((signups / visitors) * 1000) / 10}%` : '–');
const CH_BADGE: Record<string, [string, string]> = { instagram: ['IG', '#e1306c'], tiktok: ['TT', '#25f4ee'], x: ['X', '#8a8a95'], google: ['G', '#4285f4'], youtube: ['YT', '#ff3030'],
  facebook: ['f', '#1877f2'], line: ['L', '#06c755'], reddit: ['R', '#ff5700'], ai: ['AI', '#a78bfa'], other_search: ['S', '#7a8aa0'], other_sites: ['W', '#7a8aa0'],
  member_links: ['K', '#ff4fa3'], direct: ['D', '#9a96a8'] };
/** Channels with traffic or sign-ups, busiest first. */
export const trafficRows = (p: TrafficPeriod) => p.channels.filter((c) => c.visitors || c.signups).sort((a, b) => b.visitors - a.visitors || b.signups - a.signups);
export function trafficBlock(data: Traffic, start: keyof Traffic = 'week'): HTMLElement {
  const box = el('div', { id: 'trafficBlock' });
  const names: [keyof Traffic, string][] = [['today', 'Today'], ['week', '7 days'], ['month', '30 days']];
  const paint = (k: keyof Traffic) => {
    const p = data[k];
    const rows = trafficRows(p);
    const max = Math.max(1, ...rows.map((c) => c.visitors));
    const total = rows.reduce((n, c) => n + c.visitors, 0);
    const list = rows.length
      ? el('div', { class: 'sv-list tr-list' }, ...rows.map((c) => {
        const [letter, color] = CH_BADGE[c.key] || ['?', '#9a96a8'];
        return el('div', { class: 'tr-row', 'data-ch': c.key },
          el('span', { class: 'tr-badge', style: `background:${color}` }, letter),
          el('span', { class: 'tr-main' },
            el('span', { class: 'tr-top' }, el('span', { class: 'grow' }, c.label), el('b', {}, String(c.visitors)),
              el('span', { class: 'tr-num dim xs' }, `${c.signups} joined`), el('span', { class: 'tr-num dim xs' }, conversionPct(c.signups, c.visitors))),
            el('span', { class: 'tr-bar' }, el('i', { style: `width:${Math.max(c.visitors ? 3 : 0, Math.round((c.visitors / max) * 100))}%;background:${color}` }))));
      }))
      : el('p', { class: 'dim sm' }, 'No visits yet.');
    const codes = p.codes.length
      ? el('div', { class: 'sv-list' }, el('div', { class: 'sv-row dim xs' }, el('span', { class: 'grow' }, 'Link code'), el('span', { class: 'tr-col' }, 'Visitors'), el('span', { class: 'tr-col' }, 'Joined')),
        ...p.codes.map((c) => el('div', { class: 'sv-row', 'data-code': c.code }, el('span', { class: 'grow tr-code' }, c.code), el('b', { class: 'tr-col' }, String(c.visitors)), el('b', { class: 'tr-col' }, String(c.signups)))))
      : el('p', { class: 'dim sm' }, 'No member or partner links used yet.');
    const hosts = p.hosts.length
      ? el('div', { class: 'sv-list' }, ...p.hosts.map((h) => el('div', { class: 'sv-row' }, el('span', { class: 'grow tr-code' }, h.host), el('b', {}, String(h.visitors)))))
      : null;
    box.replaceChildren(
      el('div', { class: 'sec' }, 'Where visitors come from'),
      el('div', { class: 'seg', id: 'trafficSeg' }, ...names.map(([key, label]) => {
        const b = el('button', { type: 'button', class: key === k ? 'on' : '', 'data-p': key }, label);
        b.onclick = () => paint(key);
        return b;
      })),
      list,
      el('p', { class: 'dim xs', style: 'margin:8px 2px 0' }, `${total} visitors counted${p.us ? ` · +${p.us} from the US, not counted (mostly our own testing)` : ''}. Joined = new members who came through that channel.`),
      el('div', { class: 'sec' }, 'Member & partner links'), codes,
      ...(hosts ? [el('div', { class: 'sec' }, 'Other websites'), hosts] : []));
  };
  paint(start);
  return box;
}

function visitsSheet(v: SiteVisits) {
  const dayName = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const stat = (n: number, label: string) => el('div', { class: 'sv-stat' }, el('b', {}, String(n)), el('span', {}, label));
  const srcList = v.sources_week.length
    ? el('div', { class: 'sv-list' }, ...v.sources_week.map((s) => el('div', { class: 'sv-row' }, el('span', { class: 'grow' }, sourceName(s.ref)), el('b', {}, String(s.visitors)))))
    : el('p', { class: 'dim sm' }, 'No visits yet.');
  const dayList = el('div', { class: 'sv-list' }, ...v.days.map((d) => el('div', { class: 'sv-row' },
    el('span', { class: 'sv-day' }, dayName(d.day)), el('b', {}, String(realVisitors(d))),
    el('span', { class: 'grow faint xs', style: 'text-align:right' }, `TH ${d.th} · other ${d.other}${d.us ? ` · US ${d.us}` : ''}`))));
  const trafficHolder = el('div', { id: 'trafficHolder' });
  const s = sheet(
    el('h3', {}, 'Site visits'),
    el('p', { class: 'dim sm', style: 'margin:4px 0 14px' }, 'People who opened kringapp.com, Bangkok time. Robots and our own tests are left out. The US is not counted: most of it is our own testing.'),
    el('div', { class: 'sv-stats' }, stat(realVisitors(v.today), 'Today'), stat(realVisitors(v.week), 'Last 7 days')),
    el('div', { class: 'sec' }, 'Who joined'),
    el('div', { class: 'card sv-join' }, el('div', {}, joinedLine(v.today, 'today')), el('div', { class: 'dim sm' }, joinedLine(v.week, 'in 7 days'))),
    el('div', { class: 'sec' }, 'Where they came from · 7 days'),
    srcList,
    el('div', { class: 'sec' }, 'Day by day'),
    dayList,
    trafficHolder,
    el('button', { class: 'btn ghost', type: 'button', id: 'visitsClose', style: 'width:100%;margin-top:16px' }, 'Close'));
  (s.box.querySelector('#visitsClose') as HTMLButtonElement).onclick = s.close;
  // Hidden silently until 0056 is applied (the function is missing before that).
  void rpc<Traffic>('kr8_admin_traffic_sources', { p_days: 30 }).then((t) => { if (isTraffic(t)) trafficHolder.replaceChildren(trafficBlock(t)); }).catch(() => undefined);
}

// ───────────────────────────── queue frame ─────────────────────────────
type QApi = { done: (label: string, write: () => Promise<unknown>) => void; next: () => void; skip: () => void; actions: (el: HTMLElement) => void };
function queue<T extends { id: string }>(title: string, items: T[], renderItem: (it: T, api: QApi) => HTMLElement, onEmptyBack = '#todo', note?: HTMLElement | null, canShow?: (it: T) => boolean) {
  const total = items.length;
  let doneN = 0;
  const list = [...items];
  const cnt = el('span', { class: 'cnt', id: 'qCount' });
  const bar = el('i', {});
  const close = el('a', { class: 'icb', href: onEmptyBack, 'aria-label': 'Close', id: 'qClose' }, ic('x'));
  const top = el('div', { class: 'qh' }, el('div', { class: 'row' }, close, el('h2', { class: 'grow' }, title), cnt), el('div', { class: 'bar' }, bar));
  const body = el('div', {});
  const act = el('div', { class: 'qact' }, el('div', {}));
  const s = el('div', { class: 'scr q' }, top, note || null, body);
  app.replaceChildren(s, act);
  // 20 Nov: the fixed action bar can be 3 rows (Approve ×2 / Not yet + Hide / Skip): keep the card's last line above it
  const fit = () => { s.style.paddingBottom = `${act.offsetHeight + 12}px`; };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(act);
  const show = () => {
    window.scrollTo(0, 0);
    cnt.textContent = list.length ? `${Math.min(doneN + 1, total)} / ${total}` : `${total} / ${total}`;
    bar.style.width = `${total ? (doneN / total) * 100 : 100}%`;
    if (!list.length) {
      act.firstElementChild!.replaceChildren(el('a', { class: 'btn pri big full', href: onEmptyBack, id: 'qDone' }, 'Back to To do'));
      body.replaceChildren(el('div', { class: 'okhero', style: 'padding-top:60px' }, el('div', { class: 'ic' }, ic('check')), el('h2', {}, 'All done here'),
        el('p', { class: 'dim' }, total ? `${total} handled.` : 'Nothing waiting.')));
      return;
    }
    // canShow: the first item that may be shown now (Reddit cooling down → its cards wait; falls back to the first item)
    const pick = canShow ? list.findIndex(canShow) : 0;
    const it = list[pick < 0 ? 0 : pick];
    const api: QApi = {
      done: (label, write) => {
        const idx = list.indexOf(it); if (idx < 0) return;
        list.splice(idx, 1); doneN++;
        laterWrite(write);
        toast(label, { undo: () => { cancelWrite(); list.unshift(it); doneN--; show(); } });
        show();
      },
      next: () => { const idx = list.indexOf(it); if (idx >= 0) { list.splice(idx, 1); doneN++; } counts = null; show(); },
      skip: () => { flushWrite(); if (list.length > 1) { const idx = list.indexOf(it); list.splice(idx, 1); list.push(it); show(); } else toast('This is the last one'); },
      actions: (n) => act.firstElementChild!.replaceChildren(n),
    };
    body.replaceChildren(renderItem(it, api));
  };
  show();
}
const skipBtn = (api: QApi) => { const b = el('button', { type: 'button', class: 'skip', id: 'qSkip' }, ic('skip'), 'Skip for now'); b.onclick = api.skip; return b; };

// ───────────────────────────── Reel queue ─────────────────────────────
function reelVideo(src: string, poster: string, chips: Kid[], overlay: Kid[]): HTMLElement {
  const v = el('video', { src, poster, playsinline: true, loop: true, preload: 'auto', autoplay: true });
  v.muted = true; v.defaultMuted = true; v.setAttribute('muted', '');
  const sound = el('span', { class: 'chip' }, ic('mute'), 'Tap for sound');
  const box = el('div', { class: 'vid' }, v, el('div', { class: 'chips' }, ...chips, sound), el('div', { class: 'ov' }, ...overlay));
  box.onclick = () => { v.muted = !v.muted; if (v.paused) void v.play().catch(() => undefined); sound.replaceChildren(ic(v.muted ? 'mute' : 'vol'), v.muted ? 'Tap for sound' : 'Sound on'); };
  setTimeout(() => void v.play().catch(() => undefined), 0);
  return box;
}

/** 0145/0147: the copied-watermark line + "Hide from feed / Show in feed" (one tap) for a Reel card. Null before 0147 is live. */
export function reelCheckRow(id: string, c: ReelCheck | undefined): HTMLElement | null {
  if (!c) return null;
  const copy = copyLabel(c);
  const line = el('span', { class: 'fact', 'data-feedline': id });
  const b = el('button', { type: 'button', class: 'fact', id: 'reelFeed-' + id, style: 'cursor:pointer' }) as HTMLButtonElement;
  const draw = () => {
    const f = feedLabel(c);
    line.replaceChildren(...(f ? [ic(c.feed_off ? 'eyeoff' : 'flag'), f] : []));
    line.hidden = !f;
    line.classList.toggle('red', !c.feed_off && (c.suggest ? c.suggest !== 'feed' : c.verdict === 'SUGGEST_FEED_OFF'));
    b.replaceChildren(ic(c.feed_off ? 'eye' : 'eyeoff'), c.feed_off ? 'Move to Feed' : 'Profile only');
  };
  b.onclick = async () => {
    const off = !c.feed_off;
    b.disabled = true;
    try { const r = await setReelFeed(rpc, id, off, off ? feedOffReason(c) : undefined); c.feed_off = r.feed_off; c.feed_off_reason = r.reason; draw(); toast(off ? 'Profile only · not in the public feed' : 'In the Feed', { ms: 1800 }); }
    catch (e) { toast(errText(e)); }
    b.disabled = false;
  };
  draw();
  const held = c.author_held ? el('span', { class: 'fact red', 'data-held': id }, ic('flag'), 'May be under 18 · out of public feeds until you clear them (Autopilot)') : null;
  return el('div', { class: 'facts', 'data-reelcheck': id }, copy ? el('span', { class: 'fact red', 'data-copied': id }, copy) : null, held, line, b);
}

async function reelQueue() {
  app.replaceChildren(el('div', { class: 'scr' }, loading()));
  let rows: Reel[];
  try { rows = await rpc<Reel[]>('kr8_admin_reels', { p_status: 'pending', p_limit: 100 }); } catch (e) { app.replaceChildren(el('div', { class: 'scr' }, errP(e))); return; }
  const [urls, cnt, checks, b5ids] = await Promise.all([
    signReelPaths(rows.flatMap((r) => [r.video_path, r.poster_path])).catch(() => ({} as Record<string, string>)),
    rows.length ? rpc<Counts[]>('kr8_admin_reel_counts', { p_ids: rows.map((r) => r.id) }).catch(() => [] as Counts[]) : Promise.resolve([] as Counts[]),
    loadReelChecks(rpc, rows.map((r) => r.id)),
    // Retention 10 (m219): which of these are "Bangkok at 5" clips (label only; reviewed like any Reel)
    rows.length ? rpc<string[]>('kr8_admin_b5_ids', { p_ids: rows.map((r) => r.id) }).catch(() => [] as string[]) : Promise.resolve([] as string[]),
  ]);
  const b5 = new Set(b5ids || []);
  const cm = new Map(cnt.map((c) => [c.id, c]));
  // audit P3-2: label each Reel with the member's own "I live here / Visiting" (older databases: plain "Member")
  const who = await rpc<{ user_id: string; who: 'local' | 'traveller' }[]>('kr8_admin_member_who', { p_ids: [...new Set(rows.map((r) => r.author_id))] }).catch(() => []);
  const wm = new Map(who.map((w) => [w.user_id, w.who]));
  for (const r of rows) r.author_who = wm.get(r.author_id) ?? null;
  queue('Reels waiting', rows, (r, api) => {
    const c = cm.get(r.id);
    // audit P2-3: Hide asks why (same sheet as face checks); the member sees the reason on their Reel, in Activity and as a ding
    // 0150: the founder picks Feed or Profile only; the Feed quality bot's suggestion is the big button (Feed when it has no view)
    const qc = checks.get(r.id);
    const sugProfile = qc?.suggest === 'profile' || qc?.suggest === 'not_yet';
    const approveTo = (feed: boolean) => api.done(feed ? 'Approved · in the Feed' : 'Approved · Profile only',
      feed && !qc?.feed_off ? rpcWrite('kr8_admin_review_reel', { p_reel: r.id, p_status: 'approved' }) : async () => {
        await rpcWrite('kr8_admin_review_reel', { p_reel: r.id, p_status: 'approved' })();
        await setReelFeed(rpc, r.id, !feed, feed ? undefined : feedOffReason(qc));
      });
    // 20 Nov (founder): "Not yet" = kind tips, the Reel stays with the member only, not a strike; rule breaks go to Hide
    const hideReel = (ready?: string) => rejectSheet('Why hide?', 'The member sees this reason on their Reel.', REEL_CHIPS, 'hideReel-' + r.id,
      (why) => rpc('kr8_admin_review_reel', { p_reel: r.id, p_status: 'hidden', p_note: why }), api.next, { cta: 'Send · hide', done: 'Hidden · reason sent', ready });
    api.actions(el('div', {},
      el('div', { class: 'two' },
        btn(sugProfile ? 'ghost big' : 'go big', [ic('check'), 'Approve · Feed'], () => approveTo(true), { id: 'approveReel-' + r.id }),
        btn(sugProfile ? 'go big' : 'ghost big', [ic('users'), 'Approve · Profile only'], () => approveTo(false), { id: 'approveProfile-' + r.id })),
      el('div', { class: 'two' },
        // Retention 10 (feature 4): a quality reason = approved + profile only + ONE reason the member sees in their language (one tap)
        btn('ghost big', [ic('users'), 'Profile only · why?'], () => profileOnlySheet(r.id, qc?.reasons || [], api, hideReel), { id: 'poReel-' + r.id }),
        btn('out-bad big', [ic('eyeoff'), 'Hide'], () => hideReel() /* = rejectSheet('Why hide?', …, REEL_CHIPS) */, { id: 'hideReel-' + r.id })),
      el('div', { class: 'two' }, skipBtn(api))));
    return el('div', { 'data-reel': r.id },
      reelVideo(urls[r.video_path] || '', urls[r.poster_path] || '', [el('span', { class: 'chip' }, ic('play'), `${Math.round(r.duration_ms / 1000)} s`)],
        [el('b', {}, `${r.author_name} · ${r.author_who === 'traveller' ? 'Visiting Bangkok' : r.author_who === 'local' ? 'Kring Local' : 'Member'}`), el('p', { class: 'dim' }, `${r.area} · ${ago(r.created_at)}`), r.body ? el('p', {}, r.body) : null]),
      el('div', { class: 'facts' },
        b5.has(r.id) ? el('span', { class: 'fact', 'data-b5': r.id }, ic('clock'), el('b', {}, 'Bangkok at 5'), ' clip · approve to show it in the 5pm row') : null,
        el('span', { class: 'fact' }, ic('link'), 'Ref ', el('b', {}, r.ref_code || '–')),
        el('span', { class: 'fact' }, ic('check'), 'Approved before ', el('b', {}, String(r.author_approved))),
        c ? el('span', { class: 'fact', 'data-counts': r.id }, ic('eye'), el('b', {}, String(c.views)), ic('heart'), el('b', {}, String(c.likes)), ic('save'), el('b', {}, String(c.saves)), ic('share'), el('b', {}, String(c.shares))) : null,
        c?.open_reports ? el('span', { class: 'fact red' }, ic('flag'), el('b', {}, String(c.open_reports)), ' open reports') : null,
        el('a', { class: 'fact', href: reelLink(r.id), target: '_blank', rel: 'noopener' }, ic('open'), 'Open Reel')),
      reelCheckRow(r.id, checks.get(r.id)));
  });
}

// ───────────────────────────── Face queue ─────────────────────────────
/** [button, English the admin sees, Thai sent first]. The member / owner gets "Thai\nEnglish"; the admin screen shows English only. */
type Chip = [label: string, en: string, th: string];
const FACE_CHIPS: Chip[] = [
  // 19 Nov (founder): one tap for the strict second-account warning
  ['Second account · warning', 'Warning: this is a second account of someone who already has a Kring account. One person, one account, one prize. More duplicate accounts will get all linked accounts closed.', 'คำเตือน: บัญชีนี้เป็นบัญชีที่สองของคนที่มีบัญชี Kring อยู่แล้ว กติกาคือ 1 คน 1 บัญชี 1 รางวัล หากพบบัญชีซ้ำอีก เราจะปิดทุกบัญชีที่เกี่ยวข้องครับ'],
  ['Not the same person', 'The face in your profile photo and the selfie are not the same person.', 'ใบหน้าในรูปโปรไฟล์กับเซลฟี่ไม่ใช่คนเดียวกันครับ'],
  ['Selfie not clear', 'The selfie is not clear enough. Please try again in good light.', 'เซลฟี่ยังไม่ชัดพอ ลองถ่ายใหม่ในที่ที่มีแสงสว่างนะครับ'],
  ['Photo of a screen', 'The selfie looks like a photo of a screen. Please take a live selfie.', 'เซลฟี่ดูเหมือนถ่ายจากหน้าจอ รบกวนถ่ายเซลฟี่สดอีกครั้งนะครับ'],
  ['Profile photo hides face', 'Your profile photo does not show your face clearly. Please change it, then try again.', 'รูปโปรไฟล์ยังเห็นหน้าไม่ชัด เปลี่ยนรูปแล้วลองยืนยันอีกครั้งนะครับ'],
  ['No blink', 'We could not see a blink. Please try the live check again.', 'ระบบไม่เห็นการกะพริบตา ลองตรวจสดอีกครั้งนะครับ'],
];
/** Reasons to hide a Reel: only what the published rules (/rules/ §2 and §7) already say. Each "Thai\nEnglish" stays under 200 characters. */
export const REEL_CHIPS: Chip[] = [
  ['Not a real Bangkok spot', 'Kring Reels show a real spot in Bangkok.', 'รีลบนกริ๊ง! ต้องเป็นสถานที่จริงในกรุงเทพฯ ครับ'],
  ['Wrong place pinned', 'The pinned place doesn’t match the Reel. Pin the right place and post again.', 'หมุดสถานที่ไม่ตรงกับรีล ปักหมุดให้ถูกแล้วโพสต์ใหม่ได้เลยครับ'],
  ['Not their own clip', 'This clip looks copied. Please post a Reel you filmed yourself.', 'คลิปนี้ดูเหมือนก๊อปมา รบกวนโพสต์รีลที่คุณถ่ายเองนะครับ'],
  ['Fake engagement', 'This Reel was hidden for fake engagement (bought views or many accounts).', 'รีลนี้ถูกซ่อนเพราะยอดไม่จริง (ซื้อวิวหรือใช้หลายบัญชี) ครับ'],
  ['Not right for Kring', 'This Reel doesn’t fit Kring’s community, so it won’t be shown.', 'รีลนี้ไม่เหมาะกับคอมมูนิตี้ของกริ๊ง! จึงจะไม่แสดงครับ'],
];
/**
 * 20 Nov (founder): "Not yet" sheet. Tip chips under 3 headings, up to 3; the Autopilot's reasons come preselected.
 * The founder sees and can edit the English; Thai follows the chips. Rule-break chips close this and open Hide.
 */
export function notYetSheet(reelId: string, botReasons: readonly string[], hide: (ready?: string) => void, onDone: () => void) {
  const pre = chipsFromReasons(botReasons);
  const sel: string[] = [...pre.tips];
  let edited = false;
  const idBase = 'notYet-' + reelId;
  const ta = el('textarea', { rows: '4', maxlength: '700', id: idBase + 'Why' }) as HTMLTextAreaElement;
  const out = el('div', {});
  const count = el('p', { class: 'faint xs', style: 'margin:6px 0 0', id: idBase + 'Count' });
  const btns = new Map<string, HTMLButtonElement>();
  const paint = () => {
    if (!edited) ta.value = notYetEnglish(sel);
    for (const [id, b] of btns) { b.classList.toggle('on', sel.includes(id)); b.disabled = !sel.includes(id) && sel.length >= NOT_YET_MAX; }
    count.textContent = `${sel.length} of ${NOT_YET_MAX} tips · sent in their language (Thai or English) · Founding ฿100 line added if their chance is open · not a strike`;
  };
  ta.oninput = () => { edited = true; };
  const groups = NOT_YET_GROUPS.map((g) => el('div', {}, el('p', { class: 'dim xs', style: 'margin:10px 0 4px;font-weight:700' }, g.title),
    el('div', { class: 'chips2' }, ...g.chips.map((c) => {
      const b = el('button', { type: 'button', 'data-chip': c.id, id: idBase + '-' + c.id }, c.label) as HTMLButtonElement;
      b.onclick = () => { const i = sel.indexOf(c.id); if (i >= 0) sel.splice(i, 1); else if (sel.length < NOT_YET_MAX) sel.push(c.id); edited = false; paint(); };
      btns.set(c.id, b); return b;
    }))));
  const rb = el('div', {}, el('p', { class: 'dim xs', style: 'margin:10px 0 4px;font-weight:700' }, 'Breaks the rules → Hide'),
    el('div', { class: 'chips2' }, ...NOT_YET_RULE_BREAKS.map((label) => {
      const ch = REEL_CHIPS.find((x) => x[0] === label);
      const b = el('button', { type: 'button', class: pre.ruleBreak === label ? 'sug' : '', 'data-rulebreak': label, style: 'border-color:#d33' }, (pre.ruleBreak === label ? '⚠ ' : '') + label);
      b.onclick = () => { sh.close(); hide(ch ? ch[1] : undefined); };
      return b;
    })));
  const go = btn('go big full rs-go', [ic('send'), 'Send · not yet'], undefined, { id: idBase + 'Send' });
  const sh = sheet(el('h3', {}, 'Not yet · tips for their next Reel'),
    el('p', { class: 'dim', style: 'margin:4px 0 0' }, 'Only the member sees this Reel, with your tips and a “Post a new one” button.'),
    pre.ruleBreak ? el('p', { class: 'err', style: 'margin:6px 0 0' }, `Autopilot: ${pre.ruleBreak} — use Hide`) : null,
    el('div', { class: 'stack rs' }, ...groups, rb, el('label', { class: 'f' }, 'What they read (English) · you can edit', ta, count), out, go));
  sh.box.classList.add('rsheet'); sh.box.id = idBase + 'Sheet';
  paint();
  go.onclick = async () => {
    if (!sel.length) { out.replaceChildren(el('p', { class: 'err' }, 'Pick at least one tip.')); return; }
    flushWrite(); go.disabled = true;
    try {
      await rpc('kr8_admin_review_reel', { p_reel: reelId, p_status: 'not_yet', p_note: notYetNote(sel, edited ? ta.value : undefined) });
      sh.close(); toast('Not yet · tips sent', { ms: 2500 }); onDone();
    } catch (e) { go.disabled = false; out.replaceChildren(errP(e)); }
  };
}
/**
 * Retention 10 (feature 4, 26 Nov): "Profile only · why?" — one tap on a QUALITY reason = approved, kept to the member's profile (not
 * the main feed), still counts for the weekly board; the member sees "Live on your profile" + this reason in their language + 2 example
 * Reels. Rule breaks are not here: they go to Hide with their own message.
 */
export const PROFILE_ONLY_REASONS: [key: string, label: string][] = [
  ['noperson', 'No person in it'], ['dark', 'Too dark'], ['blurry', 'Blurry or shaky'], ['noplace', 'No place shown'], ['home', 'At home / indoors'],
  ['sideways', 'Sideways'], ['short', 'Too short'], ['sound', 'Hard to hear'], ['slowstart', 'Slow start'],
];
export function profileOnlySheet(reelId: string, botReasons: readonly string[], api: { done: (label: string, write: RpcWrite) => void }, hide: (ready?: string) => void) {
  const pre = chipsFromReasons(botReasons);
  const sh = sheet(el('h3', {}, 'Profile only · pick the reason'),
    el('p', { class: 'dim', style: 'margin:4px 0 0' }, 'One tap. It stays on their profile and counts for the board; they see the reason and 2 Reels that made the feed.'),
    pre.ruleBreak ? el('p', { class: 'err', style: 'margin:6px 0 0' }, `Autopilot: ${pre.ruleBreak} — use Hide`) : null,
    el('div', { class: 'chips2', style: 'margin-top:10px' }, ...PROFILE_ONLY_REASONS.map(([k, label]) => {
      const b = el('button', { type: 'button', 'data-po': k, id: `po-${reelId}-${k}`, class: pre.tips.includes(k) ? 'sug' : '' }, (pre.tips.includes(k) ? '★ ' : '') + label) as HTMLButtonElement;
      b.onclick = () => {
        sh.close();
        api.done(`Profile only · ${label}`, async () => { await rpc('kr8_admin_reel_profile_only', { p_reel: reelId, p_reason: k }); });
      };
      return b;
    })),
    el('p', { class: 'dim xs', style: 'margin:12px 0 4px;font-weight:700' }, 'Breaks the rules → Hide'),
    el('div', { class: 'chips2' }, ...NOT_YET_RULE_BREAKS.map((label) => {
      const ch = REEL_CHIPS.find((x) => x[0] === label);
      const b = el('button', { type: 'button', 'data-rulebreak': label, style: 'border-color:#d33' }, label);
      b.onclick = () => { sh.close(); hide(ch ? ch[1] : undefined); };
      return b;
    })));
  sh.box.classList.add('rsheet'); sh.box.id = 'po-' + reelId + 'Sheet';
}
/** Removing a reported Reel / Ask BKK post or answer (only what the published rules say). */
export const REPORT_CHIPS: Chip[] = [
  ['Spam or scam', 'Removed: spam or a scam is not allowed on Kring.', 'ลบแล้ว: ห้ามสแปมหรือหลอกลวงบนกริ๊ง! ครับ'],
  ['Unsafe or adult', 'Removed: unsafe, adult or harassing content is not allowed on Kring.', 'ลบแล้ว: ห้ามเนื้อหาไม่ปลอดภัย ผู้ใหญ่ หรือคุกคามบนกริ๊ง! ครับ'],
  ['Not their own', 'Removed: please post only what you made yourself.', 'ลบแล้ว: โพสต์ได้เฉพาะสิ่งที่คุณทำเองนะครับ'],
  ['Wrong place', 'Removed: the place is wrong or closed.', 'ลบแล้ว: สถานที่ไม่ถูกต้องหรือปิดไปแล้วครับ'],
];
/** Same person? Refuse (kept for the record; the member is not told). */
export const DUP_CHIPS: Chip[] = [
  ['One person, one account', 'One person, one account: kept the oldest account', 'หนึ่งคน หนึ่งบัญชี: เก็บบัญชีที่เก่าที่สุดไว้'],
  ['Face didn’t match', 'Face check didn’t match. Please try again in good light.', 'ใบหน้าไม่ตรงกัน ลองใหม่ในที่ที่มีแสงสว่างนะครับ'],
  ['Same phone', 'Same phone as another account.', 'โทรศัพท์เครื่องเดียวกับบัญชีอื่น'],
  ['Fake engagement', 'Likes or saves from linked accounts.', 'ยอดถูกใจหรือบันทึกจากบัญชีที่เชื่อมกัน'],
];
/** Thai first, English under it, when the text is a chip's English (unchanged); a hand-typed reason goes as typed. */
export function bilingualReason(text: string, chips: Chip[]): string {
  const t = text.trim();
  const c = chips.find((x) => x[1] === t);
  return c ? `${c[2]}\n${c[1]}` : t;
}
/**
 * The one reason sheet for EVERY reject in admin (face checks, Reels, venues, reports, Ask BKK, Same person? Refuse).
 * Ready chips fill the text; the send button is sticky at the bottom of the sheet so it is always visible on a 390 px phone,
 * even with all chips showing (17 Nov: the founder could not find where to send a face-check reject).
 */
export function rejectSheet(title: string, sub: string, chips: Chip[], idBase: string, send: (why: string) => Promise<unknown>, onDone: () => void,
  opts: { cta?: string; done?: string; ready?: string; label?: string } = {}) {
  const ta = el('textarea', { rows: '3', maxlength: '200', id: idBase + 'Why' }, opts.ready || '') as HTMLTextAreaElement;
  const out = el('div', {});
  const chipRow = el('div', { class: 'chips2' });
  const note = el('p', { class: 'faint xs', style: 'margin:6px 0 0', id: idBase + 'Lang' });
  const paint = () => { note.textContent = chips.some((x) => x[1] === ta.value.trim()) ? 'Sent in Thai + English' : 'Typed text is sent as written'; };
  ta.oninput = paint;
  for (const [label, text] of chips) {
    const b = el('button', { type: 'button' }, label);
    b.onclick = () => { ta.value = text; paint(); chipRow.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
    chipRow.append(b);
  }
  const go = btn('bad big full rs-go', [ic('send'), opts.cta || 'Send · reject'], undefined, { id: idBase + 'Send' });
  const sh = sheet(el('h3', {}, title), el('p', { class: 'dim', style: 'margin:4px 0 0' }, sub),
    el('div', { class: 'stack rs' }, chipRow, el('label', { class: 'f' }, opts.label || 'Text they see · you can edit', ta, note), out, go));
  sh.box.classList.add('rsheet'); sh.box.id = idBase + 'Sheet';
  paint();
  go.onclick = async () => {
    if (ta.value.trim().length < 3) { out.replaceChildren(el('p', { class: 'err' }, ERR.KR8_REASON_REQUIRED)); return; }
    flushWrite(); go.disabled = true;
    try { await send(bilingualReason(ta.value, chips)); sh.close(); toast(opts.done || 'Rejected · reason sent', { ms: 2500 }); onDone(); }
    catch (e) { go.disabled = false; out.replaceChildren(errP(e)); }
  };
}

let cleanedNote = '';
async function selfieCleanup() {
  try {
    const due = await rpc<{ id: string; selfie_path: string }[]>('kr8_admin_verify_files_due');
    if (!due.length) return;
    const c = await v5Client();
    const { error } = await c.storage.from('kr8-verify').remove(due.map((d) => d.selfie_path));
    if (error) return;
    const n = await rpc<number>('kr8_admin_mark_selfies_deleted', { p_ids: due.map((d) => d.id) });
    if (n) { cleanedNote = `Deleted ${n} selfies older than 30 days (${bkkTime(new Date().toISOString())})`; LS('kr8-admin-cleaned', cleanedNote); }
  } catch { /* try again next time */ }
}
async function signSelfies(rows: Face[]) {
  const paths = rows.map((r) => r.selfie_path).filter((x): x is string => !!x);
  const out: Record<string, string> = {};
  if (!paths.length) return out;
  const { data } = await (await v5Client()).storage.from('kr8-verify').createSignedUrls(paths, 600);
  for (const d of data || []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}
function faceBody(r: Face, signed: Record<string, string>, look?: FaceLookalikes | null, cards: Record<string, LookCard> = {}): HTMLElement {
  // 0080 (17 Nov): the look-alike block comes first and compares the OTHER account with this selfie; the own-photo line below
  // never uses the look-alike wording (two look-alike-sounding lines with opposite meanings confused the founder)
  const lk = lookalikeBlock(look);
  const lc = r.live_check || {};
  const m = lc.match;
  const aws = lc.model === 'aws-rekognition';
  const own = ownPhotoLabel(m, /^sface/.test(lc.model || ''), aws);
  const selfie = r.selfie_path ? signed[r.selfie_path] : null;
  const pic = (src: string | null | undefined, cap: string, none: string) => el('figure', {}, src ? el('img', { src, alt: cap }) : el('div', { class: 'none' }, none), el('figcaption', { class: 'chip' }, cap));
  const step = (on: boolean | undefined, icon: string, t: string, bad = false) => el('div', { class: on ? 'y' : bad ? 'n' : '' }, ic(icon), t);
  const noBlink = !aws && ((!!lc.right && !lc.blink) || lc.blink_fallback === true);   // 0125: the AWS check has no blink step (3 photos)   // audit P2-5: the 12-s fallback is never shown as a blink
  const ownParts = own.text.split('✓');
  let lkBox: HTMLElement | null = null;
  if (lk) {
    const oc = cards[lk.other.user_id], me = cards[r.user_id];
    const otherName = `${lk.other.member_no != null ? `#${lk.other.member_no} ` : ''}${lk.other.first_name}`;
    const fact = (who: string, c: LookCard | undefined, joined: string | null | undefined, id: string) =>
      [el('span', {}, who), el('b', { 'data-ref': id }, c?.ref_code || '–'), el('b', { 'data-joined': id }, joinDate(joined))];
    lkBox = el('div', { class: 'lkbox' + (lk.verdict.tone === 'a' ? ' amber' : ''), id: 'verifyLookalike-' + r.id, 'data-tone': lk.verdict.tone },
      el('div', { class: 'lk-t' }, ic('warn'), lk.title),
      el('div', { class: 'pair' }, pic(oc?.photo, otherName, 'No card photo'), pic(selfie, 'This member’s selfie', 'Selfie deleted (30 days)')),
      el('div', { class: 'lk-v', 'data-dist': lk.dist }, el('b', {}, lk.verdict.tone === 'r' ? 'Same face' : 'Looks alike')),
      el('div', { class: 'lk-facts' }, el('span', {}), el('span', {}, 'Referrer code'), el('span', {}, 'Joined'),
        ...fact('This member', me, me?.joined_at ?? r.account_created, 'me'), ...fact(otherName, oc, oc?.joined_at, 'other')),
      lk.also ? el('div', { class: 'xs', style: 'margin-top:8px' }, `Also close: ${lk.also}`) : null);
  }
  // 18 Nov (founder: "numbers are confusing, I can't decide"): ONE plain decision line first, with the reasons in words.
  const plain = (() => {
    const me = cards[r.user_id];
    if (lk) {
      const oc = cards[lk.other.user_id];
      const otherName = `${lk.other.member_no != null ? `#${lk.other.member_no} ` : ''}${lk.other.first_name}`;
      const invitedByOther = !!(me?.ref_code && oc && lk.other.member_no != null && me.ref_code.toLowerCase() === `k${String(lk.other.member_no).padStart(5, '0')}`);
      const why = [lk.verdict.tone === 'r' ? `This selfie is the same face as ${otherName}` : `This selfie looks a bit like ${otherName}`];
      if (invitedByOther) why.push(`They joined with ${otherName}'s own invite link`);
      return lk.verdict.tone === 'r'
        ? { tone: 'r', head: `Reject: second account of ${otherName}`, why }
        : { tone: 'a', head: `Check: compare with ${otherName}`, why: [...why, 'If both are one human, reject. If they are two different people, approve.'] };
    }
    // 19 Nov: a card photo that does not match is handled automatically (the member is asked to change it), so it is not the founder's question
    return { tone: own.tick ? 'g' : 'a', head: 'Approve: no other account has this face', why: ['Real face, clear, not a photo of a screen? Then approve'] };
  })();
  const plainBox = el('div', { class: `plainv t-${plain.tone}`, id: 'verifyPlain-' + r.id,
      style: `border-radius:16px;padding:14px 16px;margin:10px 0 12px;border:1px solid ${plain.tone === 'r' ? '#ff6b81' : plain.tone === 'g' ? '#2ecc8f' : '#f5b041'};background:${plain.tone === 'r' ? 'rgba(255,107,129,.10)' : plain.tone === 'g' ? 'rgba(46,204,143,.10)' : 'rgba(245,176,65,.10)'}` },
    el('b', { style: 'font-size:20px;display:block;margin-bottom:6px' }, plain.head),
    ...plain.why.map((w) => el('div', { style: 'font-size:15px;opacity:.9;margin-top:2px' }, '• ' + w)));
  return el('div', { 'data-verify': r.id },
    el('h2', { style: 'font-size:26px' }, r.first_name),
    plainBox,
    el('div', { class: 'dim sm', style: 'margin-top:2px' }, `Joined ${ago(r.account_created)} · ${r.approved_reels} approved Reels · sent ${ago(r.created_at)}`),
    lkBox,
    el('div', { class: 'pair' }, pic(r.profile_photo, 'Profile photo', 'No photo'), pic(selfie, 'Live selfie', 'Selfie deleted (30 days)')),
    aws && m != null ? el('div', { class: 'score ' + own.tone, 'data-match': String(m) },
      el('b', {}, ...(own.tick && ownParts.length > 1 ? [ownParts[0], el('span', { class: 'tick' }, '✓'), ownParts[1]] : ['Card photo does not match: the member was asked to change it (nothing for you to do)']))) : null,
    el('div', { class: 'steps' }, step(lc.straight, 'face', 'Straight'), step(lc.left, 'left', 'Left'), step(lc.right, 'right', 'Right'), step(lc.blink && !lc.blink_fallback, 'blink', noBlink ? 'No blink seen' : 'Blink', noBlink)),
    noBlink ? el('div', { class: 'warnbox', 'data-noblink': '1' }, ic('warn'), 'No blink seen (moved on after 12 s facing the camera). Could be a still photo held up: look at the selfie carefully.') : null,
    checkReasons(lc.review).length ? el('div', { class: 'warnbox', 'data-review': (lc.review || []).join(' ') }, ic('info'),
      el('span', {}, el('b', {}, 'Why it\u2019s here: '), checkReasons(lc.review).join(' · '))) : null,
    lc.device ? el('div', { class: 'faint xs', style: 'margin-top:8px' }, lc.device) : null,
    r.reject_reason ? el('p', { class: 'dim sm' }, 'Reason: ' + r.reject_reason) : null,
    el('div', { class: 'tip' }, ic('info'), 'Profile photo matches the selfie, clear face, not a photo of a screen.'));
}
// 19 Nov: the admin page no longer makes face codes itself (face-api.js retired; AWS Rekognition indexes faces on the server)
/** 0081: the instant check's reasons, in plain words for the founder */
const FACE_REASON: Record<string, string> = {
  same_face_other_account: 'Same face as an older account (similarity 0.60+): blocked as a second account',
  same_face_newer_account: 'Same face (0.60+) as a NEWER account: this one may be the original',
  looks_like_other_account: 'Looks like another member (similarity 0.50\u20130.60, or 0.50+ to their card photo)',
  borderline_match: 'Selfie only partly matches the card photo (below 0.45)',
  no_card_face: 'No face found in the card photo',
  liveness_doubt: 'Real-face score or frame-to-frame match lower than usual',
  auto_off: 'Instant decisions are switched off',
  old_server: 'Sent by the old route',
  live_check: 'Live check not passed', timeout: 'No head turn + blink in time', still: 'Never moved (still photo?)', lost: 'Face left the oval',
  noface: 'No clear face', swap: 'Face changed during the check', mismatch: 'Selfie is clearly not the card photo', spoof: 'Photo or screen held up (anti-spoof)',
  // 0125 server check (AWS Rekognition)
  aws_same_face: 'AWS: same face as another member (95%+). Nothing blocked: compare and decide',
  card_mismatch: 'AWS: selfie does not match the card photo (below 80%)',
  aws_error: 'AWS did not answer: check by eye',
  no_face: 'No clear face', many_faces: 'More than one face', too_dark: 'Too dark', too_blurry: 'Blurry photo', too_far: 'Face too far',
  eyes_closed: 'Eyes closed', sunglasses: 'Sunglasses', look_straight: 'Not facing the camera', turn_left_missing: 'No left turn', turn_right_missing: 'No right turn',
};
type FaceDecisionRow = { id: string; created_at: string; decision: 'pass' | 'review' | 'block' | 'fail'; reasons: string[]; match: number | null; dup_sim: number | null;
  dup_source: string | null; was_verified: boolean; engine: string | null; ms: string | null; device: string | null; user_id: string; member_no: number | null;
  first_name: string | null; photo: string | null; dup_member_no: number | null; dup_name: string | null };
type FaceCoverage = { members: number; new_check: number; comparable: number; card_only: number; none: number; verified: number; verified_not_comparable: number; old_faceapi_codes: number };
const DECISION: Record<FaceDecisionRow['decision'], [string, string]> = { pass: ['Verified', 'g'], review: ['Founder checks', 'p'], block: ['Blocked · 2nd account', 'r'], fail: ['Retry', ''] };
async function faceLogView() {
  const body = el('div', {}, loading());
  app.replaceChildren(el('div', { class: 'scr' }, el('div', { class: 'row', style: 'margin:6px 0 16px' }, el('a', { class: 'icb', href: '#more', 'aria-label': 'Back' }, ic('back')),
    el('h1', { style: 'font-size:26px' }, 'Face auto-decisions')), body), tabbar('more'));
  window.scrollTo(0, 0);
  try {
    const [rows, cov] = await Promise.all([rpc<FaceDecisionRow[]>('kr8_admin_face_decisions', { p_limit: 200 }), rpc<FaceCoverage>('kr8_admin_face_coverage').catch(() => null)]);
    const covBox = cov ? el('div', { class: 'card', id: 'faceCoverage', style: 'margin-bottom:12px' },
      el('b', {}, `${cov.comparable} of ${cov.members} members can be compared`),
      el('p', { class: 'dim sm', style: 'margin:6px 0 0' }, `${cov.new_check} passed the new 5-second check · ${cov.verified_not_comparable} have an old ✓ but no new face code (asked once in the app) · ${cov.none} have none yet`)) : null;
    body.replaceChildren(covBox || el('span'), ...(rows.length ? rows.map((r) => el('div', { class: 'li', 'data-decision': r.decision, 'data-id': r.id },
      r.photo ? el('img', { class: 'thumb', src: r.photo, alt: '', style: 'border-radius:12px' }) : el('span', { class: 'ic' }, ic('face')),
      el('span', { class: 'grow' },
        el('b', {}, `${r.member_no != null ? '#' + r.member_no + ' ' : ''}${r.first_name || '–'}`),
        el('span', { class: 's' }, `${bkkTime(r.created_at)} · ${r.reasons.length ? r.reasons.map((k) => FACE_REASON[k] || k).join(' · ') : 'All clear'}`),
        el('span', { class: 's', style: 'display:block' }, [r.match != null ? `own photo ${r.match}` : '', r.dup_sim != null ? `most alike ${r.dup_member_no != null ? '#' + r.dup_member_no + ' ' : ''}${r.dup_name || ''} ${r.dup_sim}${r.dup_source === 'card' ? ' (card photo)' : ''}` : '',
          r.engine || '', r.ms ? `${(Number(r.ms) / 1000).toFixed(1)} s` : '', r.was_verified ? 'had old ✓' : ''].filter(Boolean).join(' · '))),
      pill(DECISION[r.decision]?.[0] || r.decision, DECISION[r.decision]?.[1] || ''))) : [empty('No instant checks yet')]));
  } catch (e) { body.replaceChildren(errP(e)); }
}
async function faceQueue() {
  app.replaceChildren(el('div', { class: 'scr' }, loading()));
  void selfieCleanup();
  let rows: Face[];
  try { rows = await rpc<Face[]>('kr8_admin_verifications', { p_status: 'pending' }); } catch (e) { app.replaceChildren(el('div', { class: 'scr' }, errP(e))); return; }
  const signed = await signSelfies(rows).catch(() => ({} as Record<string, string>));
  // 19 Nov: only the server (AWS) check's own look-alike counts (the old on-phone face codes, kr8_admin_verify_lookalikes, are retired)
  const looks: Record<string, FaceLookalikes> = {};
  for (const r of rows) { const a = awsLookalikes(r.live_check); if (a) looks[r.id] = a; }
  // 0080: card photo, referrer code and join date for each flagged member and the account it looks like (empty before 0080)
  const flagged = rows.filter((r) => looks[r.id]?.matches?.length);
  const cardIds = [...new Set(flagged.flatMap((r) => [r.user_id, looks[r.id].matches[0].user_id]))].slice(0, 20);
  const cards = cardIds.length ? await rpc<unknown>('kr8_admin_lookalike_cards', { p_users: cardIds }).then((x) => (isLookCardMap(x) ? x : {})).catch(() => ({} as Record<string, LookCard>)) : {};
  queue('Face checks', rows, (r, api) => {
    // 0080: with a look-alike flag, Approve is not the big green default: both buttons the same size and weight
    const lkFlag = !!looks[r.id]?.matches?.length;
    api.actions(el('div', {}, el('div', { class: lkFlag ? 'two even' : 'two' },
      btn('out-bad big', [ic('x'), 'Reject'], () => rejectSheet('Why not?', 'The member sees this reason.', FACE_CHIPS, 'verifyReject-' + r.id,
        (why) => rpc('kr8_admin_review_verification', { p_id: r.id, p_approve: false, p_reason: why }), api.next), { id: 'verifyReject-' + r.id }),
      btn(lkFlag ? 'ghost big' : 'go big', [ic('check'), 'Approve'], () => api.done('Verified ✓', async () => {
        await rpc('kr8_admin_review_verification', { p_id: r.id, p_approve: true });
        // 0125: an approved server (AWS) check goes into the duplicate search too (never blocks the approve)
        if (r.live_check?.model === 'aws-rekognition') void v5Client().then((c) => c.functions.invoke('face-check-aws', { body: { action: 'index', id: r.id } })).catch(() => undefined);
      }), { id: 'verifyApprove-' + r.id })),
    skipBtn(api)));
    return faceBody(r, signed, looks[r.id], cards);
  });
}

// ───────────────────────────── Report queue ─────────────────────────────
const CAT: Record<string, string> = { spam: 'Spam or scam', unsafe: 'Unsafe, adult or harassment', stolen: 'Stolen clip or pretending to be someone',
  wrong_place: 'Wrong place or the place is closed', block: 'Blocked the Kring Local' };
const RES: Record<string, [string, string]> = { kept: ['Kept', 'g'], removed: ['Removed', 'r'], dismissed: ['Closed', ''] };
function reportBody(r: Report, urls: Record<string, string>): HTMLElement {
  const cat = r.category && CAT[r.category];
  return el('div', { 'data-report': r.id, 'data-post': r.post_id || '' },
    r.video_path ? reelVideo(urls[r.video_path] || '', urls[r.poster_path || ''] || '', r.post_hidden ? [el('span', { class: 'chip red' }, ic('eyeoff'), 'Hidden now (3 reported)')] : [],
      [el('b', {}, r.target_name || '–'), r.post_body ? el('p', {}, r.post_body) : null]) : null,
    el('div', { class: 'card', style: 'margin-top:12px' },
      el('div', { class: 'row' }, el('span', { class: 'icb', style: 'background:rgba(255,90,107,.14);color:var(--bad)' }, ic('flag')),
        el('div', { class: 'grow' }, el('b', { style: 'font-size:17px;display:block' }, cat || 'Report about a person'), el('span', { class: 'dim sm' }, r.post_kind === 'ask' ? 'Ask BKK question' : r.post_id ? 'Reel report' : isAskAnswer(r) ? 'Ask BKK answer' : 'Chat or profile')),
        r.resolution ? pill(RES[r.resolution]?.[0] || r.resolution, RES[r.resolution]?.[1] || '') : null),
      !cat || r.reason ? el('p', { style: 'margin:12px 0 0' }, `“${r.reason}”`) : null,
      el('div', { class: 'facts' },
        el('span', { class: 'fact' }, 'About ', el('b', {}, r.target_name || '–')),
        el('span', { class: 'fact red' }, ic('flag'), el('b', {}, String(r.post_id ? r.post_reports : r.target_reports))),
        el('span', { class: 'fact' }, 'By ', el('b', {}, r.reporter_name || '–'), ' · ', ago(r.created_at)))),
    r.post_id ? el('div', { class: 'tip' }, ic('info'), 'A Reel reported by 3 different people hides itself until you decide.') : null);
}
/** Ask BKK answer reports (0057/0064): no post_id, reason starts "Ask BKK answer"; Keep / Remove via kr8_admin_ask_answer */
const isAskAnswer = (r: Report) => !r.post_id && /^Ask BKK answer/.test(r.reason || '');
async function reportQueue() {
  app.replaceChildren(el('div', { class: 'scr' }, loading()));
  let rows: Report[];
  try { rows = await rpc<Report[]>('kr8_admin_reports', { p_open: true, p_limit: 200 }); } catch (e) { app.replaceChildren(el('div', { class: 'scr' }, errP(e))); return; }
  const urls = await signReelPaths(rows.flatMap((r) => (r.video_path ? [r.video_path, r.poster_path || ''] : []))).catch(() => ({} as Record<string, string>));
  queue('Reports', rows, (r, api) => {
    const w = (a: 'keep' | 'remove' | 'dismiss') => () => (isAskAnswer(r) && a !== 'dismiss'
      ? rpc('kr8_admin_ask_answer', { p_report: r.id, p_action: a })
      : rpc('kr8_admin_resolve_report', { p_report: r.id, p_action: a }));
    api.actions(el('div', {}, r.post_id || isAskAnswer(r)
      ? el('div', { class: 'two' }, btn('out-bad big', [ic('trash'), 'Remove'], () => rejectSheet('Why remove?', r.post_id && r.post_kind !== 'ask' ? 'The member sees this reason on their Reel.' : 'Kept with the report.',
          REPORT_CHIPS, 'reportRemove-' + r.id, async (why) => {
            await w('remove')();
            // a removed Reel carries the reason like a hidden one (kr8_admin_review_reel p_note); Ask BKK keeps it with the report
            if (r.post_id && r.post_kind !== 'ask') await rpc('kr8_admin_review_reel', { p_reel: r.post_id, p_status: 'hidden', p_note: why }).catch(() => undefined);
          }, api.next, { cta: 'Send · remove', done: 'Removed · reason sent' }), { id: 'report-remove-' + r.id }),
        btn('go big', [ic('check'), 'Keep'], () => api.done('Kept · shown again', w('keep')), { id: 'report-keep-' + r.id }))
      : btn('pri big full', [ic('check'), 'Close report'], () => api.done('Report closed', w('dismiss')), { id: 'report-dismiss-' + r.id }),
    skipBtn(api)));
    return reportBody(r, urls);
  });
}

// ───────────────────────────── Reply queue ─────────────────────────────
async function copyLater(textP: Promise<string>): Promise<boolean> {
  try {
    const CI = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (CI && navigator.clipboard?.write) { await navigator.clipboard.write([new CI({ 'text/plain': textP.then((t) => new Blob([t], { type: 'text/plain' })) })]); return true; }
    await navigator.clipboard.writeText(await textP); return true;
  } catch { return false; }
}
async function sendViaApi(id: string): Promise<{ result_url?: string; error?: string }> {
  const c = await v5Client();
  const { data, error } = await c.functions.invoke('social-send', { body: { id } });
  if (!error) return data as { result_url?: string };
  const ctx = (error as { context?: Response }).context;
  const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
  return { error: (body as { error?: string } | null)?.error || String(error.message || 'SEND') };
}
function ruleTiles(st: SStatus | null): HTMLElement {
  if (!st) return el('div', {});
  const wait = Date.parse(st.next_allowed_at) - Date.now();
  return el('div', { class: 'stats', id: 'socialStatus', style: 'margin-bottom:12px' },
    el('div', { class: 'stat' }, el('b', {}, `${st.sent_today}/${st.max_per_day}`), el('span', {}, 'Sent today')),
    el('div', { class: 'stat' }, el('b', { class: wait > 0 ? '' : 'okc' }, wait > 0 ? bkkTime(st.next_allowed_at, false) : 'OK'), el('span', {}, wait > 0 ? 'Next allowed' : '20-min gap')),
    el('div', { class: 'stat' }, el('b', { class: st.kring_allowed ? 'okc' : '' }, st.kring_allowed ? 'OK' : 'Not yet'), el('span', {}, 'Kring mention')));
}
async function replyQueue() {
  app.replaceChildren(el('div', { class: 'scr' }, loading()));
  let rows: Social[]; let st: SStatus | null;
  try { [rows, st] = await Promise.all([rpc<Social[]>('kr8_admin_social_list', { p_status: 'pending' }), rpc<SStatus[]>('kr8_social_status').then((r) => r[0] || null)]); }
  catch (e) { app.replaceChildren(el('div', { class: 'scr' }, errP(e))); return; }
  rows = rows.filter((r) => r.status === 'pending');
  const pace = rPace(rLoad());
  const rItems: QItem[] = redditToday().map((x) => ({ ...x, reddit: true as const }));
  const note = pace.max === 0 ? el('div', { class: 'tip', id: 'redditNote', style: 'margin:0 0 12px' }, ic('info'), `Reddit: day ${pace.day} of 3 is read only, no comments today.`)
    : !rItems.length ? el('div', { class: 'tip', id: 'redditNote', style: 'margin:0 0 12px' }, ic('info'), pace.left ? 'Reddit: all suggested comments used.' : 'Reddit: limit reached, come back tomorrow.') : null;
  const igItems = igToday();
  const igSt = igLoad();
  const igNote = igPaused(igSt) ? `Instagram paused until ${bkkTime(igSt.pausedUntil!)} (More → Instagram).`
    : !igItems.length && igPace(igSt).left === 0 ? 'Instagram: 10 DMs sent today, come back tomorrow.' : '';
  const notes = [note, igNote ? el('div', { class: 'tip', id: 'igNote', style: 'margin:0 0 12px' }, ic('info'), igNote) : null].filter(Boolean) as HTMLElement[];
  const all: QItem[] = [...rItems, ...igItems, ...rows];
  const rLocked = (q: QItem) => 'reddit' in q && rLastPosted(q.id) + R_COOL_MS > Date.now();
  const coolLine = el('div', { class: 'tip', id: 'redditUnlock', style: 'margin:0 0 12px;display:none;color:var(--warn)' }, ic('clock'), el('span', {}));
  notes.unshift(coolLine);
  const coolTick = () => {
    if (!coolLine.isConnected && coolTimer) { clearInterval(coolTimer); return; }
    const left = rLastPosted('') + R_COOL_MS - Date.now();
    const waiting = all.some((q) => 'reddit' in q && !rLoad().posted[q.id] && !rLoad().skipped[q.id] && q.id !== rPending?.id);
    if (left > 0 && waiting) { const sec = Math.ceil(left / 1000); coolLine.style.display = 'flex'; coolLine.lastElementChild!.textContent = `Reddit unlocks in ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
    else coolLine.style.display = 'none';
  };
  let coolTimer = 0;
  queue<QItem>('Replies to send', all, (q, api) => {
    if ('reddit' in q) return redditCard(q, api);
    if ('ig' in q) return igCard(q, api);
    const r = q;
    const out = el('div', {});
    const text = el('pre', { class: 'reply', 'data-text': r.id }, r.final_text || r.reply_text);
    const card = el('div', { 'data-social': r.id },
      ruleTiles(st),
      el('div', { class: 'card' },
        el('div', { class: 'row' }, pill('r/' + r.subreddit, 'p'), el('span', { class: 'grow' }), el('span', { class: 'faint xs' }, ago(r.created_at))),
        el('a', { href: r.thread_url, target: '_blank', rel: 'noopener noreferrer', class: 'link', style: 'display:block;margin-top:10px;font-size:16px;color:var(--text)' }, r.thread_title || r.thread_url),
        r.why_helps ? el('p', { class: 'dim sm', style: 'margin:8px 0 0' }, 'Why it helps: ' + r.why_helps) : null,
        text,
        (r.mentions_kring || mentionsKring(r.reply_text)) ? el('div', { class: 'warnbox', 'data-mentions': '1', style: 'color:var(--warn);border-color:rgba(255,196,77,.4);background:rgba(255,196,77,.07)' }, ic('info'), 'Mentions Kring · a disclosure line is added') : null,
        r.error ? el('p', { class: 'err' }, r.error) : null),
      el('div', { class: 'tip' }, ic('info'), 'Max 5 a day · 20+ minutes apart · Kring only after 9 replies without it.'), out);
    const copy = btn('pri big full', [ic('copy'), 'Copy + open thread'], undefined, { id: 'socialCopy-' + r.id });
    const edit = btn('ghost sm2', [ic('edit'), 'Edit'], undefined, { id: 'socialEdit-' + r.id });
    const auto = btn('ghost sm2', [ic('send'), 'Auto-send'], undefined, { id: 'socialSend-' + r.id });
    const skipT = btn('ghost sm2', [ic('trash'), 'Discard'], undefined, { id: 'socialSkip-' + r.id, style: 'color:var(--bad)' });
    const lock = (on: boolean) => { for (const b of [copy, edit, auto, skipT]) b.disabled = on; };
    copy.onclick = async () => {
      flushWrite(); lock(true);
      const prep = rpc<{ text: string; thread_url: string }>('kr8_admin_social_prepare', { p_id: r.id, p_mode: 'manual' });
      const copiedP = copyLater(prep.then((p) => p.text));
      let p: { text: string; thread_url: string };
      try { p = await prep; } catch (e) { lock(false); out.replaceChildren(errP(e)); return; }
      const copied = await copiedP;
      text.textContent = p.text;
      try { await rpc('kr8_admin_social_done', { p_id: r.id, p_result_url: null }); } catch { /* Undo still works */ }
      counts = null;
      toast(copied ? 'Copied · long-press the comment box and paste' : 'Could not copy · select the text and copy it', { ms: 4000 });
      api.actions(el('div', { class: 'stack' },
        el('a', { class: 'btn pri big full', href: p.thread_url, target: '_blank', rel: 'noopener noreferrer', id: 'socialOpen-' + r.id }, ic('open'), 'Open thread'),
        el('div', { class: 'two' }, btn('ghost', ['Undo (not posted)'], async () => { try { await rpc('kr8_admin_social_undo', { p_id: r.id }); toast('Undone', { ms: 2000 }); lock(false); api.actions(bar); } catch (e) { out.replaceChildren(errP(e)); } }, { id: 'socialUndo-' + r.id }),
          btn('go', ['Next', ic('chev')], api.next, { id: 'socialNext' }))));
      window.open(p.thread_url, '_blank', 'noopener');
    };
    edit.onclick = () => {
      const ta = el('textarea', { rows: '9', id: 'socialText-' + r.id }) as HTMLTextAreaElement;
      ta.value = r.reply_text;
      const save = btn('pri', ['Save'], async () => {
        try { await rpc('kr8_admin_social_edit', { p_id: r.id, p_text: ta.value }); r.reply_text = ta.value; r.final_text = null; text.textContent = ta.value; ta.replaceWith(text); api.actions(bar); toast('Saved', { ms: 2000 }); }
        catch (e) { out.replaceChildren(errP(e)); }
      }, { id: 'socialSave-' + r.id });
      text.replaceWith(ta);
      api.actions(el('div', { class: 'two' }, btn('ghost', ['Cancel'], () => { ta.replaceWith(text); api.actions(bar); }), save));
      ta.focus();
    };
    auto.onclick = async () => {
      flushWrite(); lock(true);
      const res = await sendViaApi(r.id);
      if (res.result_url) { toast('Posted', { ms: 2000 }); api.next(); return; }
      lock(false); out.replaceChildren(el('p', { class: 'err' }, errText(res.error || 'SEND')));
    };
    skipT.onclick = () => api.done('Discarded', () => rpc('kr8_admin_social_skip', { p_id: r.id }));
    const bar = el('div', {}, copy, el('div', { class: 'row', style: 'gap:8px;margin-top:10px' }, edit, auto, skipT), skipBtn(api));
    for (const b of [edit, auto, skipT]) b.style.flex = '1';
    api.actions(bar);
    return card;
  }, '#todo', el('div', {}, ...notes), (q) => !rLocked(q));
  coolTick(); coolTimer = window.setInterval(coolTick, 1000);
}

// ───────────────────────────── New venue queue ─────────────────────────────
const CAT_OF: Record<string, string> = { cafe: 'coffee', dessert: 'coffee', casual: 'food', restaurant: 'food', rooftop: 'food', studio: 'classes', experience: 'fun', stay: 'stay' };
const KIND_LABEL: Record<string, string> = { cafe: 'Café', restaurant: 'Restaurant', dessert: 'Dessert', stay: 'Place to stay' };
const VENUE_CHIPS: Chip[] = [
  ['Photos unclear', 'The photos are not clear enough. Please send a clear shopfront photo.', 'รูปยังไม่ชัดพอ รบกวนส่งรูปหน้าร้านที่ชัดๆ มาใหม่อีกครั้งครับ'],
  ['Outside our areas', 'Your place is outside the areas Kring covers for now.', 'ตอนนี้ร้านของคุณยังอยู่นอกย่านที่กริ๊ง!ให้บริการครับ'],
  ['Treat not in baht', 'Please give the treat as a baht amount, not a percent.', 'รบกวนระบุสิทธิพิเศษเป็นจำนวนเงินบาท ไม่ใช่เปอร์เซ็นต์ครับ'],
  ['Details missing', 'Some details are missing. Please check the form and apply again.', 'ข้อมูลยังไม่ครบ รบกวนตรวจฟอร์มแล้วสมัครใหม่อีกครั้งครับ'],
];
type Owner = { name: string; contact?: string | null; dealTh?: string | null; dealEn?: string | null; line?: string | null; practice?: boolean };

/** Welcome message for the owner (Thai + English, sent on LINE). Only the English half is shown here; Copy copies both. */
function welcomeActions(venueId: string, owner: Owner, previewBox?: HTMLElement): HTMLElement {
  const test = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}?v=${encodeURIComponent(venueId)}`;
  let msg = lineMessage({ name: owner.name, contact: owner.contact, link: '', dealTh: owner.dealTh, dealEn: owner.dealEn, practice: owner.practice, test });
  const enPart = () => msg.slice(msg.indexOf('\nHello') >= 0 ? msg.indexOf('\nHello') + 1 : 0);
  const prev = previewBox || el('div', {});
  const paint = () => prev.replaceChildren(el('div', { class: 'msgprev', id: 'lineMsg', 'data-full-length': String(msg.length) }, enPart()));
  paint();
  void rpc<string>('kr8_admin_owner_key', { p_venue: venueId }).then((k) => {
    if (!k) return;
    msg = lineMessage({ name: owner.name, contact: owner.contact, link: staffLink(venueId).replace('staff.html', 'owner.html') + '&k=' + encodeURIComponent(k), dealTh: owner.dealTh, dealEn: owner.dealEn, practice: owner.practice, test });
    paint();
  }).catch(() => undefined);
  const lid = (owner.line || '').trim();
  const safe = lid.replace(/[^A-Za-z0-9._@-]/g, '');
  const href = safe.startsWith('@') ? `https://line.me/R/ti/p/${safe}` : `https://line.me/R/ti/p/~${safe}`;
  const copyMsg = () => navigator.clipboard?.writeText(msg).then(() => toast('Welcome message copied', { ms: 2500 })).catch(() => toast('Could not copy', { ms: 2500 }));
  const main = lid
    ? el('a', { class: 'btn pri big full', href, target: '_blank', rel: 'noopener', id: 'openLine' }, ic('msg'), `Copy message + open LINE ${lid}`)
    : btn('pri big full', [ic('copy'), 'Copy welcome message'], () => void copyMsg(), { id: 'copyLine' });
  if (lid) main.addEventListener('click', () => void copyMsg());
  return el('div', { class: 'stack' }, main,
    lid ? btn('ghost full', [ic('copy'), 'Copy message only'], () => void copyMsg(), { id: 'copyLine' }) : null,
    el('div', { class: 'two', style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' },
      el('a', { class: 'btn ghost', href: standLink(venueId) + '&f=sticker', target: '_blank', rel: 'noopener', id: 'dlSticker-' + venueId }, ic('print'), 'Door sticker'),
      el('a', { class: 'btn ghost', href: standLink(venueId) + '&f=stand', target: '_blank', rel: 'noopener', id: 'dlStand-' + venueId }, ic('print'), 'A6 stand')));
}

function venueApproved(venueId: string, owner: Owner, next: () => void) {
  const prev = el('div', {});
  const s = el('div', { class: 'scr' },
    el('div', { class: 'okhero', id: 'pinCard' }, el('div', { class: 'ic' }, ic('party')), el('h1', { style: 'font-size:28px' }, `${owner.name} is live`),
      el('p', { class: 'dim', style: 'margin:6px 0 0' }, owner.practice ? 'Practice listing · hidden from Deals' : 'Now showing in Deals')),
    el('div', { class: 'sec' }, 'Welcome message (Thai + English, English shown)'), prev,
    el('div', { style: 'margin-top:14px' }, welcomeActions(venueId, owner, prev)),
    el('div', { style: 'margin-top:14px' }, btn('go big full', ['Next', ic('chev')], next, { id: 'venueNext' })));
  app.replaceChildren(s);
  window.scrollTo(0, 0);
}

function appBody(a: App, api: QApi): HTMLElement {
  const sel = (id: string, opts: readonly string[], v: string) => { const s = el('select', { id }); for (const o of opts) s.append(el('option', { value: o, selected: o === v }, o)); return s; };
  const area = sel('area-' + a.id, V5_AREAS, (V5_AREAS as readonly string[]).includes(a.district || '') ? a.district! : 'Bangkok');
  const cat = sel('cat-' + a.id, ['coffee', 'food', 'classes', 'fun', 'stay'], CAT_OF[a.kind || a.category] || 'coffee');
  const hoursEn = el('input', { id: 'hoursEn-' + a.id, placeholder: '08:00–18:00 daily' });
  const hoursTh = el('input', { id: 'hoursTh-' + a.id, placeholder: '08:00–18:00 (Thai)' });
  const dealEn = el('input', { id: 'dealEn-' + a.id });
  const dealTh = el('input', { id: 'dealTh-' + a.id });
  if (a.treat_text) { const tr = splitTreat(a.treat_text); dealTh.value = tr.th; dealEn.value = tr.en; }
  else if (a.band === 1) {
    dealEn.value = `฿${a.band1_discount_thb} off when your bill is ฿${a.band1_min_bill_thb} or more`;
    dealTh.value = `ลด ฿${a.band1_discount_thb} เมื่อยอดครบ ฿${a.band1_min_bill_thb} ขึ้นไป`;
  }
  const nameTh = el('input', { id: 'nameTh-' + a.id });
  void rpc<{ name_th?: string; hours_en?: string; hours_th?: string }>('kr8_admin_app_meta', { p_application: a.id }).then((m) => {
    if (m?.name_th && !nameTh.value) nameTh.value = m.name_th;
    if (m?.hours_en && !hoursEn.value) hoursEn.value = m.hours_en;
    if (m?.hours_th && !hoursTh.value) hoursTh.value = m.hours_th;
  }).catch(() => undefined);
  const autoSlug = a.venue_name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  const slug = el('input', { id: 'slug-' + a.id, value: autoSlug, placeholder: 'baan-noi-cafe', autocapitalize: 'none' });
  let practiceOn = (a.referral_host_code || '').toLowerCase() === 'bew-fw';
  const practice = sw('practice-' + a.id, el('span', {}, el('b', { style: 'display:block' }, 'Practice listing'), el('span', { class: 'dim sm' }, 'Full flow works, hidden from Deals')), practiceOn, (on) => { practiceOn = on; });
  const files = el('input', { id: 'photos-' + a.id, type: 'file', accept: 'image/*', multiple: true });
  const msg = el('div', {});
  const err = (field: HTMLElement, text: string) => { field.closest('label')?.append(el('span', { class: 'err' }, text)); field.scrollIntoView({ block: 'center' }); };
  const photos = [a.photo_b64, ...(a.extra_photos_b64 || [])].filter((x): x is string => !!x);
  const approve = btn('go big', [ic('check'), 'Approve · go live'], undefined, { id: 'approve-' + a.id });
  const reject = btn('out-bad big', [ic('x'), 'Reject'], undefined, { id: 'reject-' + a.id });
  approve.onclick = async () => {
    msg.replaceChildren(); app.querySelectorAll('label .err').forEach((n) => n.remove());
    if (hoursTh.value.trim().length < 3) return err(hoursTh, 'Fill in the opening hours (Thai)');
    if (hoursEn.value.trim().length < 3) return err(hoursEn, 'Fill in the opening hours (English)');
    flushWrite(); approve.disabled = reject.disabled = true; approve.replaceChildren('Working…');
    try {
      const up = await uploadPhotos(a.id, photos, files.files);
      const r = await rpc<{ venue_id: string; pin: string; deal_th: string; deal_en: string }>('kr8_admin_approve_venue2', {
        p_application: a.id, p_area: area.value, p_cat: cat.value, p_hours_en: hoursEn.value.trim(), p_hours_th: hoursTh.value.trim(),
        p_photos: up, p_deal_en: dealEn.value.trim() || null, p_deal_th: dealTh.value.trim() || null, p_name_th: nameTh.value.trim() || null,
        p_practice: practiceOn, p_slug: slug.value.trim() || null,
      });
      counts = null;
      venueApproved(r.venue_id, { name: a.venue_name, contact: a.owner_name, line: a.line_id, dealTh: r.deal_th || dealTh.value.trim(), dealEn: r.deal_en || dealEn.value.trim(), practice: practiceOn }, api.next);
    } catch (e) {
      approve.disabled = reject.disabled = false; approve.replaceChildren(ic('check'), 'Approve · go live');
      const code = String((e as Error).message);
      if (code === 'KR8_DEAL_WORDS' || code === 'KR8_DEAL_TEXT_REQUIRED') err(dealEn, errText(e));
      else if (code === 'KR8_BAD_PHOTOS' || code === 'KR8_NEED_PHOTO') err(files, errText(e));
      else if (code === 'KR8_BAD_AREA') err(area, errText(e));
      else msg.replaceChildren(errP(e));
    }
  };
  reject.onclick = () => rejectSheet('Why not?', 'The venue sees this reason.', VENUE_CHIPS, 'confirmReject-' + a.id,
    (why) => rpc('kr8_admin_reject_venue', { p_application: a.id, p_reason: why }), api.next);
  api.actions(el('div', {}, el('div', { class: 'two' }, reject, approve), skipBtn(api)));
  return el('div', { 'data-app': a.id },
    a.photo_b64 ? el('div', { class: 'hero', style: `background-image:url(data:image/jpeg;base64,${a.photo_b64})` }) : el('div', { class: 'warnbox', style: 'margin-bottom:12px' }, ic('warn'), 'No photo · add one below before approving'),
    a.extra_photos_b64?.length ? el('div', { class: 'pgrid', style: 'margin:-4px 0 14px' }, ...a.extra_photos_b64.map((b) => el('img', { src: `data:image/jpeg;base64,${b}`, alt: '' }))) : null,
    el('div', { class: 'row' }, el('h2', { class: 'grow', style: 'font-size:26px' }, a.venue_name), pill(KIND_LABEL[a.kind || ''] || a.category, 'p')),
    el('div', { class: 'facts' },
      el('span', { class: 'fact' }, el('b', {}, a.owner_name)),
      a.line_id ? el('span', { class: 'fact' }, 'LINE ', el('b', {}, a.line_id)) : null,
      a.phone ? el('a', { class: 'fact', href: 'tel:' + a.phone }, a.phone) : null,
      a.referral_host_code ? el('span', { class: 'fact' }, ic('link'), 'Ref ', el('b', {}, a.referral_host_code)) : null,
      el('a', { class: 'fact', href: a.maps_url, target: '_blank', rel: 'noopener' }, ic('open'), [a.district, a.city].filter(Boolean).join(', ') || 'Map'),
      el('span', { class: 'fact' }, ic('clock'), ago(a.created_at))),
    a.treat_text ? el('div', { class: 'card', style: 'margin-top:12px' }, el('div', { class: 'faint xs' }, 'TREAT · THEIR WORDS'), el('div', { style: 'margin-top:4px;font-weight:600' }, a.treat_text)) : null,
    a.licensed_stay ? el('p', { class: 'okc sm' }, '✓ Owner ticked "licensed to take guests"') : null,
    el('div', { class: 'sec' }, 'Shown in the app'),
    el('div', { class: 'stack' },
      el('div', { class: 'g2' }, el('label', { class: 'f' }, 'Area', area), el('label', { class: 'f' }, 'Deals category', cat)),
      el('div', { class: 'g2' }, el('label', { class: 'f' }, 'Hours (English)', hoursEn), el('label', { class: 'f' }, 'Hours (Thai)', hoursTh)),
      el('label', { class: 'f' }, 'Deal (English) · baht, no percent', dealEn),
      el('label', { class: 'f' }, 'Deal (Thai)', dealTh),
      el('div', { class: 'g2' }, el('label', { class: 'f' }, 'Thai name (optional)', nameTh), el('label', { class: 'f' }, 'Link name (stand QR)', slug)),
      el('label', { class: 'f' }, 'More photos (up to 3)', files),
      practice),
    msg);
}
async function venueQueue() {
  app.replaceChildren(el('div', { class: 'scr' }, loading()));
  let rows: App[];
  try { rows = await rpc<App[]>('kr8_admin_applications', { p_status: 'pending' }); } catch (e) { app.replaceChildren(el('div', { class: 'scr' }, errP(e))); return; }
  queue('New venues', rows, (a, api) => appBody(a, api));
}

// ───────────────────────────── All members list (0053_kr8_admin_member_list) ─────────────────────────────
export type MemberRow = { user_id: string; member_no: number | null; first_name: string | null; photo: string | null; joined_at: string;
  ref_code: string | null; src_code: string | null; who: string | null; area: string | null; langs: string[] | null; gender: string | null; show_gender: boolean;
  ig_handle: string | null; tiktok_handle: string | null; bio: string | null; interests: string[] | null; verified: boolean; age_ok: boolean; terms_ok: boolean;
  last_active_at: string | null; reels_approved: number; reels_waiting: number; reels_hidden: number; card_complete: boolean; is_test: boolean;
  /** 0070: 'unchecked' = the phone could not run the face check on this card photo (audit P1-1) → look by eye */ photo_check?: 'ok' | 'unchecked' | 'no_face' | 'look' | null };
export type MemberList = { total: number; test_hidden: number; members: MemberRow[] };
export function isMemberList(v: unknown): v is MemberList {
  const o = v as MemberList | null;
  return !!o && typeof o.total === 'number' && typeof o.test_hidden === 'number' && Array.isArray(o.members)
    && o.members.every((m) => !!m && typeof m.user_id === 'string' && typeof m.joined_at === 'string' && typeof m.reels_approved === 'number');
}
const LANG: Record<string, string> = { TH: 'Thai', EN: 'English', ZH: 'Chinese', JA: 'Japanese', KO: 'Korean', HI: 'Hindi', DE: 'German', ES: 'Spanish', FR: 'French', RU: 'Russian', IT: 'Italian', AR: 'Arabic', VI: 'Vietnamese', ID: 'Indonesian', MS: 'Malay', PT: 'Portuguese', NL: 'Dutch' };
export const langNames = (l: string[] | null) => (l || []).map((c) => LANG[c.toUpperCase()] || c).join(', ');
const clock = (iso: string, tz: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
/** "joined 15 Nov · 21:22 Bangkok · 19:52 India" (the day is the Bangkok day). */
export function memberJoined(iso: string): string {
  const day = new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' });
  return `joined ${day} · ${clock(iso, 'Asia/Bangkok')} Bangkok · ${clock(iso, 'Asia/Kolkata')} India`;
}
export const memberVia = (m: Pick<MemberRow, 'ref_code' | 'src_code'>) => (m.ref_code ? `via ${m.ref_code}` : m.src_code ? `via ${m.src_code}` : 'direct');
const handle = (h: string) => h.trim().replace(/^@+/, '').replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\/@?/i, '').replace(/[/?#].*$/, '');
export const igUrl = (h: string) => `https://instagram.com/${encodeURIComponent(handle(h))}`;
export const ttUrl = (h: string) => `https://tiktok.com/@${encodeURIComponent(handle(h))}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export function cardMissing(m: Pick<MemberRow, 'photo' | 'first_name' | 'area'>): string[] {
  return [!m.photo && 'photo', !(m.first_name || '').trim() && 'name', !(m.area || '').trim() && 'area'].filter(Boolean) as string[];
}
/** 0122 Photo OK: the row (and any open copy of it) stops saying "Photo needs a look". */
function photoChecked(m: MemberRow) {
  m.photo_check = 'ok';
  document.querySelectorAll<HTMLElement>(`[data-member="${m.user_id}"] [data-photo-check="unchecked"], .ml-pcheck [data-photo-check="unchecked"]`).forEach((n) => n.remove());
  // the other copy of the button (row ↔ sheet) shows the same done state
  document.querySelectorAll<HTMLButtonElement>(`[data-photo-ok="${m.user_id}"]:not([data-done])`).forEach((b) => { b.disabled = true; b.dataset.done = '1'; b.textContent = '✓ Photo OK'; });
}
function photoSheet(m: MemberRow) {
  const s = sheet(el('img', { class: 'ml-big', src: m.photo || '', alt: `Photo of ${m.first_name || 'member'}` }),
    el('h3', { style: 'margin-top:12px' }, m.first_name || 'No name yet'), el('p', { class: 'dim sm', style: 'margin:2px 0 0' }, `#${m.member_no ?? '–'} · ${memberJoined(m.joined_at)}`),
    m.photo_check && m.photo_check !== 'ok' ? el('div', { class: 'ml-pcheck', style: 'display:flex;gap:8px;align-items:center;margin-top:10px' },
      photoStateChip(m.user_id, m.photo_check, 'pill', () => photoChecked(m))) : null,
    el('button', { class: 'btn ghost', type: 'button', id: 'photoClose', style: 'width:100%;margin-top:14px' }, 'Close'));
  (s.box.querySelector('#photoClose') as HTMLButtonElement).onclick = s.close;
}
export function memberRow(m: MemberRow, onPhoto: (m: MemberRow) => void = photoSheet): HTMLElement {
  const name = m.first_name?.trim() || 'No name yet';
  const ph = m.photo
    ? (() => { const b = el('button', { type: 'button', class: 'ml-ph', id: 'mlPhoto-' + m.user_id, 'aria-label': `Enlarge photo of ${name}` }, el('img', { src: m.photo, alt: '', loading: 'lazy' })); b.onclick = () => onPhoto(m); return b; })()
    : el('div', { class: 'ml-ph none', 'data-nophoto': '1' }, ic('face'), el('span', {}, 'No photo yet'));
  const gender = m.gender ? el('span', { class: 'ml-g', 'data-gender': m.show_gender ? 'shown' : 'hidden', title: m.show_gender ? 'Shown on their card' : 'Hidden by the member' },
    cap(m.gender), m.show_gender ? null : ic('lock')) : null;
  const facts = [m.who === 'local' ? 'Local' : m.who === 'traveller' ? 'Traveller' : m.who ? cap(m.who) : null, m.area || null, langNames(m.langs) || null].filter(Boolean) as string[];
  const links = [m.ig_handle && el('a', { class: 'ml-l', href: igUrl(m.ig_handle), target: '_blank', rel: 'noopener', 'data-ig': handle(m.ig_handle) }, 'IG @' + handle(m.ig_handle)),
    m.tiktok_handle && el('a', { class: 'ml-l', href: ttUrl(m.tiktok_handle), target: '_blank', rel: 'noopener', 'data-tt': handle(m.tiktok_handle) }, 'TikTok @' + handle(m.tiktok_handle))].filter(Boolean) as HTMLElement[];
  const miss = cardMissing(m);
  const tick = (on: boolean, yes: string, no: string) => el('span', { class: 'pill ' + (on ? 'g' : '') }, on ? '✓ ' + yes : no);
  return el('div', { class: 'ml-row', 'data-member': m.user_id, 'data-no': String(m.member_no ?? '') },
    el('div', { class: 'ml-top' }, ph,
      el('div', { class: 'ml-main' },
        // 20 Nov (founder): the name opens the member page (#m/…), like every other member link in the admin
        el('a', { class: 'ml-name ml-open', href: `#m/${m.user_id}`, 'data-open-member': m.user_id, 'aria-label': `Open member ${name}` },
          el('b', {}, name), el('span', { class: 'faint' }, `#${m.member_no ?? '–'}`), m.is_test ? pill('test', 'a') : null, el('span', { class: 'ml-go', 'aria-hidden': 'true' }, '›')),
        el('div', { class: 'dim xs' }, memberJoined(m.joined_at)),
        el('div', { class: 'xs ml-via' }, memberVia(m)),
        el('div', { class: 'sm ml-facts' }, facts.join(' · '), gender ? ' · ' : '', gender),
        links.length ? el('div', { class: 'ml-links' }, ...links) : null)),
    m.bio ? el('p', { class: 'sm ml-bio' }, m.bio) : null,
    m.interests?.length ? el('div', { class: 'ml-int' }, ...m.interests.map((t) => pill(t))) : null,
    el('div', { class: 'ml-ticks' }, tick(m.verified, 'Verified', 'Not verified'),
      el('span', { class: 'pill ' + (miss.length ? 'a' : 'g'), 'data-complete': miss.length ? '0' : '1' }, miss.length ? `Card missing ${miss.join(', ')}` : '✓ Card complete'),
      // 0162: one honest photo label (no face → hidden automatically · unclear → tap if fine · unchecked → being checked)
      photoStateChip(m.user_id, m.photo_check, 'pill', () => photoChecked(m))),
    el('div', { class: 'ml-foot xs dim' },
      el('span', { 'data-reels': `${m.reels_approved}/${m.reels_waiting}/${m.reels_hidden}` }, `Reels: ${m.reels_approved} live · ${m.reels_waiting} waiting · ${m.reels_hidden} hidden`),
      el('span', {}, `Last seen ${ago(m.last_active_at)}`)));
}
let mlTest = LS('kr8-admin-mltest') === '1';
function allMembersCard(open: boolean): HTMLElement {
  const sub = el('span', { class: 'dim sm' }, 'Newest first, with photos');
  const title = el('b', {}, 'All members');
  const list = el('div', { id: 'mlList' }, loading());
  const load = async () => {
    list.replaceChildren(loading());
    let r: unknown;
    try { r = await rpc<MemberList>('kr8_admin_member_list', { p_limit: 200, p_include_test: mlTest }); } catch (e) { list.replaceChildren(errP(e)); return; }
    if (!isMemberList(r)) { list.replaceChildren(el('p', { class: 'err' }, 'Could not read the member list')); return; }
    title.textContent = `All members (${r.total})`;
    sub.textContent = mlTest ? 'Newest first · test members shown' : r.test_hidden ? `Newest first · ${r.test_hidden} test members hidden` : 'Newest first';
    list.replaceChildren(...(r.members.length ? r.members.map((m) => memberRow(m)) : [el('p', { class: 'dim' }, 'No members yet.')]),
      r.total > r.members.length ? el('p', { class: 'faint xs', style: 'margin:10px 0 0' }, `Showing the newest ${r.members.length}.`) : '');
  };
  const toggle = sw('mlShowTest', el('span', { class: 'sm' }, 'Show test members'), mlTest, (on) => { mlTest = on; LS('kr8-admin-mltest', on ? '1' : '0'); void load(); });
  void load();
  return el('details', { class: 'card', id: 'allMembers', open },
    el('summary', {}, el('span', { class: 'icb' }, ic('users')), el('div', { class: 'grow' }, title, sub), ic('chev')),
    el('div', { class: 'in' }, el('div', { class: 'ml-sw' }, toggle), list));
}

// ───────────────────────────── Members ─────────────────────────────
let ckRef = LS('kr8-admin-ckref') ?? 'pich';
async function membersView(jump = false) {
  const body = el('div', {}, loading());
  const all = allMembersCard(true);
  const recLink = el('a', { class: 'li', href: '#recruiters', id: 'membersRecruiters', style: 'margin-bottom:12px' }, el('span', { class: 'ic' }, ic('link')),
    el('span', { class: 'grow' }, el('b', {}, 'Recruiters'), el('span', { class: 's' }, 'Sign-ups per ref code · credit members who joined without one')), ic('chev'));
  screen('members', head('Kring admin', 'Members'), recLink, all, body);
  if (jump) all.scrollIntoView({ block: 'start' });
  const [attr, creators] = await Promise.all([
    rpc<Attr[]>('kr8_admin_attribution').catch(() => [] as Attr[]),
    rpc<Creator[]>('kr8_admin_creator_counts').catch(() => [] as Creator[]),
  ]);
  const signed = attr.reduce((n, a) => n + a.signed_up, 0);
  const firstReel = creators.filter((c) => c.first_approved_at).length;
  const ckStat = el('b', {}, '…');
  const det = (id: string, icon: string, title: string, sub: Kid, inner: HTMLElement, open = false) =>
    el('details', { class: 'card', id, open }, el('summary', {}, el('span', { class: 'icb' }, ic(icon)), el('div', { class: 'grow' }, el('b', {}, title), el('span', { class: 'dim sm' }, sub)), ic('chev')), inner);
  // sources
  const src = el('div', { class: 'in', id: 'attrTable' });
  if (!attr.length) src.append(el('p', { class: 'dim' }, 'No one has come from a link yet.'));
  for (const a of attr) src.append(el('div', { class: 'nrow', 'data-attr': `${a.kind}:${a.code}` },
    el('div', { class: 'row' }, el('b', { class: 'grow' }, a.code), pill(a.kind === 'ref' ? 'Recruiter' : 'Channel')),
    el('div', { class: 'cells' }, ...([[a.signed_up, 'Signed up'], [a.first_reel, 'First Reel'], [a.live_14d, 'Live 14 d'], [a.three_reels_2days, '3 Reels 2+ d']] as [number, string][])
      .map(([n, l]) => el('div', { class: n ? 'y' : '' }, el('b', {}, String(n)), el('span', {}, l))))));
  // checklist
  const ref = el('input', { id: 'ckRef', value: ckRef, autocapitalize: 'none', placeholder: 'ref code' });
  const out = el('div', {});
  let rows: Check[] = [];
  const csv = btn('ghost', [ic('dl'), 'CSV'], () => {
    const a = el('a', { href: URL.createObjectURL(new Blob(['﻿' + checklistCsv(rows)], { type: 'text/csv;charset=utf-8' })), download: `kring_recruits_${ckRef || 'all'}_${new Date().toISOString().slice(0, 10)}.csv` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, { id: 'ckCsv' });
  const load = async () => {
    ckRef = ref.value.trim().toLowerCase(); LS('kr8-admin-ckref', ckRef);
    try { rows = await rpc<Check[]>('kr8_admin_recruit_checklist', { p_ref: ckRef || null }); } catch (e) { out.replaceChildren(errP(e)); return; }
    const m1 = rows.filter((r) => r.m1).length, m2 = rows.filter((r) => r.m2).length;
    ckStat.textContent = String(m1);
    sumLine.textContent = `${ckRef || 'all'} · ${rows.length} signed up · M1 ${m1} · M2 ${m2}`;
    const tick = (on: boolean, l: string) => el('div', { class: on ? 'y' : '' }, el('b', {}, on ? '✓' : '–'), el('span', {}, l));
    out.replaceChildren(el('p', { class: 'sm', 'data-summary': `${rows.length}/${m1}/${m2}`, style: 'margin:12px 0 0' }, `${rows.length} signed up · M1 ${m1} · M2 ${m2}`),
      ...rows.map((r) => el('div', { class: 'nrow', 'data-check': r.user_id },
        el('div', { class: 'row' }, el('b', { class: 'grow' }, r.first_name), r.m2 ? pill('M2 ✓', 'g') : r.m1 ? pill('M1 ✓', 'g') : null),
        el('div', { class: 'faint xs' }, `${r.ref_code || r.src_code || ''} · joined ${bkkTime(r.joined_at)}`),
        el('div', { class: 'cells' }, tick(r.approved, 'Verified'), tick(r.has_photo && r.has_area && r.has_ig, 'Profile'),
          el('div', { class: r.approved_reels ? 'y' : '' }, el('b', {}, String(r.approved_reels)), el('span', {}, 'Reels')), tick(r.second_visit, '2nd visit')))));
  };
  ref.onchange = () => void load();
  const sumLine = el('span', {}, '…');
  const ck = el('div', { class: 'in' },
    el('p', { class: 'dim sm', style: 'margin:0 0 10px' }, 'M1 = verified + photo, area, IG + 1 approved Reel. M2 = M1 + opened the app on a later day and sent a hello / saved 3 / 2nd Reel.'),
    el('div', { class: 'row' }, el('label', { class: 'f grow' }, 'Recruiter code', ref), el('div', { style: 'align-self:flex-end' }, csv)), out);
  // Kring Locals by recruiter
  const byRef = new Map<string, Creator[]>();
  for (const c of creators) { const k = c.ref_code || ''; byRef.set(k, [...(byRef.get(k) || []), c]); }
  const loc = el('div', { class: 'in' }, el('p', { class: 'dim sm', style: 'margin:0' }, 'Only approved Reels count: first approved Reel, and 3 approved Reels within the first 14 days.'));
  for (const [r, list] of byRef) {
    const f = list.filter((c) => c.first_approved_at).length, three = list.filter((c) => c.approved_first_14d >= 3).length;
    loc.append(el('details', { class: 'nrow', 'data-ref': r || 'none' }, el('summary', { class: 'row', style: 'cursor:pointer;list-style:none' }, el('b', { class: 'grow' }, r || 'No code'),
      el('span', { class: 'pill g', 'data-summary': `${f}/${three}` }, `${f} first · ${three} with 3`)),
      ...list.map((c) => el('div', { class: 'nrow', 'data-creator': c.user_id },
        el('div', { class: 'row' }, el('span', { class: 'grow' }, c.first_name), el('span', { class: 'faint xs' }, bkkTime(c.joined_at))),
        el('div', { class: 'cells' },
          el('div', { class: c.first_approved_at ? 'y' : '' }, el('b', {}, c.first_approved_at ? '✓' : '–'), el('span', {}, 'First Reel')),
          el('div', { class: c.approved_first_14d >= 3 ? 'y' : '', 'data-first14': String(c.approved_first_14d) }, el('b', {}, `${c.approved_first_14d}/3`), el('span', {}, 'First 14 d')),
          el('div', {}, el('b', {}, String(c.approved_last_14d)), el('span', {}, 'Last 14 d')),
          el('div', {}, el('b', { style: 'font-size:14px' }, `${c.approved}/${c.pending}/${c.hidden}`), el('span', {}, 'OK/wait/hid')))))));
  }
  if (!creators.length) loc.append(el('p', { class: 'dim' }, 'No Kring Locals yet.'));
  body.replaceChildren(
    el('div', { class: 'stats', style: 'margin-top:14px' }, el('div', { class: 'stat' }, el('b', {}, String(signed)), el('span', {}, 'From links')),
      el('div', { class: 'stat' }, el('b', {}, String(firstReel)), el('span', {}, 'First Reel')), el('div', { class: 'stat' }, ckStat, el('span', {}, `M1 · ${ckRef || 'all'}`))),
    el('div', { style: 'margin-top:14px' },
      det('srcCard', 'link', 'Sources', 'Where members came from (?ref= / ?src=)', src, true),
      det('recruitChecklist', 'check', 'Recruiter checklist', sumLine, ck),
      det('localsCard', 'users', 'Kring Locals by recruiter', `${creators.length} Locals · ${byRef.size} codes`, loc)));
  await load();
}

// ───────────────────────────── Top 5 ─────────────────────────────
let giftPeriod: 'day' | 'week' = 'day';
let giftDate = bkkToday();
const giftPrize: Record<'day' | 'week', string> = { day: '฿300 café voucher', week: '฿1,000 dinner voucher' };
async function top5View() {
  const body = el('div', {}, loading());
  const seg = el('div', { class: 'seg' }, ...(['day', 'week'] as const).map((p) => { const b = el('button', { type: 'button', class: giftPeriod === p ? 'on' : '', id: 'giftPeriod-' + p }, p === 'day' ? 'Daily' : 'Weekly'); b.onclick = () => { giftPeriod = p; void top5View(); }; return b; }));
  const start = giftPeriod === 'week' ? mondayOf(giftDate) : giftDate;
  const date = el('input', { type: 'date', id: 'giftDate', value: giftDate });
  date.onchange = () => { giftDate = date.value || bkkToday(); void top5View(); };
  const step = (n: number) => { giftDate = addDays(giftDate, n * (giftPeriod === 'week' ? 7 : 1)); void top5View(); };
  const prize = el('input', { id: 'giftPrize', value: giftPrize[giftPeriod] });
  prize.onchange = () => { giftPrize[giftPeriod] = prize.value; };
  const label = giftPeriod === 'week' ? `Week of ${new Date(start + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : new Date(start + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  screen('more', head('Kring admin', 'Old manual awards', label),
    el('p', { class: 'dim sm', style: 'margin:0 0 10px' }, 'Before 17 Nov only. Weekly prizes now pay automatically: Top 8 share ฿4,400, 25-Ring floor (Reward codes shows the stock).'), seg,
    el('div', { class: 'stepr' }, btn('ghost', [ic('back')], () => step(-1), { 'aria-label': 'Earlier' }), date, btn('ghost', [ic('chev')], () => step(1), { 'aria-label': 'Later' })),
    el('label', { class: 'f', style: 'margin-top:12px' }, 'Gift (in baht, no percent)', prize), body);
  const end = new Date(start + 'T00:00:00+07:00').getTime() + (giftPeriod === 'week' ? 7 : 1) * 864e5;
  let winners: Award[] = []; let reels: Reel[] = [];
  try { [winners, reels] = await Promise.all([rpc<Award[]>('kr8_reel_awards_list', { p_period: giftPeriod, p_start: start }), rpc<Reel[]>('kr8_admin_reels', { p_status: 'approved', p_limit: 300 })]); }
  catch (e) { body.replaceChildren(errP(e)); return; }
  const from = new Date(start + 'T00:00:00+07:00').getTime();
  reels = reels.filter((r) => { const t = Date.parse(r.created_at); return t >= from && t < end; });
  const urls = await signReelPaths([...reels.map((r) => r.poster_path), ...winners.map((w) => w.poster_path)]).catch(() => ({} as Record<string, string>));
  const byRank = new Map(winners.map((w) => [w.rank, w]));
  const won = new Map(winners.map((w) => [w.reel_id, w.rank]));
  const slots = el('div', { id: 'winners' });
  for (let k = 1; k <= 5; k++) {
    const w = byRank.get(k);
    if (!w) { slots.append(el('div', { class: 'slot emp', 'data-rank-empty': String(k) }, el('span', { class: 'rk', style: 'color:var(--faint)' }, `#${k}`), 'Tap a Reel below')); continue; }
    const rm = btn('ghost', ['Remove'], async () => { await rpc('kr8_admin_unaward', { p_award: w.award_id }).catch((e) => toast(errText(e))); void top5View(); }, { id: 'unaward-' + w.award_id, style: 'min-height:40px;padding:0 12px' });
    slots.append(el('div', { class: 'slot', 'data-rank': String(k) }, el('span', { class: 'rk' }, `#${k}`), el('img', { class: 'thumb', src: urls[w.poster_path] || '', alt: '' }),
      el('div', { class: 'grow' }, el('b', { style: 'display:block' }, `${w.author_name} · ${w.area}`), el('span', { class: 'dim sm' }, w.prize),
        el('a', { class: 'link xs', style: 'display:block', href: reelLink(w.reel_id), target: '_blank', rel: 'noopener', 'data-reel-link': w.reel_id }, 'Open Reel')), rm));
  }
  const grid = el('div', { class: 'cands', id: 'candidates' });
  for (const r of reels) {
    const c = el('button', { type: 'button', class: 'cand', 'data-candidate': r.id }, el('img', { src: urls[r.poster_path] || '', alt: '' }), el('span', { class: 'nm' }, `${r.author_name} · ${r.area}`),
      won.has(r.id) ? el('span', { class: 'won' }, `#${won.get(r.id)}`) : null);
    c.onclick = () => {
      const ranks = el('div', { class: 'ranks' });
      const sh = sheet(el('h3', {}, `${r.author_name} · ${r.area}`), el('p', { class: 'dim', style: 'margin:4px 0 14px' }, `Pick a rank · ${prize.value}`), ranks);
      for (let k = 1; k <= 5; k++) {
        const b = el('button', { type: 'button', class: byRank.has(k) ? 'tk' : '', id: `rank-${k}-${r.id}` }, `#${k}`);
        b.onclick = async () => {
          b.disabled = true;
          try { await rpc('kr8_admin_award_reel', { p_reel: r.id, p_period: giftPeriod, p_start: start, p_rank: k, p_prize: prize.value }); sh.close(); toast(`#${k} · ${r.author_name}`, { ms: 2500 }); void top5View(); }
          catch (e) { b.disabled = false; sh.box.append(errP(e)); }
        };
        ranks.append(b);
      }
    };
    grid.append(c);
  }
  body.replaceChildren(el('div', { class: 'sec' }, 'Winners'), slots, el('div', { class: 'sec' }, `Approved Reels in this period · ${reels.length}`),
    reels.length ? grid : empty('No approved Reels', 'Nothing was approved in this period.'));
}

// ───────────────────────────── Listings ─────────────────────────────
let lseg: 'stay' | 'venues' = (LS('kr8-admin-lseg') as 'stay' | 'venues') || 'stay';
let venueCache: { stats: Stat[]; guests: Map<string, Guests>; flags: Map<string, Flags> } | null = null;
async function loadVenues() {
  const [stats, g, f] = await Promise.all([rpc<Stat[]>('kr8_admin_venue_stats'), rpc<Guests[]>('kr8_admin_venue_guests').catch(() => [] as Guests[]), rpc<Flags[]>('kr8_admin_venue_flags').catch(() => [] as Flags[])]);
  venueCache = { stats, guests: new Map(g.map((x) => [x.venue_id, x])), flags: new Map(f.map((x) => [x.venue_id, x])) };
  return venueCache;
}
let listingCache: Listing[] = [];
async function listingsView() {
  const body = el('div', {}, loading());
  const seg = el('div', { class: 'seg' }, ...(['stay', 'venues'] as const).map((p) => { const b = el('button', { type: 'button', class: lseg === p ? 'on' : '', id: 'lseg-' + p }, p === 'stay' ? 'Stay / Do' : 'Venues'); b.onclick = () => { lseg = p; LS('kr8-admin-lseg', p); void listingsView(); }; return b; }));
  screen('listings', head('Kring admin', 'Listings', undefined, lseg === 'stay' ? el('a', { class: 'icb', href: '#listing/new', id: 'stayAdd', 'aria-label': 'Add a stay or do', style: 'background:var(--grad);color:#fff' }, ic('plus')) : null), seg, body);
  try {
    if (lseg === 'stay') {
      const rows = listingCache = await rpc<Listing[]>('kr8_admin_listings');
      body.replaceChildren(
        el('p', { class: 'dim sm', style: 'margin:0 0 12px' }, `${rows.filter((r) => r.live).length} live · the partner sets the member price · hidden until you switch it live`),
        ...(rows.length ? rows.map((l) => el('div', { class: 'lcard', id: 'stay-' + l.id, style: 'margin-bottom:12px' },
          l.photos?.[0] ? el('div', { class: 'ph', style: `background-image:url("${encodeURI(l.photos[0])}")` }) : null,
          el('div', { class: 'bd' },
            el('div', { class: 'row' }, el('span', { class: 'icb', style: 'width:36px;height:36px' }, ic(l.kind === 'stay' ? 'bed' : 'brush')),
              el('div', { class: 'grow' }, el('b', { style: 'display:block' }, l.name), el('span', { class: 'dim sm' }, `${l.area} · ฿${l.member_price_thb}${l.price_unit_en ? ' ' + l.price_unit_en : ''}${l.saving_thb ? ` · save ฿${l.saving_thb}` : ''}`)),
              el('a', { class: 'icb', href: '#listing/edit/' + encodeURIComponent(l.id), 'aria-label': 'Edit', id: 'stayEdit-' + l.id }, ic('edit'))),
            el('div', { class: 'facts', id: 'stayTaps-' + l.id }, el('span', { class: 'fact' }, el('b', {}, String(l.taps)), ' Book-direct taps'), el('span', { class: 'fact' }, el('b', {}, String(l.members)), ' members'),
              el('span', { class: 'fact' }, el('b', {}, String(l.taps_7d)), ' in 7 days')),
            Object.keys(l.by_ref || {}).length ? el('p', { class: 'faint xs', style: 'margin:8px 0 0' }, 'By ref code: ' + Object.entries(l.by_ref).map(([k, n]) => `${k} ${n}`).join(' · ')) : null,
            l.last_tap_at ? el('p', { class: 'faint xs', style: 'margin:4px 0 0' }, 'Last tap ' + bkkTime(l.last_tap_at)) : null,
            sw('stayLive-' + l.id, el('b', {}, l.live ? 'Live' : 'Hidden'), l.live, async (on) => {
              try { await rpc('kr8_admin_listing_set_live', { p_id: l.id, p_live: on }); toast(on ? `${l.name} is live` : `${l.name} hidden`, { ms: 2000 }); } catch (e) { toast(errText(e)); }
              void listingsView();
            })))) : [empty('No listings yet', 'Tap + to add a stay or do.')]));
    } else {
      const v = await loadVenues();
      body.replaceChildren(...(v.stats.length ? v.stats.map((s) => {
        const f = v.flags.get(s.venue_id); const g = v.guests.get(s.venue_id);
        const locked = !!s.pin_locked_until || !!g?.locked_phones;
        return el('a', { class: 'li', href: '#venue/' + encodeURIComponent(s.venue_id), 'data-venue': s.venue_id, 'data-practice': f?.practice ? '1' : '' },
          el('span', { class: 'ic' }, ic('store')),
          el('span', { class: 'grow' }, el('b', {}, s.name), el('span', { class: 's' }, `${s.area} · today ${f?.used_today ?? 0}/${f?.daily_cap ?? 30}`),
            locked ? el('span', { class: 's', style: 'color:var(--bad);display:block' }, 'Counter locked') : null),
          f?.practice ? pill('Practice', 'a') : pill(s.status === 'live' ? 'Live' : 'Paused', s.status === 'live' ? 'g' : ''), ic('chev'));
      }) : [empty('No approved venues yet')]));
    }
  } catch (e) { body.replaceChildren(errP(e)); }
}

const LFIELDS = ['id', 'kind', 'name', 'name_th', 'area', 'blurb_en', 'blurb_th', 'photos', 'member_price_thb', 'price_unit_en', 'price_unit_th', 'saving_thb', 'booking_kind', 'booking_contact'] as const;
function listingStepper(start: Partial<Listing>, isEdit: boolean) {
  const st: Record<string, string> = {};
  for (const k of LFIELDS) { const v = start[k]; st[k] = Array.isArray(v) ? v.join('\n') : v === null || v === undefined ? '' : String(v); }
  let step = 0;
  const titles = ['Basics', 'Photos', 'Price', 'Booking'];
  const s = el('div', { class: 'scr q' });
  const act = el('div', { class: 'qact' }, el('div', {}));
  app.replaceChildren(s, act);
  const inp = (k: string, label: string, opts: { ph?: string; area?: boolean; num?: boolean; ro?: boolean } = {}) => {
    const i = (opts.area ? el('textarea', { rows: k === 'photos' ? '4' : '2', name: k, placeholder: opts.ph }) : el('input', { name: k, placeholder: opts.ph, inputmode: opts.num ? 'numeric' : undefined, readonly: opts.ro })) as HTMLInputElement;
    i.value = st[k]; i.oninput = () => { st[k] = i.value; preview?.(); };
    return el('label', { class: 'f' }, label, i);
  };
  let preview: (() => void) | null = null;
  const draw = () => {
    preview = null;
    const parts: HTMLElement[] = [];
    if (step === 0) {
      const kt = el('div', { class: 'kindt' }, ...(['stay', 'do'] as const).map((k) => { const b = el('button', { type: 'button', class: st.kind === k ? 'on' : '' }, ic(k === 'stay' ? 'bed' : 'brush'), k === 'stay' ? 'Stay' : 'Do'); b.onclick = () => { st.kind = k; draw(); }; return b; }));
      parts.push(kt, inp('name', 'Name (English)'), inp('name_th', 'Name (Thai script)'),
        el('div', { class: 'g2' }, inp('area', 'Area', { ph: 'Ari' }), inp('id', 'ID (a-z 0-9 -)', { ph: 'lub-d-silom', ro: isEdit })),
        inp('blurb_en', 'Short line (English)', { area: true }), inp('blurb_th', 'Short line (Thai)', { area: true }));
    } else if (step === 1) {
      const grid = el('div', { class: 'pgrid' });
      const paint = () => grid.replaceChildren(...st.photos.split(/\s+/).filter((u) => /^https:\/\//.test(u)).map((u) => el('img', { src: u, alt: '' })));
      const f = inp('photos', 'Photo links (https, one per line)', { area: true });
      f.querySelector('textarea')!.addEventListener('input', paint);
      paint(); parts.push(grid, f);
    } else if (step === 2) {
      const card = el('div', { class: 'card' });
      preview = () => card.replaceChildren(el('div', { class: 'faint xs' }, 'MEMBERS SEE'), el('b', { style: 'font:700 28px var(--h);display:block;margin-top:4px' }, `฿${st.member_price_thb || '–'}`),
        el('span', { class: 'dim' }, st.price_unit_en || ''), st.saving_thb ? el('div', { class: 'okc sm', style: 'margin-top:4px' }, `Save ฿${st.saving_thb}`) : '');
      preview();
      parts.push(el('div', { class: 'g2' }, inp('member_price_thb', 'Member price ฿', { num: true }), inp('saving_thb', 'Saving ฿ (optional)', { num: true })),
        el('div', { class: 'g2' }, inp('price_unit_en', 'Unit (English)', { ph: 'per night' }), inp('price_unit_th', 'Unit (Thai)')), card,
        el('p', { class: 'dim sm', style: 'margin:0' }, 'The partner sets the member price. No other-site prices.'));
    } else {
      const via = el('div', { class: 'chips2' }, ...(['line_oa', 'line', 'ig', 'url'] as const).map((k) => { const b = el('button', { type: 'button', class: st.booking_kind === k ? 'on' : '' }, { line_oa: 'LINE OA', line: 'LINE', ig: 'Instagram', url: 'Website' }[k]); b.onclick = () => { st.booking_kind = k; draw(); }; return b; }));
      parts.push(el('label', { class: 'f' }, 'Booking via', via), inp('booking_contact', 'Contact (LINE @id / LINE ID / IG / https link)', { ph: '@partner' }),
        el('p', { class: 'dim sm', style: 'margin:0' }, 'Saving keeps it hidden. Switch it live from Listings.'));
    }
    const out = el('div', { id: 'stayMsg' });
    s.replaceChildren(
      el('div', { class: 'qh' }, el('div', { class: 'row' }, el('a', { class: 'icb', href: '#listings', 'aria-label': 'Close' }, ic('x')),
        el('h2', { class: 'grow' }, isEdit ? 'Edit listing' : 'Add a stay / do'), el('span', { class: 'cnt' }, `${step + 1} / 4`))),
      el('div', { class: 'dots' }, ...titles.map((_, i) => el('i', { class: i <= step ? 'on' : '' }))),
      el('h2', { style: 'font-size:24px;margin-bottom:14px' }, `${step + 1} · ${titles[step]}`),
      el('div', { class: 'stack', id: 'stayForm' }, ...parts), out);
    const back = btn('ghost big', [ic('back'), 'Back'], () => { step--; draw(); });
    const next = step < 3 ? btn('pri big', ['Next', ic('chev')], () => { step++; draw(); }, { id: 'stayNext' })
      : btn('go big', [ic('check'), 'Save'], async () => {
        const g = (k: string) => (st[k] || '').trim();
        const payload = { ...Object.fromEntries(LFIELDS.map((k) => [k, g(k)])), photos: g('photos').split(/\s+/).filter(Boolean), member_price_thb: Number(g('member_price_thb')) || 0, saving_thb: g('saving_thb') ? Number(g('saving_thb')) : '' };
        next.disabled = true;
        try { await rpc('kr8_admin_listing_save', { p: payload }); toast('Saved · hidden until you switch it live', { ms: 3000 }); location.hash = '#listings'; }
        catch (e) { next.disabled = false; out.replaceChildren(errP(e)); }
      }, { id: 'staySave' });
    act.firstElementChild!.replaceChildren(el('div', { class: 'two' }, step ? back : el('a', { class: 'btn ghost big', href: '#listings' }, 'Cancel'), next));
    window.scrollTo(0, 0);
  };
  draw();
}

async function venueDetail(id: string) {
  app.replaceChildren(el('div', { class: 'scr' }, loading()));
  const v = venueCache && venueCache.stats.some((s) => s.venue_id === id) ? venueCache : await loadVenues().catch(() => null);
  const s = v?.stats.find((x) => x.venue_id === id);
  if (!v || !s) { app.replaceChildren(el('div', { class: 'scr' }, el('a', { class: 'btn ghost', href: '#listings' }, ic('back'), 'Back'), empty('Venue not found'))); return; }
  const f = v.flags.get(id); const g = v.guests.get(id);
  const refresh = async () => { await loadVenues().catch(() => undefined); void venueDetail(id); };
  const alerts: HTMLElement[] = [];
  if (s.pin_locked_until) alerts.push(el('div', { class: 'warnbox' }, ic('lock'), `Counter PIN locked until ${bkkTime(s.pin_locked_until, false)}`));
  if (g?.locked_phones) alerts.push(el('div', { class: 'warnbox', 'data-locked-phones': String(g.locked_phones) }, ic('warn'), `${g.locked_phones} phone(s) paused (wrong PIN)`));
  if (g?.new_account_guests) alerts.push(el('div', { class: 'warnbox', style: 'color:var(--warn);border-color:rgba(255,196,77,.4);background:rgba(255,196,77,.07)' }, ic('warn'), `${g.new_account_guests} brand-new account(s) · check before paying`));
  let cap = f?.daily_cap ?? 30;
  const capIn = el('input', { type: 'number', min: '1', max: '500', id: 'cap-' + id, value: String(cap), inputmode: 'numeric' });
  const setCap = async (n: number) => {
    cap = Math.max(1, Math.min(500, n)); capIn.value = String(cap);
    try { await rpc('kr8_admin_set_daily_cap', { p_venue: id, p_cap: cap }); toast(`Uses per day: ${cap}`, { ms: 1500 }); } catch (e) { toast(errText(e)); }
  };
  capIn.onchange = () => void setCap(Number(capIn.value));
  const actionLi = (icon: string, label: string, sub: string, idAttr: string, fn: () => void, red = false) => { const b = el('button', { type: 'button', class: 'li' + (red ? ' red' : ''), id: idAttr }, el('span', { class: 'ic' }, ic(icon)), el('span', { class: 'grow' }, el('b', {}, label), sub ? el('span', { class: 's' }, sub) : null), ic('chev')); b.onclick = fn; return b; };
  const live = s.status === 'live';
  const actions = el('div', {},
    (s.pin_locked_until || g?.locked_phones) ? actionLi('lock', 'Unlock counter', 'Clears the PIN lock and paused phones', 'unlock-' + id, async () => { try { await rpc('kr8_admin_unlock_venue', { p_venue: id }); toast('Counter unlocked', { ms: 2000 }); } catch (e) { toast(errText(e)); } void refresh(); }) : null,
    actionLi('msg', 'Welcome message', 'Copy for the owner on LINE', 'msg-' + id, () => {
      const prev = el('div', {});
      sheet(el('h3', {}, 'Welcome message'), el('p', { class: 'dim sm', style: 'margin:4px 0 12px' }, 'Thai + English are copied; English shown.'), prev,
        el('div', { style: 'margin-top:12px' }, welcomeActions(id, { name: s.name, dealTh: f?.deal_th, dealEn: f?.deal_en, practice: !!f?.practice }, prev)));
    }),
    actionLi('key', 'Backup PIN', 'Only if the venue cannot use the swipe', 'reset-' + id, async () => {
      if (!confirm(`Make a new backup PIN for ${s.name}?`)) return;
      try {
        const pin = await rpc<string>('kr8_admin_reset_pin', { p_venue: id });
        const link = staffLink(id);
        sheet(el('h3', {}, `New PIN · ${s.name}`), el('p', { class: 'dim sm', style: 'margin:4px 0 14px' }, 'Backup only · normally staff just slide. Shown once.'),
          el('div', { class: 'pinbig', id: 'pinValue' }, pin), el('a', { class: 'link sm', href: link, target: '_blank', rel: 'noopener', id: 'staffLink', style: 'display:block;margin-top:12px;word-break:break-all' }, link),
          el('div', { style: 'margin-top:14px' }, btn('pri full', [ic('copy'), 'Copy PIN + link'], () => void navigator.clipboard?.writeText(`PIN ${pin}\n${link}`).then(() => toast('Copied', { ms: 1500 })))));
      } catch (e) { toast(errText(e)); }
    }),
    el('a', { class: 'li', href: standLink(id) + '&f=sticker', target: '_blank', rel: 'noopener', id: 'dlSticker-' + id }, el('span', { class: 'ic' }, ic('print')), el('span', { class: 'grow' }, el('b', {}, 'Door sticker 10 cm')), ic('open')),
    el('a', { class: 'li', href: standLink(id) + '&f=stand', target: '_blank', rel: 'noopener', id: 'dlStand-' + id }, el('span', { class: 'ic' }, ic('print')), el('span', { class: 'grow' }, el('b', {}, 'A6 stand (PDF)')), ic('open')),
    actionLi('pause', live ? 'Pause venue' : 'Resume venue', live ? 'Hides it from members' : 'Shows it to members again', 'toggle-' + id, async () => {
      if (live && !confirm(`Pause ${s.name}?`)) return;
      await rpc('kr8_admin_set_venue_live', { p_venue: id, p_live: !live }).catch((e) => toast(errText(e))); void refresh();
    }, live));
  const sc = el('div', { class: 'scr' },
    el('div', { class: 'row', style: 'margin:6px 0 16px' }, el('a', { class: 'icb', href: '#listings', 'aria-label': 'Back', id: 'venueBack' }, ic('back')),
      el('div', { class: 'grow' }, el('h1', { style: 'font-size:24px' }, s.name), el('div', { class: 'dim sm' }, `${s.area} · approved ${bkkTime(s.approved_at)} by ${s.approved_by}`)),
      f?.practice ? pill('Practice', 'a') : pill(live ? 'Live' : 'Paused', live ? 'g' : '')),
    alerts.length ? el('div', { class: 'stack', style: 'margin-bottom:14px' }, ...alerts) : null,
    el('div', { class: 'stats four', 'data-venue': id },
      el('div', { class: 'stat' }, el('b', { 'data-used-today': String(f?.used_today ?? 0) }, `${f?.used_today ?? 0}/${cap}`), el('span', {}, 'Used today')),
      el('div', { class: 'stat', 'data-guests': String(g?.guests ?? '') }, el('b', {}, String(g?.guests ?? 0)), el('span', {}, 'Different guests')),
      el('div', { class: 'stat', 'data-count': String(s.redemptions) }, el('b', {}, `${s.redemptions}/${s.claims}`), el('span', {}, 'Redeemed / claimed')),
      el('div', { class: 'stat', 'data-live': g?.live_confirmed_at || '' }, el('b', { class: g?.live_confirmed_at ? 'okc' : '', style: 'font-size:18px' }, g?.live_confirmed_at ? bkkTime(g.live_confirmed_at) : '–'), el('span', {}, 'Live (2nd guest)'))),
    el('p', { class: 'faint xs', style: 'margin:10px 2px 0', 'data-first': s.first_redeemed_at || '' }, `First code check ${bkkTime(s.first_redeemed_at)} · referred by ${s.referral_host_code || '–'}`),
    el('div', { class: 'sec' }, 'Settings'),
    el('div', { class: 'card' },
      el('div', { class: 'row' }, el('div', { class: 'grow' }, el('b', { style: 'display:block' }, 'Uses per day'), el('span', { class: 'dim sm' }, `Today ${f?.used_today ?? 0}`)),
        el('div', { class: 'stepr', style: 'width:180px;flex:none' }, btn('ghost', [ic('minus')], () => void setCap(cap - 1), { 'aria-label': 'Fewer' }), capIn, btn('ghost', [ic('plus')], () => void setCap(cap + 1), { 'aria-label': 'More' }))),
      sw('practice-' + id, el('span', {}, el('b', { style: 'display:block' }, 'Practice listing'), el('span', { class: 'dim sm' }, 'Hidden from Deals')), !!f?.practice, async (on) => {
        try { await rpc('kr8_admin_set_practice', { p_venue: id, p_on: on }); toast(on ? 'Practice on' : 'Practice off', { ms: 1500 }); } catch (e) { toast(errText(e)); }
        void refresh();
      })),
    el('div', { class: 'sec' }, 'Actions'), actions);
  app.replaceChildren(sc, tabbar('listings'));
  window.scrollTo(0, 0);
}

// ───────────────────────────── Reddit (comment-only reputation plan, 13 Nov audit) ─────────────────────────────
// New account, no karma: comments only, no links, never the product name. Stored on this phone (localStorage); admin writes elsewhere are RPC-only.
type RItem = { id: string; sub: string; title: string; url: string; text: string; low?: boolean };
const rs = (sub: string, q: string) => `https://www.reddit.com/r/${sub}/search/?q=${encodeURIComponent(q)}&restrict_sr=1&sort=new`;
const R_SEED: RItem[] = [
  // Batch 2 (13 Nov, fresh threads, verified): first in the queue
  { id: 'b1', sub: "Bangkok", title: "First time visiting Thailand and I'm going to miss Chatuchak Weekend Market. Is there any alternative?", url: "https://www.reddit.com/r/Bangkok/comments/1xusga6/",
    text: "Or Tor Kor is right next to Chatuchak and it's open every day, MRT Kamphaeng Phet drops you basically at the door. It's more of a fresh food and fruit market than a clothes one, but it's the cleanest market in the city and you can still see the Chatuchak area from there. For the shopping side i'd do Sampeng Lane in Chinatown on a weekday morning, it's wholesale chaos in the best way and done by mid afternoon." },
  { id: 'b2', sub: "ThailandTourism", title: "We hate Bangkok - help save our last day!", url: "https://www.reddit.com/r/ThailandTourism/comments/1xva1yl/",
    text: "If you're outdoorsy skip the mall plan and go to Bang Krachao. Take a Grab to Khlong Toei, there's a little crossboat from the pier by Wat Khlong Toei Nok that costs a few baht, rent a bike on the other side and ride the raised paths through the jungle. It honestly doesn't feel like Bangkok at all. Then come back for sunset at Benjakitti park, the elevated walkway over the wetlands is the best free view of the skyline." },
  { id: 'b3', sub: "ThailandTourism", title: "Lesser known area to wander aimlessly in Bangkok ?", url: "https://www.reddit.com/r/ThailandTourism/comments/1xuiu3e/",
    text: "Kudi Chin on the Thonburi side. Cross Memorial Bridge or take the boat over, then just follow the riverside path, it's Portuguese era houses, a tiny community and the old Santa Cruz church all squeezed together. Start around 4 so you finish when the light goes orange. Talat Noi across the river is the obvious follow up if you still have legs." },
  { id: 'b4', sub: "ThailandTourism", title: "What's the best chao phraya river cruise?", url: "https://www.reddit.com/r/ThailandTourism/comments/1xv3iij/",
    text: "honestly for budget just ride the orange flag boat around sunset. It's 19 baht from Sathorn pier (Saphan Taksin BTS) and you get the same river, Wat Arun lit up from the water and all. The dinner boats are fine but you pay mostly for the buffet. Last orange boats run early evening so check the board at the pier before you plan around it." },
  { id: 'b5', sub: "Bangkok", title: "which suburb to stay as first timers to bangkok", url: "https://www.reddit.com/r/Bangkok/comments/1xu0598/",
    text: "For shopping and no nightlife I'd stay around Chit Lom or Ratchadamri. You can walk the covered skywalk to Central World, Gaysorn and Siam Paragon without touching the street, and Grab is easy from any of the big hotels there. For Muay Thai, Rajadamnern stadium sells seats online and at the door, ringside is pricey but the cheaper seats upstairs are louder anyway." },
  { id: 'b6', sub: "Bangkok", title: "23M, French, new in Bangkok for a few months", url: "https://www.reddit.com/r/Bangkok/comments/1xv15au/",
    text: "Since you like cooking, a Thai cooking class is weirdly good for this, you spend 3 hours chopping next to the same 6 people and someone always suggests coffee after. For the working out part, SarDine Run Club runs on saturdays for free and rotates between Suan Rot Fai, Lumphini and Benjakitti, no sign up needed. Being shy isn't a problem at either, you just show up again the next week." },
  { id: 'b7', sub: "Bangkok", title: "Aussie keen to make mates in Bangkok", url: "https://www.reddit.com/r/Bangkok/comments/1xsqjj7/",
    text: "If you're around Asok you're 10 min from Benjakitti. There's a crew called Ugly Running Training Club that goes most mornings around 6:30 from Gate 3 by the stretching area. Mornings sound grim but it's the only time Bangkok is cool, and the regulars are mostly long term people like you, not folks gone next week." },
  { id: 'b8', sub: "Bangkok", title: "Info on the Ari section of Bangkok", url: "https://www.reddit.com/r/Bangkok/comments/1xua5fb/",
    text: "If you like Nimman you'll probably like Ari, it's the closest thing Bangkok has to that vibe but quieter. Everything is around BTS Ari, the sois off Phahonyothin are full of small cafés and street food, and it's mostly Thai office people and families rather than visitors. It's not central, but the BTS gets you to Siam in about 10 minutes so it doesn't really matter." },
  { id: 'b9', sub: "Bangkok", title: "33m will arrive in Bangkok next week Tuesday!", url: "https://www.reddit.com/r/Bangkok/comments/1xt545k/",
    text: "For Muay Thai just walk into one of the gyms around Sukhumvit and ask about drop-in sessions, most of them run a morning class and an afternoon one and are used to beginners turning up. Go to the same class 3 or 4 times and you'll know half the room by name. Bring a spare shirt, you'll sweat through the first one in ten minutes." },
  { id: 'b10', sub: "Bangkok", title: "Visiting Bangkok for 2 weeks in December, looking to meet people and explore neighborhoods", url: "https://www.reddit.com/r/Bangkok/comments/1xtsqqf/",
    text: "Since you're testing it for living, add Ari and the Sathorn side to that list. Phrom Phong, Thonglor and Asok are great but very expat bubble, Ari feels more like a real Thai neighbourhood with cafés everywhere. Also ride the BTS once at 8am on a weekday, that tells you more about daily life here than any weekend does. December is the nicest weather of the year too so you're seeing it at its best, keep that in mind lol" },
  { id: 'b11', sub: "ThailandTourism", title: "21M solo trip to Bangkok", url: "https://www.reddit.com/r/ThailandTourism/comments/1xvazjv/",
    text: "For shopping on a budget go to Platinum Fashion Mall in Pratunam, it's floors and floors of cheap clothes and you can bargain a bit if you buy more than one. Siam Square across from MBK is where the younger Thai crowd hangs out, and Lido Connect in the middle of it has live gigs some evenings, check their page for that week. Stay near a BTS line and you'll save yourself a lot of traffic time." },
  { id: 'b12', sub: "ThailandTourism", title: "Thailand solo trip at 23", url: "https://www.reddit.com/r/ThailandTourism/comments/1xuoc6b/",
    text: "One thing to plan around: Koh Lanta and Koh Tao are on different coasts with different weather. Lanta on the Andaman side is at its best from about November to April, while the Gulf side with Tao gets its wettest stretch around October to December. So if you're going soon, do Lanta first and save Tao for later in the trip." },
  { id: 'b13', sub: "digitalnomad", title: "Staying 2 months in Thailand and SEA, anyone around to cowork?", url: "https://www.reddit.com/r/digitalnomad/comments/1xqsmg0/",
    text: "In Bangkok I liked working from TCDC in the old Grand Postal Building on Charoen Krung, it's a design library with proper desks and it's quiet, check if they still do day passes. True Digital Park out at Punnawithi BTS is the other one, very startup heavy and easy to get chatting with people at lunch. Cafés are fine for a few hours but the AC is usually set to arctic so bring a layer." },
  { id: 'b14', sub: "Bangkok", title: "Is the view from Asiatique Sky better at night or during the day?", url: "https://www.reddit.com/r/Bangkok/comments/1xv3r28/",
    text: "Night, no contest. The river and the bridges all lit up is the whole point, during the day it's just a nice view of rooftops. Asiatique opens at 4pm so if you get there around 5:30 you can ride as the sun goes down. Take the free shuttle boat from Sathorn pier at Saphan Taksin BTS, way easier than a Grab in evening traffic." },
  { id: 'b15', sub: "Bangkok", title: "The MRT Blue Line is changing from a one-way coin ticket to a one-way Aztec Code instead by the beginning of next year. Which design do you think would make it the clearest what to do?", url: "https://www.reddit.com/r/Bangkok/comments/1xu6fcl/",
    text: "Whichever one shows the arrow pointing to where the reader actually is on the gate. Half the confusion with the coin was people not knowing where to tap, and a paper code is going to be worse at rush hour if people hold it flat at the wrong spot. A tiny picture of a hand holding it face down would fix most of it." },
  { id: 'b16', sub: "Bangkok", title: "Runners in BKK: finding a run club that isn't disguised as social club", url: "https://www.reddit.com/r/Bangkok/comments/1x5482a/",
    text: "Try Ugly Running Training Club at Benjakitti, they go most mornings around 6:30 from Gate 3 and it's actual training, not a photo shoot. Lumphini is good for your own sessions too, the loop is roughly 2.5km and there's real shade. Go early, by 8am the humidity makes any tempo run miserable even in November." },
  { id: 'b17', sub: "ThailandTourism", title: "Stay near Saphan Taksin BTS or Asok BTS?", url: "https://www.reddit.com/r/ThailandTourism/comments/1xjude6/",
    text: "For the Grand Palace and the old town, Saphan Taksin wins easily. Sathorn pier is right under the station and the orange flag boat takes you up to Tha Chang for 19 baht, no traffic at all. Asok is better for malls and being on two train lines, but getting to the old town from there means a long Grab ride. I'd pick Saphan Taksin and just take the BTS when you want malls." },
  { id: 'b18', sub: "Bangkok", title: "Where should I watch Muay Thai while visiting Thailand?", url: "https://www.reddit.com/r/Bangkok/comments/1xta3o4/",
    text: "Depends what you want really. RWS is the big produced show with 3 round fights, lights and a pretty mixed crowd, very easy for a first time. Kiatpetch is the old school 5 round thing where the first rounds are slow and then the crowd goes crazy in round 3 and 4. If you've never seen it live I'd do RWS, if you already watch it on TV do Kiatpetch." },
  { id: 'b19', sub: "Bangkok", title: "solo woman traveler", url: "https://www.reddit.com/r/Bangkok/comments/1xt8tsc/",
    text: "The ATMs charge foreign cards 220 baht per withdrawal, so the trick is to take out bigger amounts less often rather than avoid them. AEON machines in Big C and Lotus's are a bit cheaper at 150. Exchange booths here give really good value for clean US hundreds too, the SuperRich ones are popular. You won't need tons, street food is usually 50 to 100 baht a plate." },
  { id: 'b20', sub: "ThailandTourism", title: "Conscious Travel Friends?Dec-Jan", url: "https://www.reddit.com/r/ThailandTourism/comments/1xh9qs7/",
    text: "For your Bangkok days, morning stuff is where the calmer crowd is. Lumphini park around 6 or 7am has people doing tai chi, running and outdoor aerobics, and nobody minds if you join in at the back. A Thai cooking class is another easy one, you spend a few hours with the same handful of people and it usually turns into lunch after." },
  // Batch 1 (audit 13 Nov); r9 and r10 are old threads, low priority at the end
  { id: 'r1', sub: 'Bangkok', title: 'Recently Moved to Bangkok (making friends, doesn\'t drink)', url: 'https://www.reddit.com/r/Bangkok/comments/1im1ja2/',
    text: 'honestly the thing that worked for me was a run club. SarDine runs on saturdays and it\'s free, they move between Suan Rot Fai, Lumphini and Benjakitti so check where it is that week. Nobody cares how fast you are, and after the 3rd time people start saving you a spot for coffee after.' },
  { id: 'r2', sub: 'Bangkok', title: 'Lonely and wanting to volunteer regularly', url: 'https://www.reddit.com/r/Bangkok/comments/1gj8pw2/',
    text: 'Thai classes did more for my social life than anything else here. Same faces twice a week, everyone\'s a bit lost, so you end up getting lunch after. Just a heads up that a few people below are right about volunteering and visas, ask the org what they need from you first.' },
  { id: 'r3', sub: 'Bangkok', title: 'Din Daeng: one free day alone', url: 'https://www.reddit.com/r/Bangkok/comments/1inntbl/',
    text: 'Take the orange flag boat, it\'s 19 baht now, and get off for Chinatown. Walk Sampeng Lane in the morning before it gets packed, then do Yaowarat road after dark for food. if it\'s a monday a lot of the stalls are off so maybe flip it.' },
  { id: 'r4', sub: 'ThailandTourism', title: 'Bangkok, Solo first time!', url: rs('ThailandTourism', 'Bangkok solo first time'),
    text: 'You\'ll be fine, Bangkok is one of the easier cities to start with. Stay near a BTS station and half your problems are gone. Use Grab or Bolt for anything after midnight and don\'t take the tuk tuk guy who says the place you want is closed today.' },
  { id: 'r5', sub: 'Bangkok', title: 'Non-drinking nighttime activities', url: rs('Bangkok', 'non-drinking nighttime activities'),
    text: 'Lumphini is open till 10pm and the evening is the best time, it\'s cooler and the whole aerobics crowd comes out around 6. Huai Khwang night market is right by the MRT station of the same name and goes late. both cost you basically nothing.' },
  { id: 'r6', sub: 'Bangkok', title: 'Indoor sports areas with courts (rainy or hot afternoon)', url: rs('Bangkok', 'indoor'),
    text: 'BACC at National Stadium BTS is my default for this. It\'s free and the walkway from the station drops you straight in on the 3rd floor, so you never get wet. Closed mondays though, 10am to 8pm the rest of the week.' },
  { id: 'r7', sub: 'ThailandTourism', title: 'Any "late November" Bangkok trip post (Loy Krathong)', url: rs('ThailandTourism', 'Bangkok late November'),
    text: 'If you\'re here around the 25th, that\'s Loy Krathong. The city\'s doing riverside stuff at Rama VIII bridge from the 17th to the 29th, and Mahakan Fort has an evening thing from the 23rd to the 25th, 5 to 10pm. It gets crowded near the river so i\'d get there before 7.' },
  { id: 'r8', sub: 'Bangkok', title: 'First Time in Bangkok | On Nut (is the area safe)', url: rs('Bangkok', 'First Time in Bangkok On Nut'),
    text: 'On Nut is totally normal, it\'s mostly Thai families and people who work in the city. Feels quieter than Asok at night, not sketchier. Honestly the bigger risk anywhere on Sukhumvit is the traffic when you cross, not people.' },
  { low: true, id: 'r9', sub: 'Thailand', title: 'I had to leave Thailand (lonely expat)', url: 'https://www.reddit.com/r/Thailand/comments/1csbuav/',
    text: 'This hit home a bit. The first 3 months were the worst for me too, it only turned around once i had something fixed every week that wasn\'t work. Doesn\'t have to be big, the same café on the same morning is enough for people to start nodding at you.' },
  { low: true, id: 'r10', sub: 'solotravel', title: 'Weekly Destination Thread: Bangkok', url: 'https://www.reddit.com/r/solotravel/comments/10gx4cq/',
    text: 'Agree on Charoen Krung, i\'d add the morning there. Coffee around 8, walk down towards the river while it\'s still cool, and you\'ll see the street art before the crowd. Benjakitti\'s elevated walkway is good for an hour too, just check the bridge from Lumphini, someone said it was closed recently.' },
];
const R_CHECK = [
  'Thread under 6 hours old, and the sub allows this kind of answer',
  'The first sentence answers the OP\'s actual question',
  'One real detail: a BTS/MRT station, a price in baht, a time or a day',
  'Still true today (open hours, closed days, fares)',
  'No lists, headers, em-dashes or AI phrases like "Great question!"',
  'Reworded to fit the thread, never the same text twice',
  'No link, no product name, 2+ hours since the last one',
];
type RState = { start: string; posted: Record<string, string>; skipped: Record<string, string> };
const R_KEY = 'kr8-admin-reddit';
function rLoad(): RState {
  let s: Partial<RState> = {};
  try { s = JSON.parse(LS(R_KEY) || '{}') || {}; } catch { s = {}; }
  const st: RState = { start: /^\d{4}-\d{2}-\d{2}$/.test(s.start || '') ? s.start! : bkkToday(), posted: s.posted || {}, skipped: s.skipped || {} };
  if (!s.start) rSave(st);
  return st;
}
function rSave(st: RState) { LS(R_KEY, JSON.stringify(st)); }
const bkkDate = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);
/** Playbook pacing: days 1–3 read only; days 4–17 2–3 a day; then 3–5 a day. */
function rPace(st: RState) {
  const day = Math.max(1, Math.round((Date.parse(bkkToday()) - Date.parse(st.start)) / 86400_000) + 1);
  const [min, max, phase] = day <= 3 ? [0, 0, 'Read only'] as const : day <= 17 ? [2, 3, 'Warm-up'] as const : [3, 5, 'Steady'] as const;
  const today = bkkToday();
  const times = Object.values(st.posted).filter((t) => bkkDate(t) === today).sort();
  const last = Object.values(st.posted).sort().pop() || null;
  return { day, min, max, phase, done: times.length, left: Math.max(0, max - times.length), last };
}
type IgCard = { id: string; ig: IgDm; step: 0 | 1 | 2; th: string; en: string };
type QItem = Social | (RItem & { reddit: true }) | IgCard;

// ───────────────────────────── Instagram DMs (IG_NANO_MICRO_13NOV.md top 15) ─────────────────────────────
// Max 10 IG DMs a day (first DMs + follow-ups), file send order; nudge at day 3–4, last check-in at day 7–10; "Paused 48 h" after any IG warning.
const IG_MAX = 10;
const IG_NUDGE: [string, string][] = [
  ['สวัสดีอีกครั้งครับ ไม่ได้อยากกวนนะครับ แค่อยากเช็กว่าเห็นข้อความเรื่อง Kring Local แล้วหรือยัง ถ้าสนใจคุยต่อ ทักกลับมาได้เลยนะครับ 🙏',
    'Hi again, not trying to bother you, just checking whether you saw my message about being a Kring Local. If you\'d like to chat, just reply anytime 🙏'],
  ['ขอทักเป็นครั้งสุดท้ายนะครับ ถ้าช่วงนี้ยังไม่สะดวกก็ไม่เป็นไรเลยครับ ถ้าวันไหนอยากลองเป็น Kring Local ทักมาได้ตลอดเลยครับ ขอบคุณมากครับ',
    'One last note from me. If now isn\'t a good time, no worries at all. If you ever want to try being a Kring Local, message me anytime. Thanks so much.'],
];
type IgState = { sent: Record<string, string>; f1: Record<string, string>; f2: Record<string, string>; skipped: Record<string, string>; pausedUntil: string | null };
const IG_KEY = 'kr8-admin-ig';
function igLoad(): IgState {
  let s: Partial<IgState> = {};
  try { s = JSON.parse(LS(IG_KEY) || '{}') || {}; } catch { s = {}; }
  return { sent: s.sent || {}, f1: s.f1 || {}, f2: s.f2 || {}, skipped: s.skipped || {}, pausedUntil: s.pausedUntil || null };
}
function igSave(st: IgState) { LS(IG_KEY, JSON.stringify(st)); }
const igPaused = (st: IgState) => !!st.pausedUntil && Date.parse(st.pausedUntil) > Date.now();
const daysSince = (iso: string) => Math.round((Date.parse(bkkToday()) - Date.parse(bkkDate(iso))) / 86400_000);
function igPace(st: IgState) {
  const today = bkkToday();
  const done = [st.sent, st.f1, st.f2].reduce((n, m) => n + Object.values(m).filter((t) => bkkDate(t) === today).length, 0);
  return { done, max: IG_MAX, left: Math.max(0, IG_MAX - done) };
}
/** Today's IG cards: due follow-ups first, then new DMs in send order, capped by the daily max (none while paused). */
function igToday(): IgCard[] {
  const st = igLoad();
  if (igPaused(st)) return [];
  const out: IgCard[] = [];
  for (const ig of IG_TOP) {
    const t = st.sent[ig.h]; if (!t) continue;
    const id1 = 'ig1:' + ig.h, id2 = 'ig2:' + ig.h;
    const f1Done = st.f1[ig.h] || st.skipped[id1];
    if (!f1Done && daysSince(t) >= 3) out.push({ id: id1, ig, step: 1, th: IG_NUDGE[0][0], en: IG_NUDGE[0][1] });
    else if (f1Done && !st.f2[ig.h] && !st.skipped[id2] && daysSince(t) >= 7) out.push({ id: id2, ig, step: 2, th: IG_NUDGE[1][0], en: IG_NUDGE[1][1] });
  }
  for (const ig of IG_TOP) if (!st.sent[ig.h] && !st.skipped['ig:' + ig.h]) out.push({ id: 'ig:' + ig.h, ig, step: 0, th: ig.th, en: ig.en });
  return out.slice(0, igPace(st).left);
}
function igCard(c: IgCard, api: QApi): HTMLElement {
  const st0 = igLoad();
  const setK = (k: 'sent' | 'skip') => async () => {
    const u = igLoad(); const now = new Date().toISOString();
    if (k === 'skip') u.skipped[c.id] = now; else if (c.step === 0) u.sent[c.ig.h] = now; else if (c.step === 1) u.f1[c.ig.h] = now; else u.f2[c.ig.h] = now;
    igSave(u);
  };
  const stepLbl = c.step === 0 ? 'First DM' : c.step === 1 ? `Follow-up 1 · sent ${daysSince(st0.sent[c.ig.h])} days ago` : `Last check-in · sent ${daysSince(st0.sent[c.ig.h])} days ago`;
  const card = el('div', { 'data-ig': c.id },
    el('div', { class: 'card' },
      el('div', { class: 'row wrap', style: 'gap:8px' }, pill('Instagram · @' + c.ig.h, 'p'), pill(stepLbl, c.step ? 'a' : '')),
      el('div', { class: 'dim sm', style: 'margin-top:8px', id: 'igMeta' }, `${c.ig.tier} · ${c.ig.followers} · ${c.ig.niche}`),
      c.step === 0 ? el('div', { class: 'faint xs', style: 'margin-top:4px' }, 'Mentions: ' + c.ig.ref) : null,
      el('pre', { class: 'reply', id: 'igText-' + c.id, lang: 'th' }, c.th),
      el('details', { id: 'igEn-' + c.id, style: 'margin-top:10px' }, el('summary', { class: 'dim sm', style: 'cursor:pointer' }, 'Show English'),
        el('p', { class: 'sm', style: 'margin:8px 0 0' }, c.en))),
    el('div', { class: 'tip' }, ic('info'), 'Check their last post is under 30 days old and read the DM thread first. 5–15 min apart, 11:00–21:00. Stop 48 h on any IG warning.'));
  const go = el('a', { class: 'btn pri big full', href: 'https://instagram.com/' + c.ig.h, target: '_blank', rel: 'noopener noreferrer', id: 'igGo-' + c.id }, ic('copy'), 'Copy & open');
  go.onclick = () => { void copyText(c.th).then((ok) => toast(ok ? 'Thai DM copied · tap Message, then paste' : 'Could not copy · select the text and copy it', { ms: 4000 })); };
  const mark = btn('go', [ic('check'), 'Mark sent'], () => { const p = igPace(igLoad()); api.done(`Sent · ${p.done + 1}/${p.max} IG today`, setK('sent')); }, { id: 'igMark-' + c.id });
  const skip = btn('ghost', [ic('skip'), 'Skip'], () => api.done('Skipped', setK('skip')), { id: 'igSkip-' + c.id });
  api.actions(el('div', {}, go, el('div', { class: 'two', style: 'margin-top:10px' }, skip, mark)));
  return card;
}
/** Today's Reddit comments for the Replies queue: only as many as the playbook allows today (none on read-only days). */
function redditToday(): RItem[] {
  const st = rLoad(); const p = rPace(st);
  return R_SEED.filter((r) => !st.posted[r.id] && !st.skipped[r.id]).slice(0, p.left);
}
/** Reddit cooldown: a new low-karma account gets "you are doing that too much" if comments come faster than ~10–15 min. */
const R_COOL_MS = 15 * 60_000;
let rPending: { id: string; at: number } | null = null; // Mark posted inside the 5 s Undo window (not saved yet)
function rLastPosted(exceptId: string): number {
  const saved = Object.values(rLoad().posted).map((t) => Date.parse(t));
  const pend = rPending && rPending.id !== exceptId ? [rPending.at] : [];
  return Math.max(0, ...saved, ...pend);
}
function redditCard(r: RItem, api: QApi): HTMLElement {
  const setK = (k: 'posted' | 'skipped') => async () => { const u = rLoad(); u[k][r.id] = new Date().toISOString(); rSave(u); };
  const coolT = el('b', { id: 'redditCoolT' }, '');
  const cool = el('div', { class: 'warnbox', id: 'redditCool', style: 'color:var(--warn);border-color:rgba(255,196,77,.4);background:rgba(255,196,77,.07);display:none' }, ic('clock'), coolT);
  const card = el('div', { 'data-reddit': r.id },
    el('div', { class: 'card' },
      el('div', { class: 'row wrap', style: 'gap:8px' }, pill('Reddit · r/' + r.sub, 'p'), r.low ? pill('Low priority · old thread', 'a') : null),
      el('div', { style: 'margin-top:10px;font:600 17px/1.3 var(--h)', id: 'redditTitle' }, r.title),
      el('pre', { class: 'reply', id: 'redditText-' + r.id }, r.text)),
    cool,
    el('div', { class: 'tip', id: 'redditNewAcct' }, ic('warn'), 'New account: Reddit allows about 1 comment every 10–15 min. If you see "try again later", wait and don\'t retry right away.'),
    el('div', { class: 'tip' }, ic('info'), 'Edit it to fit the thread. No link, never name the app.'));
  const go = el('a', { class: 'btn pri big full', href: r.url, target: '_blank', rel: 'noopener noreferrer', id: 'redditGo-' + r.id }, ic('copy'), 'Copy & open');
  go.onclick = (e) => {
    if (go.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
    void copyText(r.text).then((ok) => toast(ok ? 'Copied · long-press the comment box and paste' : 'Could not copy · select the text and copy it', { ms: 4000 }));
  };
  const mark = btn('go', [ic('check'), 'Mark posted'], () => {
    const p = rPace(rLoad()); rPending = { id: r.id, at: Date.now() };
    api.done(`Posted · ${p.done + 1}/${p.max} today`, async () => { await setK('posted')(); if (rPending?.id === r.id) rPending = null; });
  }, { id: 'redditMark-' + r.id });
  const skip = btn('ghost', [ic('skip'), 'Skip'], () => api.done('Skipped', setK('skipped')), { id: 'redditSkip-' + r.id });
  const tick = () => {
    if (!card.isConnected && t) { clearInterval(t); return; }
    const left = rLastPosted(r.id) + R_COOL_MS - Date.now();
    const lock = left > 0;
    mark.disabled = lock;
    go.setAttribute('aria-disabled', String(lock)); go.style.opacity = lock ? '0.45' : ''; go.style.pointerEvents = lock ? 'none' : '';
    cool.style.display = lock ? 'flex' : 'none';
    if (lock) { const sec = Math.ceil(left / 1000); coolT.textContent = `Next Reddit comment in ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
  };
  let t = 0;
  api.actions(el('div', {}, go, el('div', { class: 'two', style: 'margin-top:10px' }, skip, mark)));
  tick(); t = window.setInterval(tick, 1000);
  return card;
}
async function copyText(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; } catch { /* fall back */ }
  try { const ta = el('textarea', { style: 'position:fixed;opacity:0;top:0' }) as HTMLTextAreaElement; ta.value = t; document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; }
}
function redditView() {
  const st = rLoad();
  const p = rPace(st);
  const full = p.left === 0;
  const fmt = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
  const startIn = el('input', { type: 'date', id: 'redditStart', value: st.start, max: bkkToday() }) as HTMLInputElement;
  startIn.onchange = () => { if (!startIn.value) return; st.start = startIn.value; rSave(st); toast(`Start date: ${fmt(st.start)}`, { ms: 2000 }); redditView(); };
  const gap = p.last ? Date.parse(p.last) + 2 * 3600_000 - Date.now() : 0;
  const status = p.max === 0
    ? el('div', { class: 'warnbox', id: 'redditReadOnly', style: 'color:var(--warn);border-color:rgba(255,196,77,.4);background:rgba(255,196,77,.07)' }, ic('info'),
      `Day ${p.day} of 3 is read only: read, upvote and join the subs, verify the email. No comments yet.`)
    : full ? el('div', { class: 'warnbox', id: 'redditLimit' }, ic('warn'), 'Limit reached, come back tomorrow.')
      : gap > 0 ? el('div', { class: 'tip', id: 'redditGap' }, ic('clock'), `Next one after ${bkkTime(new Date(Date.parse(p.last!) + 2 * 3600_000).toISOString(), false)} (2+ hours apart).`) : null;
  const hist = [
    ...Object.entries(st.posted).map(([id, at]) => ({ id, at, kind: 'posted' as const })),
    ...Object.entries(st.skipped).map(([id, at]) => ({ id, at, kind: 'skipped' as const })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const histRow = (h: typeof hist[number]) => {
    const r = R_SEED.find((x) => x.id === h.id); if (!r) return null;
    const back = btn('ghost', [h.kind === 'posted' ? 'Undo' : 'Restore'], () => { const u = rLoad(); delete u[h.kind][h.id]; rSave(u); toast('Back in the queue', { ms: 2000 }); redditView(); }, { id: 'redditBack-' + h.id, style: 'min-height:38px;padding:0 12px;font-size:13px' });
    return el('div', { class: 'li', 'data-hist': h.id },
      el('span', { class: 'grow' }, el('b', {}, r.title), el('span', { class: 's' }, `r/${r.sub} · ${h.kind === 'posted' ? 'Posted' : 'Skipped'} ${fmt(bkkDate(h.at))}, ${bkkTime(h.at, false)}`)),
      h.kind === 'posted' ? el('a', { class: 'icb', href: r.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Open thread' }, ic('open')) : null, back);
  };
  screen('more',
    el('div', { class: 'row', style: 'margin:6px 0 16px' }, el('a', { class: 'icb', href: '#more', 'aria-label': 'Back' }, ic('back')), el('h1', { style: 'font-size:26px' }, 'Reddit plan')),
    el('details', { class: 'card', id: 'redditChecklist' },
      el('summary', {}, el('span', { class: 'grow' }, el('b', {}, 'Before you post'), el('span', { class: 'dim sm' }, 'Comments only · no links · never name the app')), ic('chev')),
      el('div', { class: 'in' }, el('ul', { style: 'margin:0;padding-left:20px;line-height:1.55' }, ...R_CHECK.map((t) => el('li', {}, t))))),
    el('div', { class: 'stats', id: 'redditPace', style: 'margin-top:12px' },
      el('div', { class: 'stat' }, el('b', { id: 'redditDay' }, String(p.day)), el('span', {}, `Day · ${p.phase}`)),
      el('div', { class: 'stat' }, el('b', { id: 'redditTarget' }, p.max === 0 ? '0' : `${p.min}–${p.max}`), el('span', {}, 'Target today')),
      el('div', { class: 'stat' }, el('b', { id: 'redditDone', class: full && p.max ? 'okc' : '' }, `${p.done}/${p.max}`), el('span', {}, 'Done today'))),
    el('details', { class: 'card', style: 'margin-top:12px' },
      el('summary', {}, el('span', { class: 'grow' }, el('b', { style: 'font-size:15px' }, `Started ${fmt(st.start)}`), el('span', { class: 'dim sm' }, 'Days 1–3 read · then 2–3 a day for two weeks · then 3–5')), ic('chev')),
      el('div', { class: 'in' }, el('label', { class: 'f' }, 'Start date (day 1)', startIn))),
    status,
    el('a', { class: 'li', href: '#q/replies', id: 'redditToQueue', style: 'margin-top:12px' }, el('span', { class: 'ic' }, ic('send')),
      el('span', { class: 'grow' }, el('b', {}, `Today's comments · ${redditToday().length}`), el('span', { class: 's' }, 'In To do → Replies to send')), ic('chev')),
    el('div', { class: 'sec' }, `History · ${hist.length}`),
    hist.length ? el('div', { id: 'redditHistory' }, ...hist.map(histRow)) : el('p', { class: 'faint sm', id: 'redditHistory' }, 'Nothing posted yet.'));
}

// ───────────────────────────── More + history ─────────────────────────────
function igPauseRow(): HTMLElement {
  const st = igLoad(); const p = igPace(st); const on = igPaused(st);
  const sent = Object.keys(st.sent).length;
  return el('div', { class: 'li', id: 'igRow' }, el('span', { class: 'ic' }, ic('send')),
    el('span', { class: 'grow' }, el('b', {}, 'Instagram DMs'), el('span', { class: 's', id: 'igSub' }, on ? `Paused until ${bkkTime(st.pausedUntil!)}` : `${p.done}/${p.max} today · ${sent}/${IG_TOP.length} sent`)),
    sw('igPause', 'Paused 48 h', on, (v) => { const u = igLoad(); u.pausedUntil = v ? new Date(Date.now() + 48 * 3600_000).toISOString() : null; igSave(u); counts = null; toast(v ? 'Instagram paused for 48 h' : 'Instagram back on', { ms: 2500 }); moreView(); }));
}
function moreView() {
  // 18 Nov declutter: one grouped list, one line per tool; rarely used tools sit in one folded "More tools" row
  const li = (href: string, icon: string, title: string, id: string) => el('a', { class: 'li', href, id }, el('span', { class: 'ic' }, ic(icon)), el('span', { class: 'grow' }, el('b', {}, title)), ic('chev'));
  const out = el('button', { type: 'button', class: 'lt-out', id: 'signOut' }, 'Sign out');
  out.onclick = async () => { flushWrite(); (await v5Client()).auth.signOut().catch(() => undefined); location.hash = ''; void boot(); };
  const cleaned = cleanedNote || LS('kr8-admin-cleaned');
  const inst = installAdminRow();
  const tools = [
    li('#problems', 'warn', 'Problems', 'moreProblems'),
    li('#places', 'store', 'Places', 'morePlaces'),
    li('#ghost', 'eye', 'Ghost mode', 'moreGhost'),
    el('a', { class: 'li', href: ghostAppUrl(), id: 'moreGhostOpen', target: '_blank', rel: 'noopener' }, el('span', { class: 'ic' }, ic('open')), el('span', { class: 'grow' }, el('b', {}, 'Open app as ghost')), ic('chev')),
    li('#history/reels', 'reel', 'All Reels', 'histReels'),
    li('#history/faces', 'face', 'Past face checks', 'histFaces'),
    li('#history/reports', 'flag', 'Closed reports', 'histReports'),
    li('#top5', 'trophy', 'Old manual awards', 'moreOldAwards'),
    li('#rules', 'book', 'House rules', 'rulesLink'),
    li('#todo', 'check', 'Old queues', 'moreTodo'),
    li('#listings', 'store', 'Listings', 'moreListings'),
    li('#reddit', 'msg', 'Reddit plan', 'moreReddit'),
    li('#history/replies', 'send', 'Sent and skipped replies', 'histReplies'),
  ];
  screen('more', head('Kring admin', 'More'),
    el('div', { class: 'lt-group' },
      li('#help', 'msg', 'Help chats', 'moreHelp'),   // 0120: every member Help conversation
      li('#board', 'trophy', 'Board', 'moreBoard'),   // 18 Nov: moved here from the dock (Growth took its seat)
      li('#viewas', 'eye', 'View as member', 'moreViewAs'),
      li('#autopilot', 'spark', 'Autopilot', 'moreAutopilot'),
      li('#post', 'reel', 'Post a Reel', 'morePost'),
      li('#money', 'party', 'Money', 'moreMoney'),
      li('#codes', 'party', 'Reward codes', 'moreCodes'),
      li('#week', 'trophy', 'Approve week', 'moreWeek')),
    el('div', { class: 'lt-group' },
      li('#faces', 'face', 'Face checks', 'moreFaces'),
      li('#dups', 'users', 'Same person?', 'moreDups'),
      li('#push', 'send', 'Send a ding', 'morePush'),
      li('#recruiters', 'link', 'Recruiters', 'moreRecruiters'),
      li('#log', 'hist', 'Activity log', 'moreLog')),
    el('details', { class: 'lt-group lt-fold', id: 'moreTools' },
      el('summary', { class: 'li' }, el('span', { class: 'ic' }, ic('more')), el('span', { class: 'grow' }, el('b', {}, 'More tools')), el('span', { class: 'lt-n' }, String(tools.length + (inst ? 3 : 2)))),
      ...tools, igPauseRow(), inst, v2TestToggle(),
      el('p', { class: 'faint xs', id: cleaned ? 'verifyCleaned' : undefined, style: 'margin:8px 14px' }, cleaned || 'Selfies are deleted 30 days after review (runs when Face checks open).')),
    el('div', { class: 'lt-group' },
      el('div', { class: 'li' }, el('span', { class: 'ic' }, ic('users')), el('span', { class: 'grow' }, el('b', {}, me || 'Admin')), out)));
}
function rulesView() {
  const r = (t: string, b: string) => el('p', {}, el('b', {}, t), b);
  app.replaceChildren(el('div', { class: 'scr' },
    el('div', { class: 'row', style: 'margin:6px 0 16px' }, el('a', { class: 'icb', href: '#more', 'aria-label': 'Back' }, ic('back')), el('h1', { style: 'font-size:26px' }, 'House rules')),
    el('div', { class: 'card rules' },
      r('Reports', 'A Reel reported by 3 different people hides itself until you decide.'),
      r('Face checks', 'Same person, clear face, not a photo of a screen. The member sees the reject reason.'),
      r('Selfies', 'Deleted 30 days after review.'),
      r('Replies', 'Max 5 a day · 20+ minutes apart · Kring only after 9 replies without it. A disclosure line is added when Kring is mentioned.'),
      r('Kring Local payouts', 'Only approved Reels count: first approved Reel, and 3 approved Reels within the first 14 days.'),
      r('Recruiter pay', 'Per sign-up with their link whose first Reel is approved (Recruiters: "Paid · 1st Reel approved"). Recruiter pay needs no face check. Invite Rings (+10) count only once the invited friend passes the face check (since 21 Nov).'),
      r('Recruiter milestones', 'M1 = verified + photo, area, IG + 1 approved Reel. M2 = M1 + opened the app on a later day and sent a hello / saved 3 / 2nd Reel.'),
      r('Venue deals', 'In baht, never percent. No quiet-hours words, links or phone numbers.'),
      r('Stay / Do', 'The partner sets the member price. No other-site prices. Hidden until switched live.'),
      r('Weekly prizes', 'Automatic: Top 8 share ฿1,500 / 900 / 600 / 500 / 400 / 250 / 150 / 100 = ฿4,400. A prize rank needs 25 Rings. Weeks start Monday.'))), tabbar('more'));
  window.scrollTo(0, 0);
}
let histSeg: Record<string, string> = { reels: 'approved', faces: 'approved', replies: 'sent' };
async function historyView(kind: string) {
  const titles: Record<string, string> = { reels: 'All Reels', reports: 'Closed reports', faces: 'Past face checks', replies: 'Replies' };
  const segs: Record<string, [string, string][]> = { reels: [['pending', 'Waiting'], ['approved', 'Approved'], ['hidden', 'Hidden']], faces: [['approved', 'Approved'], ['rejected', 'Rejected']], replies: [['sent', 'Sent'], ['skipped', 'Skipped']] };
  const body = el('div', {}, loading());
  const seg = segs[kind] ? el('div', { class: 'seg' }, ...segs[kind].map(([k, l]) => { const b = el('button', { type: 'button', class: histSeg[kind] === k ? 'on' : '', id: `hist-${kind}-${k}` }, l); b.onclick = () => { histSeg[kind] = k; void historyView(kind); }; return b; })) : null;
  app.replaceChildren(el('div', { class: 'scr' }, el('div', { class: 'row', style: 'margin:6px 0 16px' }, el('a', { class: 'icb', href: '#more', 'aria-label': 'Back' }, ic('back')), el('h1', { style: 'font-size:26px' }, titles[kind] || 'History')), seg, body), tabbar('more'));
  window.scrollTo(0, 0);
  try {
    if (kind === 'reels') {
      const st = histSeg.reels as Reel['status'];
      const rows = await rpc<Reel[]>('kr8_admin_reels', { p_status: st, p_limit: 100 });
      const [urls, checks] = await Promise.all([signReelPaths(rows.map((r) => r.poster_path)).catch(() => ({} as Record<string, string>)), loadReelChecks(rpc, rows.map((r) => r.id))]);
      body.replaceChildren(...(rows.length ? rows.map((r) => {
        const row = el('div', { class: 'li', 'data-reel': r.id }, el('img', { class: 'thumb', src: urls[r.poster_path] || '', alt: '' }),
          el('span', { class: 'grow' }, el('b', {}, r.author_name), el('span', { class: 's' }, `${r.area} · ${ago(r.created_at)}`),
            el('a', { class: 'link xs', href: reelLink(r.id), target: '_blank', rel: 'noopener', style: 'display:block;margin-top:4px' }, 'Open Reel'),
            reelCheckRow(r.id, checks.get(r.id))));
        const acts = el('div', { style: 'display:flex;flex-direction:column;gap:6px' });
        const set = (s: 'approved' | 'hidden', label: string, cls: string) => btn(cls, [label], s === 'hidden'
          // 17 Nov: Hide here asks why too (same sheet as the Reel queue)
          ? () => rejectSheet('Why hide?', 'The member sees this reason on their Reel.', REEL_CHIPS, 'histHide-' + r.id,
            (why) => rpc('kr8_admin_review_reel', { p_reel: r.id, p_status: 'hidden', p_note: why }), () => { row.remove(); counts = null; }, { cta: 'Send · hide', done: 'Hidden · reason sent' })
          : async () => {
            try { await rpc('kr8_admin_review_reel', { p_reel: r.id, p_status: s }); toast('Approved', { ms: 1500 }); row.remove(); counts = null; } catch (e) { toast(errText(e)); }
          }, { id: (s === 'approved' ? 'approveReel-' : 'hideReel-') + r.id, style: 'min-height:40px;padding:0 12px;font-size:13px' });
        if (r.status !== 'approved') acts.append(set('approved', 'Approve', 'go'));
        if (r.status !== 'hidden') acts.append(set('hidden', 'Hide', 'out-bad'));
        row.append(acts);
        return row;
      }) : [empty('No Reels here')]));
    } else if (kind === 'reports') {
      const rows = await rpc<Report[]>('kr8_admin_reports', { p_open: false, p_limit: 200 });
      body.replaceChildren(...(rows.length ? rows.map((r) => el('div', { class: 'li', 'data-report': r.id }, el('span', { class: 'ic' }, ic('flag')),
        el('span', { class: 'grow' }, el('b', {}, (r.category && CAT[r.category]) || 'Report about a person'), el('span', { class: 's' }, `About ${r.target_name || '–'} · by ${r.reporter_name || '–'} · ${bkkTime(r.created_at)}`),
          !r.category && r.reason ? el('span', { class: 's', style: 'display:block' }, `“${r.reason}”`) : null),
        r.resolution ? pill(RES[r.resolution]?.[0] || r.resolution, RES[r.resolution]?.[1] || '') : null)) : [empty('No closed reports')]));
    } else if (kind === 'faces') {
      const rows = await rpc<Face[]>('kr8_admin_verifications', { p_status: histSeg.faces });
      const signed = await signSelfies(rows).catch(() => ({} as Record<string, string>));
      body.replaceChildren(...(rows.length ? rows.map((r) => el('details', { class: 'card', style: 'margin-bottom:10px', 'data-verify': r.id },
        el('summary', {}, r.profile_photo ? el('img', { src: r.profile_photo, alt: '', style: 'width:40px;height:40px;border-radius:12px;object-fit:cover' }) : el('span', { class: 'icb' }, ic('face')),
          el('div', { class: 'grow' }, el('b', {}, r.first_name), el('span', { class: 'dim sm' }, `${r.status === 'approved' ? 'Approved' : 'Rejected'} · ${bkkTime(r.reviewed_at || r.created_at)}`)), ic('chev')),
        el('div', { class: 'in' }, faceBody(r, signed)))) : [empty('Nothing here')]));
    } else if (kind === 'replies') {
      const rows = await rpc<Social[]>('kr8_admin_social_list', { p_status: histSeg.replies });
      body.replaceChildren(...(rows.length ? rows.map((r) => {
        const c = el('div', { class: 'card', 'data-social': r.id, 'data-status': r.status, style: 'margin-bottom:10px' },
          el('div', { class: 'row' }, pill('r/' + r.subreddit, 'p'), el('span', { class: 'grow' }), pill(r.status, r.status === 'sent' ? 'g' : '')),
          el('a', { href: r.thread_url, target: '_blank', rel: 'noopener noreferrer', style: 'display:block;margin-top:8px;font-weight:600;text-decoration:none' }, r.thread_title || r.thread_url),
          el('pre', { class: 'reply', style: 'font-size:13.5px' }, r.final_text || r.reply_text),
          r.sent_at ? el('p', { class: 'faint xs', style: 'margin:8px 0 0' }, `${r.send_mode || ''} · ${bkkTime(r.sent_at)}`) : null,
          r.result_url ? el('a', { class: 'link sm', href: r.result_url, target: '_blank', rel: 'noopener noreferrer', id: 'socialResult-' + r.id }, 'See comment ↗') : null);
        if (r.send_mode === 'manual' && r.sent_at && Date.now() - Date.parse(r.sent_at) < 2 * 3600_000)
          c.append(el('div', { style: 'margin-top:10px' }, btn('ghost', ['Undo (not posted)'], async () => { try { await rpc('kr8_admin_social_undo', { p_id: r.id }); toast('Back in the queue', { ms: 2000 }); counts = null; void historyView('replies'); } catch (e) { toast(errText(e)); } }, { id: 'socialUndo-' + r.id })));
        return c;
      }) : [empty('Nothing here')]));
    }
  } catch (e) { body.replaceChildren(errP(e)); }
}

// ───────────────────────────── reward codes (14 Nov) ─────────────────────────────
// Paste codes per brand / amount (amounts = the weekly prize ladder + Founding Local). A held claim (a winner claimed while there was no code of that exact amount) gets the next code
// automatically the moment it is saved (DB trigger kr8_codes_fill). Codes are never shown here after saving.
type StockRow = { brand: 'grab' | 'shopeepay' | 'truemoney'; amount_thb: number; available: number; held: number; given_7d: number };
const BRANDN: Record<string, string> = { grab: 'Grab', shopeepay: 'ShopeePay', truemoney: 'TrueMoney' };
export function parseCodes(txt: string): string[] {
  // redeem links (TrueMoney vouchers arrive as https links) are kept whole: one per line
  const parts = /https:\/\//i.test(txt) ? txt.split(/[\n\r]+|\s+(?=https:\/\/)/) : txt.split(/[\n,;]+/);
  return [...new Set(parts.map((x) => x.trim()).filter((x) => x.length >= 4 && x.length <= 200))];
}
async function codesView() {
  const body = el('div', {}, loading());
  screen('more', el('div', { class: 'row', style: 'margin:6px 0 16px' }, el('a', { class: 'icb', href: '#more', 'aria-label': 'Back' }, ic('back')), el('h1', { style: 'font-size:26px' }, 'Reward codes')), body);
  const draw = async () => {
    let rows: StockRow[] = [];
    try { rows = await rpc<StockRow[]>('kr8_admin_reward_stock'); } catch (e) { body.replaceChildren(errP(e)); return; }
    // audit P2-6: TrueMoney rows are named by the CODE value you load (live is 100%: a ฿500 prize = a ฿500 code), from the live rules
    const pct = await rpc<Record<string, number>>('kr8_rings_rules').then((r) => Number(r?.truemoney_payout_pct) || 100).catch(() => 100);
    const codeVal = (b: string, a: number) => (b === 'truemoney' ? Math.floor((a * Math.min(100, Math.max(1, pct))) / 100) : a);
    const held = rows.reduce((n, r) => n + r.held, 0);
    // 18 Nov declutter: ONE line per prize amount (Grab and TrueMoney side by side), tap a line to paste for that amount
    const amts = [...new Set(rows.map((r) => r.amount_thb))].sort((x, y) => y - x);
    const brandsIn = [...new Set(rows.map((r) => r.brand))];
    const cell = (r: StockRow | undefined) => r ? el('span', { class: `lt-cell ${r.available ? '' : 'zero'}`, 'data-stock': `${r.brand}_${r.amount_thb}` },
      el('b', {}, String(r.available)), r.held ? el('i', { class: 'lt-held' }, `${r.held} held`) : null,
      r.brand === 'truemoney' && codeVal(r.brand, r.amount_thb) !== r.amount_thb ? el('small', {}, `฿${codeVal(r.brand, r.amount_thb)} code`) : null) : el('span', { class: 'lt-cell none' });
    const stock = el('div', { class: 'lt-list', id: 'codesStock' },
      el('div', { class: 'lt-hd' }, el('b', { class: 'grow' }, 'Codes left'), ...brandsIn.map((b) => el('span', { class: 'lt-col' }, BRANDN[b])),
        info(`One line per prize amount, codes left per brand. “held” = a winner is waiting for that exact code. Tap a line to paste for that amount. ${pct >= 100 ? 'TrueMoney pays the full prize value.' : `TrueMoney pays ${pct} in every 100 baht of a prize.`}`, 'codesInfo')),
      ...amts.map((a) => {
        const row = el('button', { type: 'button', class: 'v2li lt-stock', 'data-amount': String(a) }, el('b', { class: 'grow' }, `฿${a.toLocaleString('en-US')}`),
          ...brandsIn.map((b) => cell(rows.find((r) => r.brand === b && r.amount_thb === a))));
        row.onclick = () => { (amount as HTMLSelectElement).value = String(a); area.focus(); };
        return row;
      }));
    const brands = [...new Set(rows.map((r) => r.brand))];
    const amounts = [...new Set(rows.map((r) => r.amount_thb))].sort((a, b) => b - a);
    const brand = el('select', { id: 'codeBrand' }, ...(brands.length ? brands : ['grab', 'truemoney']).map((b) => el('option', { value: b }, BRANDN[b])));
    const amountOpts = (b: string) => (amounts.length ? amounts : [1500, 900, 600, 500, 400, 250, 150, 100]).map((a) =>
      el('option', { value: String(a) }, b === 'truemoney' && codeVal(b, a) !== a ? `฿${codeVal(b, a).toLocaleString('en-US')} code (prize ฿${a.toLocaleString('en-US')})` : `Prize ฿${a.toLocaleString('en-US')}`));
    const amount = el('select', { id: 'codeAmount' }, ...amountOpts(brands[0] || 'grab'));
    brand.onchange = () => { const v = (amount as HTMLSelectElement).value; amount.replaceChildren(...amountOpts((brand as HTMLSelectElement).value)); (amount as HTMLSelectElement).value = v; };
    const url = el('input', { id: 'codeUrl', placeholder: 'Activation link (optional, https://…)' });
    const area = el('textarea', { id: 'codeList', rows: '4', placeholder: 'Paste codes or redeem links, one per line' }) as HTMLTextAreaElement;
    const test = el('input', { type: 'checkbox', id: 'codeTest' }) as HTMLInputElement;
    const count = el('p', { class: 'faint xs', id: 'codeCount' }, '0 codes');
    area.oninput = () => { count.textContent = `${parseCodes(area.value).length} codes`; };
    const save = btn('pri big full', ['Save codes'], async () => {
      const codes = parseCodes(area.value);
      if (!codes.length) { toast('Paste at least one code'); return; }
      const u = (url as HTMLInputElement).value.trim();
      if (u && !/^https:\/\//.test(u)) { toast('The activation link must start with https://'); return; }
      save.disabled = true;
      try {
        const n = await rpc<number>('kr8_admin_add_reward_codes', { p_brand: (brand as HTMLSelectElement).value, p_amount: Number((amount as HTMLSelectElement).value), p_codes: codes, p_activation_url: u || null, p_test: test.checked });
        toast(`${n} new code${n === 1 ? '' : 's'} saved${codes.length - n ? ` · ${codes.length - n} already there` : ''}. Held claims get theirs now.`, { ms: 4000 });
        area.value = ''; count.textContent = '0 codes';
        await draw();
      } catch (e) { toast(errText(e), { ms: 6000 }); } finally { save.disabled = false; }
    }, { id: 'codeSave' });
    body.replaceChildren(
      held ? el('div', { class: 'lt-alert', id: 'codesHeld' }, el('span', { class: 'v2dot2 a' }), el('b', { class: 'grow' }, `${held} member${held === 1 ? ' is' : 's are'} waiting for a code`),
        info('They won a prize and tapped Claim. Add a code of the same brand and amount below and it goes out by itself.')) : '',
      stock,
      el('div', { class: 'lt-paste', id: 'codesForm' },
        el('div', { class: 'row', style: 'gap:8px' }, brand, amount),
        area, count,
        save,
        el('details', { class: 'v2fold', id: 'codesMore' }, el('summary', {}, el('b', { class: 'grow' }, 'Link or test codes'), el('span', { class: 'v2fold-x' })),
          el('div', { class: 'v2fold-in stack' },
            el('p', { class: 'faint xs' }, 'TrueMoney vouchers that arrive as a link: paste the link itself, one per line. The member gets a “Redeem into TrueMoney” button.'),
            el('label', { class: 'f' }, 'Activation link', url),
            el('label', { class: 'row', style: 'gap:8px' }, test, el('span', {}, 'Test codes (only test members get them)'))))));
  };
  await draw();
}

// ───────────────────────────── Post a Reel (17 Nov): one tap per platform via the phone's share sheet ─────────────────────────────
// Kept for this session only (in memory): the picked video, the caption, and which platforms he already tapped.
const post: { file: File | null; url: string; caption: string; done: Set<Platform> } = { file: null, url: '', caption: REEL_CAPTION, done: new Set() };
const PLAT_ICON: Record<Platform, string> = {
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".6" fill="currentColor"/>',
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10 9v6l5-3z" fill="currentColor"/>',
  x: '<path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z" fill="currentColor" stroke="none"/>',
};
function postView() {
  // 18 Nov declutter: the video is the page; the caption is ready (one tap to edit); ONE strong button = the next platform to post to
  const fileIn = el('input', { type: 'file', accept: 'video/*', id: 'postFile', style: 'display:none' }) as HTMLInputElement;
  const pick = el('label', { class: 'lt-pick', for: 'postFile', id: 'postPick' });
  const prev = el('div', { id: 'postPrev' });
  const caption = el('textarea', { id: 'postCaption', rows: '6' }) as HTMLTextAreaElement; caption.value = post.caption;
  const warn = el('p', { class: 'err', id: 'postWarn' });
  const hint = el('p', { class: 'okc sm', id: 'postHint', style: 'margin:10px 2px 0;min-height:1em;text-align:center' });
  const paintPrev = () => {
    prev.replaceChildren(...(post.file ? [el('div', { class: 'post-prev' },
      el('video', { src: post.url, muted: true, playsinline: true, controls: true, preload: 'metadata' }),
      el('div', { class: 'grow' }, el('b', {}, post.file.name), el('div', { class: 'faint sm', id: 'postSize' }, fileSize(post.file.size))))] : []));
    pick.replaceChildren(ic(post.file ? 'reel' : 'plus'), el('b', {}, post.file ? 'Pick another video' : 'Pick the video'));
    pick.classList.toggle('has', !!post.file);
  };
  const checkWords = () => { const bad = bannedIn(caption.value); warn.textContent = bad.length ? `Take out: ${bad.join(', ')}` : ''; if (bad.length) capBox.open = true; };
  caption.oninput = () => { post.caption = caption.value; checkWords(); };
  fileIn.onchange = () => {
    const f = fileIn.files?.[0]; if (!f) return;
    if (post.url) URL.revokeObjectURL(post.url);
    post.file = f; post.url = URL.createObjectURL(f); post.done.clear();
    paintPrev(); paintBtns();
  };
  const capBox = el('details', { class: 'v2fold', id: 'postCapBox' },
    el('summary', {}, ic('edit'), el('span', { class: 'grow lt-cap1' }, el('b', {}, 'Caption ready'), el('small', {}, REEL_CAPTION_EN.replace(/^Thai line says: /, ''))), el('span', { class: 'v2fold-x' })),
    el('div', { class: 'v2fold-in stack' }, caption, el('p', { class: 'faint xs' }, REEL_CAPTION_EN)));
  const btns = el('div', { class: 'post-btns lt-post', id: 'postBtns' });
  const paintBtns = () => {
    const next = PLATFORMS.find((p) => !post.done.has(p.id))?.id;
    btns.replaceChildren(...PLATFORMS.map((p) => {
      const done = post.done.has(p.id);
      const svg = ic(''); svg.innerHTML = PLAT_ICON[p.id];
      const b = btn(`full post-${p.id}${done ? ' done' : ''}${p.id === next ? ' lt-next' : ' lt-soft'}`, [svg, el('span', { class: 'grow' }, p.id === next ? `Post to ${p.name}` : p.name), done ? el('span', { class: 'post-ok' }, '✓ posted') : null], () => {
        if (!post.file) { toast('Pick a video first'); return; }
        // no await before shareReel: the share sheet / new tab need this tap
        void shareReel(p.id, post.file, caption.value, { copy: copyText, canShare: navigator.canShare?.bind(navigator), share: navigator.share?.bind(navigator), open: (u) => window.open(u, '_blank', 'noopener') })
          .then((r) => {
            if (r === 'cancelled') { hint.textContent = 'Share closed · caption is still copied'; return; }
            hint.textContent = r === 'opened' ? 'Caption copied — paste it after the video loads' : `Caption copied — paste it in ${p.name} after the video loads`;
            post.done.add(p.id); paintBtns();
          });
      }, { id: 'post-' + p.id });
      return b;
    }));
  };
  paintPrev(); paintBtns(); checkWords();
  screen('more', el('div', { class: 'row', style: 'margin:6px 0 16px' }, el('a', { class: 'icb', href: '#more', 'aria-label': 'Back' }, ic('back')), el('h1', { style: 'font-size:26px' }, 'Post a Reel')),
    fileIn, pick, prev,
    capBox, warn,
    btns, hint);
}

// ───────────────────────────── Send notification (16 Nov dings, 0059) ─────────────────────────────
type PushStats = { phones: number; members: number; line_members: number; line_month: number; line_cap: number; recent: { id: number; kind: string; title: string | null; to_all: boolean; at: string; phones: number; lines: number;
  member_no: number | null; first_name: string | null; sent: number; failed: number; waiting: number }[] };
const PUSH_KIND: Record<string, string> = { verified: 'Face check approved', reward: 'Reward ready', reel: 'Reel approved' };
async function pushView() {
  const body = el('div', {}, loading());
  screen('more', el('div', { class: 'row', style: 'margin:6px 0 16px' }, el('a', { class: 'icb', href: '#more', 'aria-label': 'Back' }, ic('back')), el('h1', { style: 'font-size:26px' }, 'Send notification')), body);
  const draw = async () => {
    let st: PushStats;
    try { st = await rpc<PushStats>('kr8_admin_push_stats'); } catch (e) { body.replaceChildren(errP(e)); return; }
    const one = el('input', { type: 'radio', name: 'pushTo', id: 'pushToOne', checked: true }) as HTMLInputElement;
    const all = el('input', { type: 'radio', name: 'pushTo', id: 'pushToAll' }) as HTMLInputElement;
    const no = el('input', { id: 'pushMemberNo', inputmode: 'numeric', placeholder: 'Member no, e.g. 16' }) as HTMLInputElement;
    const title = el('input', { id: 'pushTitle', maxlength: '80', placeholder: 'Title · Thai first, then English' }) as HTMLInputElement;
    const msg = el('textarea', { id: 'pushBody', rows: '3', maxlength: '240', placeholder: 'Message · Thai line, then English line' }) as HTMLTextAreaElement;
    const link = el('input', { id: 'pushLink', placeholder: 'Link inside the app (optional), e.g. ?tab=deals' }) as HTMLInputElement;
    const line = el('input', { type: 'checkbox', id: 'pushLine', checked: st.line_cap > 0 }) as HTMLInputElement;
    const out = el('p', { class: 'faint xs', id: 'pushOut' });
    const sync = () => { no.disabled = all.checked; no.style.opacity = all.checked ? '.4' : '1'; };
    one.onchange = sync; all.onchange = sync;
    const send = btn('pri big full', ['Send'], async () => {
      const r = pushSendArgs({ all: all.checked, memberNo: no.value, title: title.value, body: msg.value, link: link.value, line: line.checked });
      if ('error' in r) { out.textContent = r.error; return; }
      if (r.args.p_all && !confirm(`Send to all ${st.phones} phone${st.phones === 1 ? '' : 's'} (${st.members} member${st.members === 1 ? '' : 's'})?`)) return;
      send.disabled = true;
      try {
        const res = await rpc<{ phones: number; lines?: number; first_name?: string | null }>('kr8_admin_push_send', r.args);
        const who = r.args.p_all ? 'all members' : `${res.first_name || 'member'} #${r.args.p_member_no}`;
        const n = res.phones + (res.lines || 0);
        toast(n ? `Sent to ${who} · ${res.phones} phone${res.phones === 1 ? '' : 's'}${res.lines ? ` + ${res.lines} on LINE` : ''}` : `${who} has dings off · nothing sent`, { ms: 4000 });
        title.value = ''; msg.value = ''; link.value = ''; out.textContent = '';
        await draw();
      } catch (e) { out.textContent = errText(e); } finally { send.disabled = false; }
    }, { id: 'pushSend' });
    const recent = st.recent.map((m) => el('div', { class: 'li', 'data-push': String(m.id) },
      el('span', { class: 'grow' },
        el('b', {}, m.kind === 'admin' ? (m.title || '–') : PUSH_KIND[m.kind] || m.kind),
        el('span', { class: 's' }, `${m.to_all ? 'All members' : `${m.first_name || '?'} #${m.member_no ?? '?'}`} · ${bkkTime(m.at)} · ${m.phones} phone${m.phones === 1 ? '' : 's'}${m.lines ? ` + ${m.lines} LINE` : ''}`)),
      el('span', {}, m.sent ? pill(`${m.sent} sent`) : null, ' ', m.failed ? pill(`${m.failed} failed`, 'bad') : null, ' ', m.waiting ? pill(`${m.waiting} waiting`, 'warn') : null)));
    body.replaceChildren(
      el('div', { class: 'stats', id: 'pushStats' },
        el('div', { class: 'stat' }, el('b', {}, String(st.members)), el('span', {}, 'Members with dings on')),
        el('div', { class: 'stat' }, el('b', {}, String(st.phones)), el('span', {}, 'Phones')),
        el('div', { class: 'stat' }, el('b', { id: 'pushLineMonth' }, st.line_cap > 0 ? `${st.line_month}/${st.line_cap}` : 'Off'), el('span', {}, `LINE this month · ${st.line_members} on LINE only`))),
      el('div', { class: 'card stack', id: 'pushForm', style: 'margin-top:12px' },
        el('div', { class: 'row', style: 'gap:16px' }, el('label', { class: 'row', style: 'gap:6px' }, one, 'One member'), el('label', { class: 'row', style: 'gap:6px' }, all, 'All members')),
        el('label', { class: 'f' }, 'Member no', no),
        el('label', { class: 'f' }, 'Title', title),
        el('label', { class: 'f' }, 'Message', msg),
        el('label', { class: 'f' }, 'Link', link),
        el('label', { class: 'row', style: 'gap:8px' }, line, el('span', {}, st.line_cap > 0 ? 'Also as a LINE message to LINE members without app dings (uses the OA’s monthly messages)' : 'LINE messages are off (push_line_cap = 0)')),
        el('p', { class: 'faint xs' }, 'Automatic dings already go out for: face check approved, reward code ready, Reel approved. Never use: meet, guide, tour, host, creator, reviews, hidden gem, alcohol, gift, wallet, credit, lucky, draw, temples.'),
        out, send),
      el('div', { class: 'sec' }, `Last ${st.recent.length}`),
      st.recent.length ? el('div', { id: 'pushRecent' }, ...recent) : el('p', { class: 'faint sm', id: 'pushRecent' }, 'Nothing sent yet.'));
  };
  await draw();
}

// ───────────────────────────── Ghost mode (0061) + Kring Admin home-screen app ─────────────────────────────
export type GhostMe = { card: false } | { card: true; user_id: string; first_name: string; member_no: number | null; ghost: boolean };
export function isGhostMe(v: unknown): v is GhostMe {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return o.card === false || (o.card === true && typeof o.user_id === 'string' && typeof o.ghost === 'boolean');
}
/** The member app, same origin and same sign-in as this admin page (the admin page lives at <base>admin). */
export const ghostAppUrl = () => basePath();
export const GHOST_HIDES = [
  'Not in People, nearby, online now, search or tagging',
  'Not in anyone’s followers, Activity or ranking',
  'Never shows online or “I’m here”',
  'Reel views, shares and link opens are not counted',
  'Likes, saves, follows, hellos and posts are switched off',
];
async function ghostView() {
  const body = el('div', {}, loading());
  screen('more', el('div', { class: 'row', style: 'margin:6px 0 16px' }, el('a', { class: 'icb', href: '#more', 'aria-label': 'Back' }, ic('back')), el('h1', { style: 'font-size:26px' }, 'Ghost mode')), body);
  const draw = async () => {
    let g: unknown;
    try { g = await rpc<unknown>('kr8_admin_ghost_me'); } catch (e) { body.replaceChildren(errP(e)); return; }
    if (!isGhostMe(g)) { body.replaceChildren(el('p', { class: 'err' }, 'Ghost mode needs database update 0061.')); return; }
    const open = el('a', { class: 'btn pri big full', id: 'ghostOpenApp', href: ghostAppUrl(), target: '_blank', rel: 'noopener' }, ic('open'), g.card ? 'Open app as ghost' : 'Open the app');
    if (!g.card) {
      body.replaceChildren(el('div', { class: 'card stack', id: 'ghostNoCard' },
        el('b', {}, 'This admin account has no member card yet'),
        el('p', { class: 'faint sm' }, `Open the app signed in as ${me || 'this account'}, make your card, then come back here and switch Ghost mode on.`), open));
      return;
    }
    const toggle = sw('ghostSwitch', el('span', {}, el('b', {}, 'Ghost mode'), el('span', { class: 's', style: 'display:block' }, `${g.first_name}${g.member_no != null ? ` #${g.member_no}` : ''} · your own member card`)), g.ghost, async (on) => {
      try {
        await rpc('kr8_admin_set_ghost', { p_on: on });
        toast(on ? 'Ghost mode on · nobody can see you' : 'Ghost mode off · you are visible again', { ms: 3000 });
      } catch (e) { toast(errText(e), { ms: 4000 }); }
      await draw();
    });
    body.replaceChildren(
      el('div', { class: 'card stack', id: 'ghostCard' }, toggle,
        el('p', { class: 'faint sm', id: 'ghostState' }, g.ghost ? 'On. You can browse Reels, People, Deals, profiles and the Feed.' : 'Off. You show up like any member.')),
      el('div', { class: 'sec' }, 'While it is on'),
      el('ul', { class: 'faint sm', id: 'ghostHides', style: 'margin:0 0 14px 18px' }, ...GHOST_HIDES.map((t) => el('li', {}, t))),
      open,
      el('p', { class: 'faint xs', style: 'margin-top:10px' }, 'Likes, saves and follows made before Ghost mode was switched on stay in the totals (your name is hidden). A share link opened while signed out of Kring counts like anyone else’s.'));
  };
  await draw();
}
type PromptEv = { prompt: () => Promise<void> };
let adminInstall: PromptEv | null = null;
/** "Install Kring Admin": the browser's one-tap offer when it has one, otherwise where the menu item is. Hidden inside the installed app. */
function installAdminRow(): HTMLElement | null {
  let standalone = false;
  try { standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true; } catch { /* ignore */ }
  if (standalone) return null;
  const row = el('button', { type: 'button', class: 'li', id: 'moreInstallAdmin' }, el('span', { class: 'ic' }, ic('dl')),
    el('span', { class: 'grow' }, el('b', {}, 'Install Kring Admin'), el('span', { class: 's' }, 'Its own home-screen app, next to Kring')), ic('chev'));
  row.onclick = async () => {
    if (adminInstall) { const ev = adminInstall; adminInstall = null; try { await ev.prompt(); } catch { /* ignore */ } return; }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    toast(ios ? 'Safari: tap Share, then “Add to Home Screen”' : 'Chrome: tap ⋮ at the top right, then “Install app”', { ms: 6000 });
  };
  return row;
}
try { window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); adminInstall = e as unknown as PromptEv; }); } catch { /* not in a browser */ }

// ───────────────────────────── Problems (0063 kr8_admin_problem_log) ─────────────────────────────
const backHead = (title: string, back: string) =>
  el('div', { class: 'row', style: 'margin:6px 0 16px' }, el('a', { class: 'icb', href: back, 'aria-label': 'Back' }, ic('back')), el('h1', { style: 'font-size:26px' }, title));
const dayName = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const statTile = (n: number | string, label: string, id: string, cls = '') => el('div', { class: 'stat ' + cls, id }, el('b', {}, String(n)), el('span', {}, label));

/** The whole Problems page body for one window (exported for the preview harness and tests). */
export function problemsBlock(d: ProblemLog): HTMLElement {
  const t = d.totals;
  const funnel = el('div', { class: 'card', id: 'pbFunnel' },
    el('div', { class: 'row' }, el('b', { class: 'grow' }, 'Reel funnel'), funnelRate(t) ? pill(`${funnelRate(t)} posted`, t.posted ? 'g' : '') : null),
    el('div', { class: 'pb-fun', 'data-total': `${t.opened}/${t.picked}/${t.posted}` },
      ...([[t.opened, 'opened the Reel screen'], [t.picked, 'picked a clip'], [t.posted, 'posted']] as [number, string][]).map(([n, l], i) =>
        el('div', { class: 'pb-step' + (i === 2 && n ? ' y' : '') }, el('b', {}, String(n)), el('span', {}, l)))),
    t.pick_failed ? el('p', { class: 'sm', style: 'margin:10px 0 0;color:var(--warn)' }, `${t.pick_failed} ${t.pick_failed === 1 ? 'person' : 'people'} had a clip refused when picking`) : null,
    d.days.length > 1 || d.hours > 24 ? el('div', { class: 'pb-days' }, ...d.days.map((x) => el('div', { class: 'pb-day', 'data-day': x.day },
      el('span', { class: 'dim' }, dayName(x.day)), el('span', { class: 'grow' }, funnelLine(x)), el('span', { class: 'faint xs' }, x.reels !== x.posted ? `${x.reels} Reels` : '')))) : null,
    el('p', { class: 'faint xs', style: 'margin:10px 0 0' }, 'People, not taps. Picked = the clip got past the checks (trim step, an upload try, or posted). A short clip picked and then dropped before Post leaves no trace, so “picked” can be a little low.'));
  const groups = el('div', { class: 'card', id: 'pbGroups' }, el('b', {}, 'What went wrong'),
    ...(d.groups.length ? d.groups.map((g) => el('div', { class: 'nrow pb-g', 'data-code': `${g.kind}:${g.code ?? ''}` },
      el('div', { class: 'row pb-gh' }, el('div', { class: 'grow' },
        el('div', { class: 'xs dim' }, kindName(g.kind)),
        el('div', { class: 'pb-code' }, el('b', {}, g.code || '–'), ' = ', codeMeaning(g.kind, g.code))),
        el('span', { class: 'pill r', title: `${g.n} times` }, `${g.n}×`)),
      el('div', { class: 'faint xs', style: 'margin-top:4px' }, `${g.people} ${g.people === 1 ? 'member' : 'members'} · last ${ago(g.last_at)}${g.details?.length ? ' · ' + g.details.join(' | ') : ''}`)))
      : [el('p', { class: 'dim', style: 'margin:8px 0 0' }, 'No failures in this window.')]));
  const ags = agentsByLabel(d.agents);
  const agents = el('div', { class: 'card', id: 'pbAgents' }, el('b', {}, 'Phones and browsers'),
    ...(ags.length ? ags.map((a) => el('div', { class: 'nrow row pb-gh', 'data-ua': a.label, style: 'align-items:center' },
      el('span', { class: 'grow sm', style: 'min-width:0' }, a.label), a.inApp ? pill('in-app', 'a') : null,
      el('span', { class: 'xs ' + (a.fails ? '' : 'faint'), style: 'min-width:86px;text-align:right' + (a.fails ? ';color:var(--bad)' : '') }, a.fails ? `${a.fails} failed` : `${a.n} ok`)))
      : [el('p', { class: 'dim', style: 'margin:8px 0 0' }, 'Nothing logged yet.')]),
    el('p', { class: 'faint xs', style: 'margin:10px 0 0' }, '“In-app” = Kring opened inside LINE, Facebook, Instagram or TikTok. Chrome on Android hides the phone model, so some show “model hidden”.'));
  const rows = el('div', { class: 'card', id: 'pbRows' }, el('b', {}, `Latest ${d.rows.length}`),
    ...(d.rows.length ? d.rows.map((r) => {
      const u = uaInfo(r.ua);
      return el('div', { class: 'nrow pb-r' + (r.fail ? ' f' : ''), 'data-kind': r.kind },
        el('div', { class: 'row' }, el('b', { class: 'grow' }, `${r.first_name?.trim() || 'Signed out'}${r.member_no != null ? ` #${r.member_no}` : ''}`), el('span', { class: 'faint xs' }, bkkTime(r.at))),
        el('div', { class: 'sm' }, r.fail ? pill('failed', 'r') : pill('step'), ' ', kindName(r.kind), ': ', el('b', {}, r.code || '–'), ' = ', codeMeaning(r.kind, r.code)),
        el('div', { class: 'faint xs', style: 'margin-top:3px' }, [u.label, u.os, r.detail].filter(Boolean).join(' · ')));
    }) : [el('p', { class: 'dim', style: 'margin:8px 0 0' }, 'Nothing yet.')]));
  return el('div', { id: 'problems' },
    el('div', { class: 'stats', style: 'margin-bottom:12px' }, statTile(t.failures, 'Failures', 'pbFails', t.failures ? 'bad' : ''),
      statTile(t.failed_people, t.failed_people === 1 ? 'Member hit' : 'Members hit', 'pbPeople'), statTile(t.reels, t.reels === 1 ? 'Reel posted' : 'Reels posted', 'pbReels')),
    funnel, groups, agents, rows);
}
let pbHours = Number(LS('kr8-admin-pbh')) === 168 ? 168 : 24;
async function problemsView() {
  const body = el('div', {}, loading());
  const seg = el('div', { class: 'seg' }, ...([[24, 'Last 24 h'], [168, '7 days']] as [number, string][]).map(([h, l]) => {
    const b = el('button', { type: 'button', class: pbHours === h ? 'on' : '', id: `pb-${h}` }, l);
    b.onclick = () => { pbHours = h; LS('kr8-admin-pbh', String(h)); void problemsView(); };
    return b;
  }));
  screen('more', backHead('Problems', '#more'), el('p', { class: 'dim sm', style: 'margin:-6px 0 14px' }, 'What failed on members’ phones: Reel pick, trim, upload and face check. Test members left out.'), seg, body);
  let r: unknown;
  try { r = await rpc<unknown>('kr8_admin_problem_log', { p_hours: pbHours, p_include_test: false }); } catch (e) { body.replaceChildren(errP(e)); return; }
  if (!isProblemLog(r)) { body.replaceChildren(el('p', { class: 'err' }, 'Problems needs database update 0063.')); return; }
  body.replaceChildren(problemsBlock(r));
}

// ───────────────────────────── Recruiters (0063 kr8_admin_recruiters / kr8_admin_credit_ref) ─────────────────────────────
export type RecruitActions = { credit: (m: RecruitMember) => void; uncredit: (m: RecruitMember) => void };
function recruitMemberRow(m: RecruitMember, act: RecruitActions | null): HTMLElement {
  const how = m.how === 'link' ? pill('ref link', 'g')
    : m.how === 'credited' ? el('span', { class: 'pill p', title: 'Credited by hand' }, 'credited') : null;
  const tick = (on: boolean, yes: string, no: string) => el('span', { class: 'pill ' + (on ? 'g' : '') }, on ? '✓ ' + yes : no);
  const actBtn = !act ? null
    : m.how === 'none' ? btn('pri', [ic('plus'), 'Credit to recruiter'], () => act.credit(m), { id: 'credit-' + m.user_id, style: 'min-height:40px;padding:0 14px;margin-top:10px' })
    : m.how === 'credited' ? btn('ghost', ['Remove credit'], () => act.uncredit(m), { id: 'uncredit-' + m.user_id, style: 'min-height:36px;padding:0 12px;margin-top:8px' }) : null;
  return el('div', { class: 'nrow', 'data-rmember': m.user_id, 'data-how': m.how },
    el('div', { class: 'row' }, el('b', { class: 'grow' }, `${m.first_name?.trim() || 'No name yet'}${m.member_no != null ? ` #${m.member_no}` : ''}`), how),
    el('div', { class: 'faint xs' }, memberJoined(m.joined_at), m.src_code ? ` · src ${m.src_code}` : ''),
    m.how === 'credited' ? el('div', { class: 'xs', style: 'color:var(--pink);margin-top:2px', 'data-credit': m.credited_by || '' }, `Credited by ${m.credited_by || 'an admin'} · ${bkkTime(m.credited_at)}`) : null,
    el('div', { class: 'ml-ticks', style: 'margin-top:6px' }, tick(m.verified, 'Verified', 'Not verified'),
      tick(m.approved_reels > 0, `Paid · ${m.approved_reels} approved Reel${m.approved_reels === 1 ? '' : 's'}`, 'No approved Reel yet')),
    actBtn);
}
/** The whole Recruiters page body (exported for the preview harness and tests). act = null: read-only. */
export function recruitersBlock(d: Recruiters, act: RecruitActions | null): HTMLElement {
  const credited = d.codes.reduce((n, c) => n + c.credited, 0);
  const codes = d.codes.map((c, i) => el('details', { class: 'card', id: 'rc-' + c.code, 'data-code': c.code, open: i === 0 },
    el('summary', {}, el('span', { class: 'icb' }, ic('link')), el('div', { class: 'grow' }, el('b', {}, c.code),
      el('span', { class: 'dim sm' }, `${c.via_link} by link${c.credited ? ` · ${c.credited} credited` : ''}`)), ic('chev')),
    el('div', { class: 'in' },
      el('div', { class: 'nrow', style: 'border-top:0;padding-top:0' }, el('div', { class: 'cells', 'data-sum': `${c.signups}/${c.posted}/${c.verified}` },
        // 0111 (18 Nov): recruiters are paid per sign-up whose FIRST REEL IS APPROVED; the face check is optional (prize claims only)
        ...([[c.signups, 'Signed up'], [c.posted, 'Paid · 1st Reel approved'], [c.verified, 'Face-verified (optional)'], [c.credited, 'Credited by hand']] as [number, string][])
          .map(([n, l], k) => el('div', { class: k && n ? 'y' : '' }, el('b', {}, String(n)), el('span', {}, l))))),
      ...c.members.map((m) => recruitMemberRow(m, act)))));
  const none = el('details', { class: 'card', id: 'rcNone', open: true },
    el('summary', {}, el('span', { class: 'icb' }, ic('users')), el('div', { class: 'grow' }, el('b', {}, `Joined without a code (${d.no_code.length})`),
      el('span', { class: 'dim sm' }, 'Credit one to the recruiter who brought them')), ic('chev')),
    el('div', { class: 'in' }, ...(d.no_code.length ? d.no_code.map((m) => recruitMemberRow(m, act)) : [el('p', { class: 'dim', style: 'margin:0' }, 'Everyone has a recruiter code.')])));
  const log = el('details', { class: 'card', id: 'rcLog' },
    el('summary', {}, el('span', { class: 'icb' }, ic('hist')), el('div', { class: 'grow' }, el('b', {}, 'Credit history'), el('span', { class: 'dim sm' }, 'Who credited whom, and when')), ic('chev')),
    el('div', { class: 'in' }, ...(d.log.length ? d.log.map((l) => el('div', { class: 'nrow sm', 'data-log': l.action },
      el('div', {}, el('b', {}, l.by || 'an admin'), l.action === 'credit' ? ' credited ' : ' removed the credit of ',
        el('b', {}, `${l.first_name?.trim() || 'a member'}${l.member_no != null ? ` #${l.member_no}` : ''}`),
        ...(l.action === 'credit' ? [' to ', el('b', {}, l.ref_code || '–'), l.prev_code ? ` (was ${l.prev_code})` : ''] : [` (${l.prev_code || '–'})`])),
      el('div', { class: 'faint xs' }, bkkTime(l.at))))
      : [el('p', { class: 'dim', style: 'margin:0' }, 'No hand credits yet.')])));
  return el('div', { id: 'recruiters' },
    el('div', { class: 'stats', style: 'margin-bottom:12px' }, statTile(d.codes.length, d.codes.length === 1 ? 'Recruiter code' : 'Recruiter codes', 'rcCodes'),
      statTile(d.codes.reduce((n, c) => n + c.signups, 0), 'Signed up', 'rcSigned'), statTile(d.no_code.length, 'Without a code', 'rcNoCode', d.no_code.length ? 'warn' : '')),
    ...(d.codes.length ? codes : [empty('No recruiter codes yet', 'Members who join with ?ref= show up here.')]),
    none, log,
    el('p', { class: 'faint xs', style: 'margin:12px 4px 0' }, `Totals count the ref link OR a hand credit (${credited} by hand). A ref link is never changed. Paid = joined with the code and has at least one approved, not hidden Reel (no face check needed). Member invite Rings use the same rule.`));
}
export function creditSheet(m: RecruitMember, codes: string[], done: () => void) {
  const inp = el('input', { id: 'creditCode', autocapitalize: 'none', autocomplete: 'off', placeholder: 'recruiter code, e.g. pich', value: '' }) as HTMLInputElement;
  const out = el('div', {});
  const save = btn('pri big full', ['Credit'], undefined, { id: 'creditSave' });
  const chips = codes.length ? el('div', { class: 'ml-int', style: 'margin-top:8px' }, ...codes.map((c) => { const b = el('button', { type: 'button', class: 'pill', 'data-pick': c }, c); b.onclick = () => { inp.value = c; }; return b; })) : null;
  const s = sheet(el('h3', {}, `Credit ${m.first_name?.trim() || 'this member'}${m.member_no != null ? ` #${m.member_no}` : ''}`),
    el('p', { class: 'dim sm', style: 'margin:4px 0 12px' }, 'Joined without a ref link. Pick the recruiter who brought them. Your name and the time are saved.'),
    el('label', { class: 'f' }, 'Recruiter code', inp), chips, out, el('div', { style: 'margin-top:14px' }, save));
  save.onclick = async () => {
    const code = cleanRef(inp.value);
    if (!code) { out.replaceChildren(el('p', { class: 'err' }, 'Use 2–30 letters, numbers, - or _')); return; }
    save.disabled = true;
    try { await rpc('kr8_admin_credit_ref', { p_user: m.user_id, p_ref: code }); s.close(); toast(`${m.first_name || 'Member'} credited to ${code}`, { ms: 2500 }); done(); }
    catch (e) { save.disabled = false; out.replaceChildren(errP(e)); }
  };
}
async function recruitersView() {
  const body = el('div', {}, loading());
  screen('members', backHead('Recruiters', '#members'), el('p', { class: 'dim sm', style: 'margin:-6px 0 14px' }, 'One row per recruiter code. Test members left out.'), body);
  let r: unknown;
  try { r = await rpc<unknown>('kr8_admin_recruiters', { p_include_test: false }); } catch (e) { body.replaceChildren(errP(e)); return; }
  if (!isRecruiters(r)) { body.replaceChildren(el('p', { class: 'err' }, 'Recruiters needs database update 0063.')); return; }
  const d = r;
  const reload = () => void recruitersView();
  body.replaceChildren(recruitersBlock(d, {
    credit: (m) => creditSheet(m, d.codes.map((c) => c.code), reload),
    uncredit: async (m) => {
      if (!confirm(`Remove the hand credit of ${m.first_name || 'this member'}? It stays in the credit history.`)) return;
      try { await rpc('kr8_admin_uncredit_ref', { p_user: m.user_id }); toast('Credit removed', { ms: 2000 }); } catch (e) { toast(errText(e)); }
      reload();
    },
  }));
}

// ───────────────────────────── Same person? (0066 kr8_admin_dup_overview / dup_resolve / release / refuse) ─────────────────────────────
export type DupActions = {
  pay: (h: DupHeld) => void; refuse: (h: DupHeld, giveBack: boolean) => void;
  resolve: (c: DupCluster, keep: DupMember, action: 'hide' | 'move_reels' | 'not_same') => void;
};
function dupFace(m: DupMember, signed: Record<string, string>, keep: boolean): HTMLElement {
  const src = m.selfie_path ? signed[m.selfie_path] : null;
  return el('figure', { 'data-dup-member': m.user_id },
    src ? el('img', { src, alt: `${m.first_name} selfie` }) : m.photo ? el('img', { src: m.photo, alt: `${m.first_name} card photo` }) : el('div', { class: 'none' }, 'No selfie'),
    el('figcaption', { class: 'chip' }, keep ? 'Oldest · keep' : src ? 'Selfie' : m.photo ? 'Card photo' : ''));
}
function dupWho(m: DupMember): HTMLElement {
  const prizes = m.prizes.filter((p) => p.status !== 'cancelled');
  return el('div', { class: 'dup-who' },
    el('b', {}, `${m.first_name}${m.member_no != null ? ` #${m.member_no}` : ''}`), m.ghost ? ' ' : null, m.ghost ? pill('hidden', 'r') : null,
    el('div', { class: 'faint xs' }, `Joined ${ago(m.joined_at)} · ${m.reels} Reel${m.reels === 1 ? '' : 's'}${m.verified ? ' · verified' : ''}${m.line ? ' · LINE' : ''}`),
    prizes.length ? el('div', { class: 'xs', style: 'margin-top:3px' }, prizes.map((p) => `${prizeName(p)} ฿${p.amount} ${p.status === 'claimed' ? '(claimed)' : '(not claimed)'}`).join(' · ')) : null);
}
export function dupFlagBlock(rows: DupFlagged[]): HTMLElement | null {
  if (!rows.length) return null;
  return el('div', { class: 'card', id: 'dupFlags' }, el('b', {}, 'Flags on paid claims (30 days)'),
    el('p', { class: 'faint xs', style: 'margin:4px 0 8px' }, 'These were paid normally. A flag alone never holds a claim or removes Rings.'),
    ...rows.map((f) => el('div', { class: 'nrow', 'data-flag': f.claim_id },
      el('div', { class: 'row' }, el('b', { class: 'grow' }, `${f.first_name ?? 'Deleted account'}${f.member_no != null ? ` #${f.member_no}` : ''} · ${f.brand === 'truemoney' ? 'TrueMoney' : f.brand === 'grab' ? 'Grab' : f.brand} ฿${f.amount}`), el('span', { class: 'faint xs' }, ago(f.created_at))),
      el('div', { class: 'sm', style: 'margin-top:3px' }, flagText(f)))));
}
export function dupBlock(clusters: DupCluster[], signed: Record<string, string>, act: DupActions | null): HTMLElement {
  if (!clusters.length) return el('div', { class: 'card empty', id: 'dupEmpty' }, el('b', {}, 'Nobody to check'), 'No linked accounts and no held claims.');
  return el('div', { id: 'dups' }, ...clusters.map((c) => {
    const keep = c.members[0];
    const byId = new Map(c.members.map((m) => [m.user_id, m]));
    const nm = (id: string) => { const m = byId.get(id); return m ? `${m.first_name}${m.member_no != null ? ` #${m.member_no}` : ''}` : 'member'; };
    const faceLink = c.links.find((l) => l.reason === 'face') || c.links.find((l) => l.reason === 'face_maybe');
    return el('div', { class: 'card dup', 'data-cluster': c.key },
      el('div', { class: 'row' }, el('b', { class: 'grow' }, c.members.length > 1 ? (c.reasons.some(isLinkReason) ? `Same person? · ${c.members.length} accounts` : `Same Wi-Fi only · ${c.members.length} accounts`) : 'Held claim'),
        ...c.reasons.map((r) => pill(REASON_LABEL[r], isLinkReason(r) ? 'r' : 'a'))),
      el('div', { class: 'pair dup-faces' + (c.members.length > 2 ? ' three' : '') }, ...c.members.slice(0, 3).map((m, i) => dupFace(m, signed, i === 0 && c.members.length > 1))),
      faceLink?.detail?.aws_sim != null ? el('p', { class: 'sm', style: 'margin:0 0 8px' }, `Faces ${Math.round(faceLink.detail.aws_sim)}% alike (AWS)`) : null,
      el('div', { class: 'dup-list' }, ...c.members.map(dupWho)),
      c.links.length ? el('div', { class: 'dup-why' }, el('div', { class: 'xs dim' }, 'Why they are linked'),
        ...c.links.map((l) => el('div', { class: 'sm' }, `${nm(l.a)} ↔ ${nm(l.b)}: ${linkText(l)}${isLinkReason(l.reason) ? '' : ' · often friends, not proof'}`))) : null,
      c.mutual.length ? el('div', { class: 'dup-why' }, el('div', { class: 'xs dim' }, 'Likes and saves between them (not counted for Rings)'),
        ...c.mutual.map((x) => el('div', { class: 'sm' }, `${nm(x.from)} → ${nm(x.to)}’s Reels: ${x.likes} like${x.likes === 1 ? '' : 's'}, ${x.saves} save${x.saves === 1 ? '' : 's'}`))) : null,
      ...c.held.map((h) => el('div', { class: 'dup-held', 'data-held': h.claim_id },
        el('div', { class: 'row' }, el('b', { class: 'grow' }, `${nm(h.user_id)} claimed ${prizeName({ ...h, kind: h.prize_kind })} · ${h.brand === 'truemoney' ? 'TrueMoney' : h.brand === 'grab' ? 'Grab' : h.brand} ฿${h.amount}`), pill('held', 'warn')),
        el('div', { class: 'sm', style: 'margin:4px 0 10px' }, `${holdLines({ user_id: h.user_id, hold_reason: h.reason, hold_review: h.detail?.review,
          hold_others: (h.detail?.others || []).map((o) => ({ ...o, member_no: o.member_no, first_name: o.first_name, reasons: o.reasons })) }).join(' · ')} · ${ago(h.created_at)}`),
        act ? el('div', { class: 'two' },
          btn('bad', [ic('x'), 'Refuse'], () => act.refuse(h, false), { id: 'dupRefuse-' + h.claim_id }),
          btn('go', [ic('check'), 'Pay'], () => act.pay(h), { id: 'dupPay-' + h.claim_id })) : null,
        act ? btn('ghost', ['Refuse, let them claim again later'], () => act.refuse(h, true), { id: 'dupReturn-' + h.claim_id, style: 'margin-top:8px;width:100%' }) : null)),
      act && c.members.length > 1 ? el('div', { class: 'dup-acts' },
        el('div', { class: 'xs dim', style: 'margin:12px 0 6px' }, `Keep the oldest (${nm(keep.user_id)}), then:`),
        el('div', { class: 'two' },
          btn('ghost', [ic('reel'), 'Move Reels to oldest'], () => act.resolve(c, keep, 'move_reels'), { id: 'dupMove-' + keep.user_id }),
          btn('bad', [ic('eyeoff'), 'Hide others'], () => act.resolve(c, keep, 'hide'), { id: 'dupHide-' + keep.user_id })),
        btn('ghost', ['Not the same person'], () => act.resolve(c, keep, 'not_same'), { id: 'dupNotSame-' + keep.user_id, style: 'margin-top:8px;width:100%' })) : null);
  }));
}
async function dupsView() {
  const body = el('div', {}, loading());
  screen('more', backHead('Same person?', '#more'),
    el('p', { class: 'dim sm', style: 'margin:-6px 0 14px' }, 'Accounts with the same face (AWS) or the same phone: their likes and saves don’t count for Rings, and their claims wait for you. Same Wi-Fi or LINE alone is often friends.'), body);
  let ov: unknown;
  try { ov = await rpc<unknown>('kr8_admin_dup_overview'); } catch (e) { body.replaceChildren(errP(e)); return; }
  if (!isDupOverview(ov)) { body.replaceChildren(el('p', { class: 'err' }, 'Same person? needs database update 0066.')); return; }
  // 19 Nov: links made by the retired on-phone face checker are not evidence any more (AWS look-alikes and same phone stay)
  ov.links = ov.links.filter((l) => !isRetiredFaceLink(l));
  const clusters = buildClusters(ov);
  const paths = clusters.flatMap((c) => c.members.map((m) => m.selfie_path)).filter((x): x is string => !!x);
  let signed: Record<string, string> = {};
  if (paths.length) { const { data } = await (await v5Client()).storage.from('kr8-verify').createSignedUrls([...new Set(paths)], 600); for (const d of data || []) if (d.path && d.signedUrl) signed[d.path] = d.signedUrl; }
  const again = () => void dupsView();
  // 17 Nov (founder): no "Backfill face codes" button. It made codes for older members who never agreed to a card-photo / selfie
  // face code (consent face-2026-11-10). Codes now come only from members who agreed (face-2026-11-17c); the server refuses the rest.
  body.replaceChildren(dupFlagBlock(ov.flagged || []) || '', dupBlock(clusters, signed, {
    pay: async (h) => { try { await rpc('kr8_admin_release_claim', { p_claim: h.claim_id }); toast('Paid · the code goes out now (if in stock)', { ms: 3000 }); again(); } catch (e) { toast(errText(e), { ms: 6000 }); } },
    refuse: (h, giveBack) => rejectSheet(giveBack ? 'Refuse this claim for now' : 'Refuse and cancel the prize',
      giveBack ? 'The prize goes back to “Claim”. Nothing is paid.' : 'The prize is cancelled. Nothing is paid. The member is not told why.',
      DUP_CHIPS, 'dupRefuse', (why) => rpc('kr8_admin_refuse_claim', { p_claim: h.claim_id, p_reason: why, p_return: giveBack }), again,
      { cta: giveBack ? 'Refuse · they can claim again' : 'Refuse · cancel the prize', done: 'Refused', label: 'Reason (for the record)',
        ready: giveBack ? DUP_CHIPS[1][1] : DUP_CHIPS[0][1] }),
    resolve: async (c, keep, action) => {
      const others = c.members.filter((m) => m.user_id !== keep.user_id).map((m) => m.user_id);
      const msg = action === 'hide' ? `Hide ${others.length} account${others.length === 1 ? '' : 's'}? Their Reels are hidden, unclaimed prizes cancelled, held claims refused.`
        : action === 'move_reels' ? `Move their Reels to ${keep.first_name}?` : 'Mark these accounts as different people? Their likes count again.';
      if (!window.confirm(msg)) return;
      try { const r = await rpc<{ n: number }>('kr8_admin_dup_resolve', { p_keep: keep.user_id, p_others: others, p_action: action }); toast(`Done · ${r.n}`, { ms: 2500 }); again(); }
      catch (e) { toast(errText(e), { ms: 6000 }); }
    },
  }));
}

// ───────────────────────────── Approve week (0066 kr8_admin_week_review / approve_week) ─────────────────────────────
export function weekBlock(r: WeekReview, onApprove: (() => void) | null, now = Date.now()): HTMLElement {
  if (!r.week) return el('div', { class: 'lt-empty', id: 'weekEmpty' }, el('b', {}, 'No week closed yet'), el('small', {}, 'The first week closes Monday 24 Nov, 00:00 Bangkok.'));
  const opens = r.opens_at ? Date.parse(r.opens_at) : 0;
  const state = r.approved_at ? `Approved ${istWhen(r.approved_at)} · prizes are open` : opens > now ? `Prizes open by themselves ${istWhen(r.opens_at!)} (24 h after the close) unless you approve first` : `Opened by itself ${istWhen(r.opens_at!)}`;
  const flagged = r.rows.filter((x) => weekFlags(x, now).length).length;
  // 18 Nov declutter: one state line (the rule behind ⓘ), ONE button, then the Top 8 as a list; each row's flags open on tap
  return el('div', { id: 'weekReview' },
    el('div', { class: 'lt-statusline', id: 'weekState' }, el('span', { class: `v2dot2 ${r.approved_at || opens <= now ? 'g' : 'a'}` }),
      el('div', { class: 'grow' }, el('b', {}, `Week ${weekRange(r.week)}`), el('small', {}, r.approved_at || opens <= now ? 'Prizes are open' : `${flagged} of ${r.rows.length} with a flag · checking`)),
      info(state)),
    onApprove && !r.approved_at && opens > now ? btn('pri big full', [ic('check'), 'Approve · open the prizes'], onApprove, { id: 'weekApprove', style: 'margin:4px 0 14px' }) : null,
    el('div', { class: 'lt-list', id: 'weekRows' },
      ...r.rows.map((x: WeekRow) => {
        const flags = weekFlags(x, now);
        const bad = flags.some((f) => /^Same (face|phone)/.test(f));
        const head = el('div', { class: 'row', style: 'gap:10px' }, el('span', { class: 'wk-rk' }, `#${x.rank}`),
          x.photo ? el('img', { class: 'wk-av', src: x.photo, alt: '' }) : el('span', { class: 'wk-av' }),
          el('span', { class: 'grow' }, el('b', {}, `${x.first_name}${x.member_no != null ? ` #${x.member_no}` : ''}`),
            el('div', { class: 'faint xs' }, `${x.rings} Rings${x.prize ? ` · ฿${x.prize.amount.toLocaleString('en-US')} ${x.prize.status === 'claimed' ? 'claimed' : 'unclaimed'}` : ' · no prize'}`)),
          flags.length ? pill(`${flags.length} flag${flags.length === 1 ? '' : 's'}`, bad ? 'r' : 'a') : pill('ok', 'g'));
        return flags.length
          ? el('details', { class: 'nrow wk-r v2fold', 'data-rank': String(x.rank) }, el('summary', {}, head), el('ul', { class: 'wk-flags' }, ...flags.map((f) => el('li', { class: /^Same (face|phone)/.test(f) ? 'bad' : '' }, f))))
          : el('div', { class: 'nrow wk-r', 'data-rank': String(x.rank) }, head);
      })));
}
async function weekView() {
  const body = el('div', {}, loading());
  screen('more', el('div', { class: 'row', style: 'margin:6px 0 16px' }, el('a', { class: 'icb', href: '#more', 'aria-label': 'Back' }, ic('back')), el('h1', { style: 'font-size:26px' }, 'Approve week'),
    info('Weekly prizes open for claiming when you approve, or by themselves 24 h after the week closes. Linked accounts: More → Same person?')), body);
  let r: unknown;
  try { r = await rpc<unknown>('kr8_admin_week_review', { p_week: null }); } catch (e) { body.replaceChildren(errP(e)); return; }
  if (!isWeekReview(r)) { body.replaceChildren(el('p', { class: 'err' }, 'Approve week needs database update 0066.')); return; }
  const wr = r;
  body.replaceChildren(weekBlock(wr, async () => {
    try { await rpc('kr8_admin_approve_week', { p_week: wr.week }); toast('Week approved · prizes open', { ms: 3000 }); void weekView(); } catch (e) { toast(errText(e), { ms: 6000 }); }
  }));
}

// ───────────────────────────── router ─────────────────────────────
function route() {
  flushWrite();
  toastEl?.remove(); toastEl = null;
  document.querySelectorAll('.scrim').forEach((n) => n.remove());
  v2Flush();
  const h = decodeURIComponent(location.hash.replace(/^#/, '')) || 'growth';   // 18 Nov: admin opens on Growth
  const [a, b, c] = h.split('/');
  if (v2Route(a, b, c)) return;   // admin v2 screens (adminV2.ts) · #x/<kind>/<id> = who-and-why sheet (18 Nov)
  if (a === 'q') {
    if (b === 'reels') return void reelQueue();
    if (b === 'faces') return void faceQueue();
    if (b === 'reports') return void reportQueue();
    if (b === 'replies') return void replyQueue();
    if (b === 'venues') return void venueQueue();
  }
  if (a === 'facelog') return void faceLogView();
  if (a === 'members') return void membersView(b === 'all');
  if (a === 'top5') return void top5View();
  if (a === 'listings') return void listingsView();
  if (a === 'more') return moreView();
  if (a === 'rules') return rulesView();
  if (a === 'codes') return void codesView();
  if (a === 'post') return postView();
  if (a === 'push') return void pushView();
  if (a === 'ghost') return void ghostView();
  if (a === 'problems') return void problemsView();
  if (a === 'recruiters') return void recruitersView();
  if (a === 'dups') return void dupsView();
  if (a === 'week') return void weekView();
  if (a === 'reddit') return redditView();
  if (a === 'history') return void historyView(b || 'reels');
  if (a === 'venue' && b) return void venueDetail(b);
  if (a === 'listing') {
    if (b === 'new') return listingStepper({ kind: 'stay', booking_kind: 'line_oa', area: 'Bangkok' }, false);
    if (b === 'edit' && c) { const l = listingCache.find((x) => x.id === c); if (l) return listingStepper(l, true); return void rpc<Listing[]>('kr8_admin_listings').then((rows) => { listingCache = rows; const x = rows.find((y) => y.id === c); if (x) listingStepper(x, true); else location.hash = '#listings'; }); }
  }
  if (a === 'todo') counts = null;
  void todoView();
}

async function boot() {
  const c = await v5Client();
  const { data } = await c.auth.getSession();
  if (!data.session) return signIn();
  const isAdmin = await rpc<boolean>('kr8_is_admin').catch(() => false);
  if (!isAdmin) return signIn('This account is not an admin');
  // 0194: this phone belongs to an admin, so its visits never count in Growth (past and future); same visit id as the site counter
  try {
    let vid = localStorage.getItem('kr_vid');
    if (!vid || !/^[a-z0-9]{4,40}$/.test(vid)) { vid = (Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8)) || 'x'; localStorage.setItem('kr_vid', vid); }
    void rpc('kr8_staff_device', { p_vid: vid }).catch(() => undefined);
  } catch { /* private mode: nothing to mark */ }
  me = data.session.user?.email || '';
  window.onhashchange = route;
  route();
}

export function start() { void boot(); }
