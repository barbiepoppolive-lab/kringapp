/**
 * Kring admin v2 (17 Nov): Today · Needs you · People · Money · More (Board, Activity log, all old tools).
 * 18 Nov (0113): Growth is the first tab and the page admin opens on; Board moved into More (dock stays at 5).
 * One snapshot (0082 kr8_admin_v2_snapshot) feeds every screen, refreshed every 30 s ("updated 12s ago").
 * Real members only by default; "Show test rows" includes test / demo / Kring Team / ghost / admin sign-ins.
 * Reads only through 0082. Writes only through the existing admin RPCs, sent 5 s later so every tap has Undo.
 */
import { el, rpc, v5Client } from './shared';
import { signReelPaths } from '../v8/v5Reel';
import {
  ago, both, buildInbox, buildRobotReport, claimChip, clock, filterPeople, groupPeople, isSnapshot, money, noCard, peopleCounts, peopleHeadline,
  personFlags, personTrust, placeFlags, realPhoto, referrers, stepChip, who, withAdminLogins, faceStatusWords, liveSteps,
  INBOX_FILTERS, waitShort, moneyRobotVerdict, type Handled,
  type Claim, type DupAuto, type FaceCheck, type InboxItem, type PeopleExtra, type Person, type PeopleFilter, type PlaceAuto, type PlaceRow, type Snapshot, type Trust,
} from './adminV2Logic';
import {
  aiRulesFallback, capStatus, computeVoucherRunway, DEFAULT_VOUCHER_BUY_URL, fallbackAiSlotStatus, fallbackAutopilotState,
  fallbackGrowthNudgesPreview, fallbackHealthWatch, fallbackProtectOverview, fallbackSelfFixStatus, flagKeyLabel,
  formatRobotLogLine, guardAiPayload, heartbeatSummary, isAiSlotStatus, isAutopilotState, isGrowthNudgesPreview,
  isHealthWatchReport, isMorningBriefData, isProtectOverview, isSelfFixStatus, modeLabel, modeTone, scheduleWords,
  severityMeta, sortRobotAlerts, synthesizeMorningBrief,
  type AiSlotStatus, type AutopilotState, type GrowthNudgesPreview, type HealthWatchReport, type MorningBriefData,
  type ProtectOverview, type RobotAlert, type RobotLogRow, type RobotMode, type RobotRow, type SelfFixStatus,
} from './autopilotLogic';
import { addDays, bkkToday, clampDay, countryName, dailyRange, dayName, flag, groupSources, isGrowth, isGrowthDaily, isGrowthDay, refLabel, seriesEnds, sparkPath, stepPct, trendWords, visibleRefs,
  type Growth, type GrowthDailyRow, type GrowthDay, type GrowthDays } from './growthLogic';
import './adminV2.css';
import { closeSheet, openSheet, sheetOpen, sheetRoute, xbtn, xlink, xrow, xsec, type SheetSpec, type SheetWho } from './adminSheet';
import { alertSheetKind, alertUser, detailLines, flagSentence, flagWhy, giveWhy, isEx, linkVerdict, openWhy, ringsSentence, ringsSummary, selfieWords, trustWords, verdictSentence,
  type ExClaim, type ExCodes, type ExErrors, type ExPlace, type ExReel, type ExRings } from './tapLogic';
import { codeMeaning, kindName, uaInfo } from './problemsAdmin';
import { helpSection } from './adminHelp';   // 0097: Help cases (self-contained)
import { helpPanelLeave, helpPanelView } from './helpPanel';   // 0120: full Help panel (#help, #help/<uid>)
import { bugSection, viewAsLeave, viewAsView } from './viewAs';   // 0110: View as member + Spot a bug cases
import { farmAlertList, farmBoardMark, farmSection } from './farmCheck';   // 0123: Ring-farming check (self-contained)

type Kid = Node | string | null | undefined | false;
const app = () => document.getElementById('app')!;
const LS = (k: string, v?: string): string | null => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* private mode */ } return null; };

// ───────── icons ─────────
const P: Record<string, string> = {
  today: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  growth: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h5l1.5 3h5L16 13h5"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M17 14.5c2.4.2 4 1.8 4.5 4.5"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v5M17.5 9.5v5"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  chev: '<path d="M9 5l7 7-7 7"/>', back: '<path d="M15 5l-7 7 7 7"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8 20h8M9.5 17h5"/>',
  log: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4v4.5H8"/><path d="M12 8v4l3 2"/>', check: '<path d="M4.5 12.5l5 5 10-11"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>', robot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/>',
  face: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M9 10h.01M15 10h.01M9 15c1.7 1.3 4.3 1.3 6 0"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  reel: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M10 9.5v5l4-2.5z"/>',
  send: '<path d="M21 3L3 10.5l7 2.5 2.5 7z"/><path d="M10 13l5-5"/>',
};
function ic(name: string): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = P[name] || ''; return s;
}
const chip = (text: string, tone = '') => el('span', { class: `v2chip ${tone}` }, text);

// ───────── Kring Light declutter (18 Nov): fold rows, ⓘ notes, one primary button ─────────
/** One WhatsApp-style row that opens to show the detail. The detail stays in the page (closed), so every action still works. */
function fold(id: string | undefined, head: Kid[], kids: Kid[], tone = ''): HTMLDetailsElement {
  return el('details', { class: `v2fold ${tone}`, id }, el('summary', {}, ...head, el('span', { class: 'v2fold-x', 'aria-hidden': 'true' })), el('div', { class: 'v2fold-in' }, ...kids));
}
const foldHead = (title: string, sub?: string, dot = ''): Kid[] => [dot ? el('span', { class: `v2dot2 ${dot}` }) : null, el('b', { class: 'grow' }, title), sub ? el('small', {}, sub) : null];
/** ⓘ: rules, dates and technical notes live behind this, in small grey text */
export function info(text: Kid, id?: string): HTMLElement {
  return el('details', { class: 'v2i', id }, el('summary', { 'aria-label': 'More info' }, 'i'), el('div', { class: 'v2i-tip' }, text));
}

// ───────── data: one snapshot, polled ─────────
let snap: Snapshot | null = null;
let morningCache: MorningBriefData | null = null;
let snapAt = 0;
let loadingSnap: Promise<Snapshot | null> | null = null;
let includeTest = LS('kr8-v2-test') === '1';
const photos = new Map<string, string>();
let pollTimer = 0; let tickTimer = 0;
let rerender: (() => void) | null = null;
/** Items the founder just acted on: hidden at once, written after 5 s unless Undo. */
const hiddenKeys = new Set<string>();

export async function loadSnapshot(force = false): Promise<Snapshot | null> {
  if (!force && snap && Date.now() - snapAt < 25_000) return snap;
  if (loadingSnap) return loadingSnap;
  // 0086: the place robot's decisions ride along (an empty list before 0086, so the snapshot never fails because of it)
  const auto = rpc<PlaceAuto[]>('kr8_admin_places_auto', { p_days: 7 }).catch(() => [] as PlaceAuto[]);
  // 0087: real-photo flag, step inputs, Removed list and the one set of counts (null before 0087: the panel falls back)
  const extra = rpc<PeopleExtra>('kr8_admin_v2_people_extra').catch(() => null);
  // 0095: duplicate robot actions (embedded in 0095 snapshot, or fetched alongside if needed)
  const dups = rpc<DupAuto[]>('kr8_admin_dups_auto', { p_days: 14 }).catch(() => null);
  // 0099 M2: Morning Brief + unified Alert Centre (falls back to client synthesis before 0099 is applied)
  const mb = rpc<unknown>('kr8_admin_morning_brief', { p_include_test: includeTest }).catch(() => null);
  loadingSnap = Promise.all([rpc<unknown>('kr8_admin_v2_snapshot', { p_include_test: includeTest }), auto, extra, dups, mb])
    .then(([s, pa, ex, da, mbRaw]) => {
      if (!isSnapshot(s)) throw new Error('Admin v2 needs database update 0082');
      s.places_auto = Array.isArray(pa) ? pa : [];
      if (ex && ex.counts && ex.rows) s.extra = ex;
      if (!Array.isArray(s.dups_auto) && Array.isArray(da)) s.dups_auto = da;
      snap = withAdminLogins(s);
      morningCache = isMorningBriefData(mbRaw) ? mbRaw : synthesizeMorningBrief(snap);
      snapAt = Date.now();
      return snap;
    })
    .finally(() => { loadingSnap = null; });
  return loadingSnap;
}
async function loadPhotos(ids: string[]) {
  const need = ids.filter((id) => !photos.has(id)).slice(0, 80);
  if (!need.length) return;
  const got = await rpc<Record<string, string>>('kr8_admin_v2_photos', { p_users: need }).catch(() => ({} as Record<string, string>));
  for (const id of need) photos.set(id, got[id] || '');
}
function startPolling(render: () => void) {
  rerender = render;
  clearInterval(pollTimer); clearInterval(tickTimer);
  pollTimer = window.setInterval(() => { if (document.visibilityState === 'visible' && !document.querySelector('.v2sheet')) void loadSnapshot(true).then(() => rerender?.()).catch(() => undefined); }, 30_000);
  tickTimer = window.setInterval(() => { const n = document.getElementById('v2Fresh'); if (n && snap) n.textContent = `Updated ${ago(new Date(snapAt).toISOString())}`; }, 1000);
}
export function stopV2() { clearInterval(pollTimer); clearInterval(tickTimer); rerender = null; }

// ───────── undo writes ─────────
let pending: { run: () => Promise<unknown>; timer: number; key: string } | null = null;
function flush() {
  if (!pending) return;
  const p = pending; pending = null; clearTimeout(p.timer);
  void p.run().then(() => loadSnapshot(true)).then(() => { hiddenKeys.delete(p.key); rerender?.(); })
    .catch((e) => { hiddenKeys.delete(p.key); toast(`Did not save: ${(e as Error).message}`); rerender?.(); });
}
window.addEventListener('pagehide', flush);
function later(key: string, label: string, run: () => Promise<unknown>) {
  flush();
  hiddenKeys.add(key);
  pending = { run, key, timer: window.setTimeout(flush, 5000) };
  toast(label, () => { if (pending?.key === key) { clearTimeout(pending.timer); pending = null; } hiddenKeys.delete(key); rerender?.(); });
  // a finished card slides away, then the list (and the counter) re-renders
  const card = document.querySelector<HTMLElement>(`[data-item="${CSS.escape(key)}"]`);
  if (card) { card.classList.add('v2slide'); window.setTimeout(() => rerender?.(), 260); } else rerender?.();
}
function toast(text: string, undo?: () => void) {
  document.getElementById('v2Toast')?.remove();
  const t = el('div', { class: 'v2toast', id: 'v2Toast', role: 'status' }, el('span', {}, text));
  if (undo) { const u = el('button', { type: 'button', id: 'v2Undo' }, 'Undo'); u.onclick = () => { t.remove(); undo(); }; t.append(u); }
  t.append(el('i', {}));
  document.body.append(t);
  setTimeout(() => t.remove(), 5000);
}

// ───────── shell ─────────
export type V2Tab = 'growth' | 'today' | 'inbox' | 'people' | 'board' | 'money' | 'more';
/** 0097: members waiting in Help also count in the Needs you badge (last known count, refreshed by helpSection) */
let helpWaiting = 0;
let bugsWaiting = 0;   // 0110: open "Spot a bug" cases also count in the Needs you badge
function decisionsCount(): number { return snap ? buildInbox(snap).items.filter((i) => !hiddenKeys.has(i.key)).length : 0; }
function setBugsWaiting(n: number) { const was = bugsWaiting; bugsWaiting = n; setHelpWaiting(helpWaiting); if (was !== n && location.hash === '#inbox') rerender?.(); }
function setHelpWaiting(n: number) {
  helpWaiting = n;
  const total = decisionsCount() + helpWaiting + bugsWaiting;
  const tab = document.getElementById('tab-inbox');
  let b = document.getElementById('inboxBadge');
  if (!total) { b?.remove(); return; }
  if (!b && tab) { b = el('span', { class: 'bdg', id: 'inboxBadge' }); tab.append(b); }
  if (b) b.textContent = String(total);
}
export function v2Tabbar(active: V2Tab): HTMLElement {
  const n = decisionsCount() + helpWaiting + bugsWaiting;
  // 18 Nov (0113): Growth first (the page admin opens on); Board lives in More so the dock stays at 5
  const items: [V2Tab, string, string, string][] = [['growth', 'growth', 'Growth', '#growth'], ['today', 'today', 'Today', '#today'], ['inbox', 'inbox', 'Needs you', '#inbox'],
    ['people', 'people', 'People', '#people'], ['more', 'more', 'More', '#more']];
  const on = active === 'money' || active === 'board' ? 'more' : active;
  return el('div', { class: 'tabbar v2bar' }, el('nav', {}, ...items.map(([k, i, label, href]) =>
    el('a', { href, class: k === on ? 'on' : '', id: 'tab-' + k, 'aria-current': k === on ? 'page' : undefined },
      ic(i), label, k === 'inbox' && n ? el('span', { class: 'bdg', id: 'inboxBadge' }, String(n)) : null))));
}
function screen(active: V2Tab, ...kids: Kid[]): HTMLElement {
  const s = el('div', { class: 'scr v2' }, ...kids);
  app().replaceChildren(s, v2Tabbar(active));
  return s;
}
function header(title: string, sub?: Kid, back?: string): HTMLElement {
  const fresh = el('button', { type: 'button', class: 'v2fresh', id: 'v2Fresh', title: 'Tap to refresh now' }, snap ? `Updated ${ago(new Date(snapAt).toISOString())}` : 'Loading…');
  fresh.onclick = () => { fresh.textContent = 'Refreshing…'; void loadSnapshot(true).then(() => rerender?.()).catch((e) => toast(String((e as Error).message))); };
  return el('header', { class: 'v2hd' },
    back ? el('a', { class: 'v2back', href: back, 'aria-label': 'Back' }, ic('back')) : el('span', { class: 'v2dot' }),
    el('div', { class: 'grow' }, el('h1', {}, title), sub ? el('div', { class: 'v2sub' }, sub) : null), fresh);
}
function testToggle(): HTMLElement {
  const inp = el('input', { type: 'checkbox', id: 'v2TestToggle', checked: includeTest });
  inp.onchange = () => { includeTest = inp.checked; LS('kr8-v2-test', includeTest ? '1' : '0'); void loadSnapshot(true).then(() => rerender?.()); };
  return el('label', { class: 'v2toggle' }, el('span', {}, 'Show test rows'), inp, el('i', {}));
}
const loadingCard = () => el('div', { class: 'v2card v2load' }, 'Loading…');
const errorCard = (e: unknown) => el('div', { class: 'v2card v2err' }, el('b', {}, 'Could not load'), el('div', { class: 'v2sub' }, String((e as Error)?.message || e)));
function avatar(p: { user_id: string | null; name?: string | null }, size = 44): HTMLElement {
  const src = p.user_id ? photos.get(p.user_id) : '';
  return src ? el('img', { class: 'v2av', src, alt: '', style: `width:${size}px;height:${size}px` })
    : el('span', { class: 'v2av none', style: `width:${size}px;height:${size}px` }, (p.name || '?').slice(0, 1));
}
const personLink = (p: Person | { user_id: string | null; no: number | null; name: string | null }) => p.user_id ? `#m/${p.user_id}` : '#people';

async function withSnap(active: V2Tab, render: (s: Snapshot) => void, head: HTMLElement) {
  const body = el('div', {}, loadingCard());
  screen(active, head, body);
  const go = () => { if (!snap) return; render(snap); app().querySelector('.v2bar')?.replaceWith(v2Tabbar(active)); };
  startPolling(go);
  try { await loadSnapshot(); go(); } catch (e) { body.replaceChildren(errorCard(e)); }
}

// ───────── Today ─────────
/** "2 days 4 h" until Sunday 23:59 Bangkok (the board week ends then). */
function weekLeft(s: Snapshot): string {
  const end = Date.parse(s.board.week_start) + 7 * 864e5 - 60e3;
  const h = Math.max(0, Math.round((end - Date.now()) / 36e5));
  return h >= 24 ? `in ${Math.floor(h / 24)} d ${h % 24} h` : `in ${h} h`;
}
/** The next step a member has not done yet: photo → Reel → face → prize. */
function nextStep(p: Person, s: Snapshot): string {
  const st: [string, boolean][] = [['photo', realPhoto(p, s)], ['Reel', (p.reels?.live || 0) + (p.reels?.waiting || 0) > 0], ['face check', p.verified === true], ['prize', (p.claims?.paid || 0) > 0]];
  const n = st.find(([, ok]) => !ok);
  return n ? `next: ${n[0]}` : 'all 4 steps done';
}
/** ONE brief (18 Nov declutter): 3 numbers + "3 things need you". The other numbers, the funnel and the robot notes sit one tap away. */
function renderMorningBrief(s: Snapshot, inboxItems: InboxItem[], extra: Kid[] = []): HTMLElement {
  const mb = morningCache || synthesizeMorningBrief(s, { items: inboxItems });
  const b = mb.brief;
  const runway = computeVoucherRunway(b.voucher_stock.available, b.voucher_stock.burn_7d);
  const daysStr = b.voucher_stock.days_left === null ? 'Steady' : `${b.voucher_stock.days_left}d left`;

  // 18 Nov tap-all: each number opens the exact list behind it (a filtered page or a sheet)
  const stat = (id: string, val: string, label: string, sub: string, href: string, hot = false, sheet?: () => void) => {
    const a = el('a', { class: `mb-stat ${hot ? 'hot' : ''}`, href, id },
      el('b', {}, val),
      el('span', {}, label),
      el('small', {}, sub));
    return sheet ? tapIn(a, sheet) : a;
  };
  const caseHref = (t: { href: string; title: string }) => {
    if (t.href !== '#inbox') return t.href;
    const hit = inboxItems.find((i) => i.title === t.title);
    if (hit) return `#inbox/case/${encodeURIComponent(hit.key)}`;
    return /held payout/i.test(t.title) ? '#inbox/held' : t.href;
  };

  const top3 = b.top3_needs_you.slice(0, 3);
  const errN = b.errors.total;

  return el('section', { class: 'mb-card lt-brief', id: 'v2MorningBrief' },
    el('div', { class: 'mb-grid' },
      stat('mbMembers', `+${b.new_members.today}`, 'New today', `${b.new_members.total} real total`, '#people/today'),
      stat('mbHeld', `฿${b.held_payouts.thb.toLocaleString('en-US')}`, 'Held', `${b.held_payouts.count} waiting`, '#inbox/held', b.held_payouts.count > 0),
      stat('mbStock', daysStr, 'Codes', `${b.voucher_stock.available} left`, '#money', runway.hot, () => openStockSheet())),
    el('div', { class: 'mb-top3', id: 'v2BriefTop3' },
      el('div', { class: 'mb-top3-hd' }, top3.length ? `${top3.length} thing${top3.length === 1 ? '' : 's'} need${top3.length === 1 ? 's' : ''} you` : 'Nothing urgent'),
      ...(top3.length
        ? top3.map((t, idx) => el('a', { class: `mb-need sev-${t.severity}`, href: caseHref(t), title: t.sub || undefined },
            el('span', { class: 'mb-num' }, String(idx + 1)),
            el('b', { class: 'grow' }, t.title),
            ic('chev')))
        : [el('div', { class: 'mb-clear' }, 'Robots are watching everything.')])),
    fold('v2MoreNums', foldHead('More numbers'), [
      el('div', { class: 'mb-grid' },
        stat('mbFaces', String(b.face_checks.today), 'Face checks', `${b.face_checks.pass} pass · ${b.face_checks.waiting} waiting`, b.face_checks.waiting > 0 ? '#inbox/check' : '#faces', b.face_checks.waiting > 0),
        stat('mbPosts', String(b.posts.reels_today + b.posts.asks_today), 'Posts today', `${b.posts.reels_live} live · ${b.posts.reels_waiting} waiting`, b.posts.reels_waiting > 0 ? '#inbox/reel' : '#people', b.posts.reels_waiting > 0),
        stat('mbErrors', String(errN), 'Errors (24h)', `${b.errors.client_24h} phone · ${b.errors.outbox_failed_24h + b.errors.robot_failed_24h} sys`, '#problems', errN > 0)),
      ...extra]));
}

function renderAlertCentre(s: Snapshot, inboxItems: InboxItem[]): HTMLElement {
  const mb = morningCache || synthesizeMorningBrief(s, { items: inboxItems });
  const visible = sortRobotAlerts(mb.alerts).filter((a) => !hiddenKeys.has('alert:' + a.id));
  const redN = visible.filter((a) => a.severity === 'red').length;
  const ambN = visible.filter((a) => a.severity === 'amber').length;
  const gryN = visible.filter((a) => a.severity === 'grey').length;

  const row = (a: RobotAlert): HTMLElement => {
    const meta = severityMeta(a.severity);
    const key = 'alert:' + a.id;
    const dismissBtn = !a.synthetic
      ? el('button', { type: 'button', class: 'ap-mini-btn', id: 'alertDismiss-' + a.id }, 'Dismiss')
      : null;
    if (dismissBtn) {
      dismissBtn.onclick = () => later(key, `Alert dismissed: ${a.title}`, async () => {
        await rpc('kr8_admin_alert_dismiss', { p_id: a.id });
      });
    }
    const buyUrl = typeof a.detail?.buy_url === 'string' && a.detail.buy_url.startsWith('https://')
      ? a.detail.buy_url
      : (a.dedupe_key === 'selffix:voucher_restock' || a.dedupe_key === 'sys:voucher_stock_low' ? DEFAULT_VOUCHER_BUY_URL : '');
    const buyLink = buyUrl
      ? el('a', { class: 'ap-mini-btn ap-buy-link', href: buyUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Buy codes ↗')
      : null;
    return tap(el('div', { class: `ac-row sev-${a.severity}`, 'data-alert': a.dedupe_key },
      el('span', { class: `ac-dot sev-${a.severity}` }),
      el('div', { class: 'grow' },
        el('div', { class: 'ac-tags' },
          chip(meta.label, meta.tone),
          chip(a.robot, ''),
          el('small', { class: 'dim' }, ago(a.at))),
        el('b', {}, a.title),
        a.body ? el('small', {}, a.body) : null),
      el('div', { class: 'ac-acts' },
        buyLink,
        el('a', { class: 'ap-mini-btn', href: a.href }, 'Open →'),
        dismissBtn)), () => openAlertSheet(a));
  };

  return el('section', { class: 'v2card ac-card', id: 'v2AlertCentre' },
    el('div', { class: 'ac-hd' },
      ic('shield'),
      el('div', { class: 'grow' },
        el('b', {}, 'Alert centre'),
        el('small', {}, visible.length
          ? `${redN} broken · ${ambN} needs decision · ${gryN} FYI`
          : '0 alerts — all robots report green')),
      el('a', { class: 'v2robot-go', href: '#autopilot' }, 'Switches →')),
    visible.length
      ? el('div', { class: 'ac-list' }, ...visible.map(row))
      : el('div', { class: 'v2sub', style: 'margin-top:6px' }, 'No broken checks, held alarms, or robot notices right now.'));
}

export function todayView() {
  const help = helpSection(setHelpWaiting);   // 0097: members waiting for the team, at the very top
  const date = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
  void withSnap('today', (s) => {
    const inbox = buildInbox(s);
    const items = inbox.items.filter((i) => !hiddenKeys.has(i.key));
    const d0 = Date.parse(s.day_start);
    const real = s.people.filter((p) => p.kind === 'real');
    let fresh = real.filter((p) => Date.parse(p.joined_at) >= d0);
    const freshN = fresh.length;
    if (!fresh.length) fresh = [...real].sort((x, y) => Date.parse(y.joined_at) - Date.parse(x.joined_at));
    fresh = fresh.slice(0, 3);
    void loadPhotos(fresh.map((p) => p.user_id)).then(paintPhotos);
    // funnel over every real member with a card (one tap away, inside "More numbers")
    const fun: [string, number][] = [['Joined', real.length], ['Photo', real.filter((p) => realPhoto(p, s)).length],
      ['Posted a Reel', real.filter((p) => (p.reels?.live || 0) + (p.reels?.waiting || 0) > 0).length], ['Face verified', real.filter((p) => p.verified).length],
      ['Got a prize', real.filter((p) => (p.claims?.paid || 0) > 0).length]];
    const funnel = el('a', { class: 'v2funnel', href: '#people', id: 'v2Funnel' }, ...fun.map(([t, n], k) => el('div', { class: 'v2fun' },
      el('span', {}, t), el('i', {}, el('u', { style: `width:${Math.round((n / Math.max(1, fun[0][1])) * 100)}%` })), el('b', {}, String(n)),
      el('small', { class: k && n === Math.min(...fun.slice(1).map((f) => f[1])) ? 'low' : '' }, k ? `${Math.round((n / Math.max(1, fun[0][1])) * 100)}%` : ''))));
    const rr = buildRobotReport(s, { items, handled: inbox.handled });
    screen('today', header('Today', date),
      help,
      renderMorningBrief(s, items, [el('div', { class: 'v2sec' }, 'Where members stop'), funnel]),
      // the ONE primary button on Today
      items.length ? el('a', { class: 'v2pri', href: '#inbox', id: 'v2Decide' }, `Decide ${items.length} case${items.length === 1 ? '' : 's'}`, ic('chev'))
        : el('a', { class: 'v2li v2allclear', href: '#auto', id: 'v2Clear' }, ic('check'),
          el('div', { class: 'grow' }, el('b', {}, 'Nothing needs you'), el('small', {}, `${inbox.handled.length} handled automatically`)), ic('chev')),
      el('div', { class: 'v2sec' }, freshN ? `New today · ${freshN}` : 'Newest members'),
      el('div', { class: 'lt-list', id: 'v2NewToday' }, ...fresh.map((p) => el('a', { class: 'v2li', href: personLink(p), 'data-uid': p.user_id },
        avatar(p, 40), el('div', { class: 'grow' }, el('b', {}, `${p.name || '—'} #${p.no ?? '–'}`),
          el('small', {}, `${ago(p.joined_at)} · ${nextStep(p, s)}`)), ic('chev')))),
      el('div', { class: 'lt-list' },
        fold('v2RobotFold', [ic('robot'), el('b', { class: 'grow' }, 'Robot report'), el('small', {}, `${rr.lines.length} note${rr.lines.length === 1 ? '' : 's'} today`)], [
          el('a', { class: 'v2robot', href: '#inbox', id: 'v2RobotReport' }, el('ul', { class: 'v2robot-ul' }, ...rr.lines.map((ln) => el('li', {}, ln))))])));
  }, header('Today', date));
}
function paintPhotos() {
  document.querySelectorAll<HTMLElement>('[data-uid]').forEach((n) => {
    const src = photos.get(n.dataset.uid || ''); const ph = n.querySelector('.v2av.none, .v2pc-img.none');
    if (!src || !ph) return;
    if (ph.classList.contains('v2pc-img')) { (ph as HTMLElement).style.backgroundImage = `url("${src}")`; ph.classList.remove('none'); ph.textContent = ''; }
    else { const img = el('img', { class: 'v2av', src, alt: '', style: (ph as HTMLElement).getAttribute('style') || '' }); ph.replaceWith(img); }
  });
}

// ───────── 18 Nov tap-all: who-and-why sheets (founder: "Everything inside admin must be tappable further") ─────────
/** 0121 kr8_admin_explain; null when the database does not have it yet (the sheet then says so and shows what the snapshot has) */
async function explain<T extends { kind: string }>(kind: T['kind'], id: string): Promise<T | null> {
  try { const r = await rpc<unknown>('kr8_admin_explain', { p_kind: kind, p_id: id }); return isEx<T>(r, kind) ? r : null; } catch { return null; }
}
const needsDb = () => el('small', { class: 'xs-faint' }, 'More detail shows here after database update 0121.');
const whoOf = (p: { user_id: string | null; no: number | null; name: string | null }, sub?: string): SheetWho =>
  ({ user_id: p.user_id, no: p.no, name: p.name, photo: p.user_id ? photos.get(p.user_id) || null : null, sub });
const personOf = (uid: string | null | undefined) => (uid && snap ? snap.people.find((p) => p.user_id === uid) : undefined);
/** wire a non-link row so it opens a sheet (the tap-all guard test checks every row has a link or a click handler) */
function tap<T extends HTMLElement>(node: T, fn: () => void): T {
  node.onclick = (e) => { if ((e.target as HTMLElement).closest('button, a, input, select, summary') && e.target !== node) return; e.preventDefault(); fn(); };
  node.classList.add('v2tap'); if (!node.getAttribute('role')) node.setAttribute('role', 'button'); node.tabIndex = 0;
  return node;
}
/** a chip / number INSIDE a link that opens its own sheet instead of following the link */
function tapIn<T extends HTMLElement>(node: T, fn: () => void): T {
  node.onclick = (e) => { e.preventDefault(); e.stopPropagation(); fn(); };
  node.classList.add('v2tap'); node.setAttribute('role', 'button');
  return node;
}
const closeThen = (fn: () => void) => () => { closeSheet(); fn(); };

// ─── alerts ───
function openAlertSheet(a: RobotAlert): void {
  const kind = alertSheetKind(a);
  const key = 'alert:' + a.id;
  const dismiss = !a.synthetic ? xbtn('Dismiss alert', '', 'xAlertDismiss', closeThen(() => later(key, `Alert dismissed: ${a.title}`, () => rpc('kr8_admin_alert_dismiss', { p_id: a.id })))) : null;
  const open = a.href && a.href !== location.hash ? xlink('Open the page', a.href, 'xAlertOpen') : null;
  const base: SheetSpec = { kind: 'alert', id: a.dedupe_key || a.id, title: a.title, why: a.body || a.title, faint: `${a.robot} robot · ${ago(a.at)}${detailLines(a.detail).length ? ' · ' + detailLines(a.detail).join(' · ') : ''}`, actions: [open, dismiss] };
  const s = snap;
  if (kind === 'protect') {
    const flagKey = (a.dedupe_key || '').split(':')[1] || '';
    openSheet({ ...base, why: flagKey === 'ring_farming' ? 'These members mostly like and save each other’s Reels. That can be two friends farming Rings. Look at each pair before approving prizes.'
      : flagKey === 'scam_chat' ? 'These members sent chat messages that look like a scam. Robots never ban — you decide.' : base.why,
      load: async (box) => {
        if (flagKey === 'ring_farming') await farmAlertList(box);   // 0123: the full cases first
        const raw = await rpc<unknown>('kr8_admin_protect_overview').catch(() => null);
        const flags = isProtectOverview(raw) ? raw.flags.filter((f) => !flagKey || f.flag_key === flagKey) : [];
        await loadPhotos(flags.flatMap((f) => [f.user_id, String(f.detail?.partner_id || '')]).filter(Boolean));
        if (!flags.length) { box.append(el('small', { class: 'xs-line' }, 'No member is flagged right now.')); return; }
        box.append(xsec(`Flagged · ${flags.length}`), ...flags.map((f) => {
          const partner = personOf(String(f.detail?.partner_id || ''));
          const sentence = flagSentence({ no: f.member_no, name: f.name, flag_key: f.flag_key, summary: f.summary, detail: f.detail, partner_name: partner?.name });
          const pk = `pflag:${f.user_id}:${f.flag_key}`;
          const dis = xbtn('Not a problem', '', `xFlagDismiss-${f.user_id}`, () => { later(pk, `Flag cleared for #${f.member_no ?? '?'}`, () => rpc('kr8_admin_protect_dismiss', { p_user: f.user_id, p_flag_key: f.flag_key })); row.style.opacity = '.4'; });
          const faces = el('div', { class: 'xs-pair' }, ...[whoOf({ user_id: f.user_id, no: f.member_no, name: f.name }), ...(partner ? [whoOf(partner)] : [])].map((w) =>
            el('a', { class: 'xs-face', href: `#m/${w.user_id}` }, w.photo ? el('img', { src: w.photo, alt: '' }) : el('span', { class: 'none' }, (w.name || '?').slice(0, 1)), el('small', {}, `#${w.no ?? '?'} ${w.name || ''}`))));
          const row = el('div', { class: 'xs-card', 'data-flag': `${f.user_id}:${f.flag_key}` }, faces, el('b', { class: 'xs-sent' }, sentence), el('small', { class: 'xs-faint' }, f.summary),
            el('div', { class: 'xs-mini' }, xlink('Open member', `#m/${f.user_id}`), dis));
          return row;
        }));
      } });
    return;
  }
  if (kind === 'struggle') {
    const u = alertUser(a);
    openSheet({ ...base, who: u ? [whoOf(u)] : [], why: u ? `${u.name || 'This member'}${u.no != null ? ` #${u.no}` : ''} keeps hitting the same problem in the app. Their last errors are below in plain words — reply in Help if they need a hand.` : base.why,
      actions: [xlink('Open Help chats', '#help', 'xAlertHelp', 'ok'), dismiss],
      load: async (box) => {
        if (!u) return;
        const ex = await explain<ExErrors>('errors', u.user_id);
        if (!ex) { box.append(needsDb()); return; }
        box.append(xsec('Last problems on their phone'), ...(ex.rows.length ? ex.rows.map((r) => xrow(`${kindName(r.kind)}: ${codeMeaning(r.kind, r.code)}`, `${ago(r.at)} · ${uaInfo(r.ua).label}`, { tone: 'a' }))
          : [el('small', { class: 'xs-line' }, 'No phone problems logged.')]));
      } });
    return;
  }
  if (kind === 'help') { openSheet({ ...base, why: 'A member is waiting for an answer in Help. Open Help chats to reply.', actions: [xlink('Open Help chats', '#help', 'xAlertHelp', 'ok'), dismiss] }); return; }
  if (kind === 'stock') { openStockSheet(); return; }
  if (kind === 'held' && s) { openClaimsSheet('Held claims', 'The robot held these prize claims because something looked like a second account. Tap one to see why, then Pay or Refuse.', s.claims.filter((c) => c.held && c.status === 'pending' && (includeTest || !c.is_test)), 'held'); return; }
  if (kind === 'reports') { openSheet({ ...base, why: 'Members reported a Reel or a person. Open the reports to keep or remove each one.', actions: [xlink('Open reports', '#q/reports', 'xAlertReports', 'ok'), dismiss] }); return; }
  if (kind === 'dups' && s) {
    const { handled } = buildInbox(s);
    openSheet({ ...base, why: 'The duplicate robot found accounts with the same face or phone as an older account and hid the newer one. Tap one to see who and to undo it.',
      evidence: [xsec('Hidden today'), ...handled.filter((h) => h.kind === 'dup' && Date.parse(h.at) >= Date.parse(s.day_start)).map((h) => xrow(h.text, ago(h.at), { onTap: () => openHandledSheet(h), tone: 'a' }))] });
    return;
  }
  if (kind === 'errors') { openSheet({ ...base, why: 'Some messages or robot jobs failed in the last 24 hours. The Problems page lists each one in plain words.', actions: [xlink('Open Problems', '#problems', 'xAlertProblems', 'ok'), dismiss] }); return; }
  openSheet(base);
}

// ─── Handled automatically ───
function openHandledSheet(h: Handled): void {
  const actions: (HTMLElement | null)[] = [];
  if (h.undoDup && !h.undone) { const dupId = h.undoDup; actions.push(xbtn('Undo — show this account again', 'ok', 'xUndoDup', closeThen(() => later(h.key, 'Duplicate restored · ghost mode off', () => rpc('kr8_admin_dup_auto_undo', { p_dup: dupId, p_action: 'undo' }))))); }
  if (h.kind === 'face' || h.kind === 'refused') actions.push(xlink('Open face checks (Reject / Undo there)', '#faces', 'xHandledFaces'));
  if (h.kind === 'place' && h.ref) { const pid = h.ref; actions.push(xbtn('Open the place', '', 'xHandledPlace', () => void openPlaceById(pid))); }
  if (h.kind === 'paid' && h.ref && snap) { const c = snap.claims.find((x) => x.id === h.ref); if (c) actions.push(xbtn('See the claim', '', 'xHandledClaim', () => openClaimSheet(c))); }
  void loadPhotos((h.who || []).map((w) => w.user_id || '').filter(Boolean));
  openSheet({ kind: 'auto', id: h.key, title: h.kind === 'dup_preview' ? 'Robot preview (nothing changed)' : 'What the robot did',
    who: (h.who || []).map((w) => whoOf(w)), why: h.why || h.text,
    evidence: [xrow(h.text, `${ago(h.at)} · ${both(h.at, true)}`, { tone: h.undone ? '' : 'g' }), h.undone ? el('small', { class: 'xs-line' }, 'You already undid this.') : null], actions });
}

// ─── money: claims, codes ───
const BRANDS: Record<string, string> = { truemoney: 'TrueMoney', grab: 'Grab', shopeepay: 'ShopeePay' };
function claimWhy(c: Claim): string {
  const w = who(c);
  if (c.status === 'cancelled') return `${w}'s ฿${c.amount} claim was refused${c.decided ? ' by you' : ''}.`;
  if (c.held && c.status === 'pending') {
    const others = (c.hold_others || []).map((o) => `#${o.member_no ?? '?'}${o.first_name ? ` ${o.first_name}` : ''}`);
    return c.hold_reason === 'review' ? `${w}'s claim is held: the face check needs your eye before paying.`
      : `${w}'s claim is held because the robot thinks it may be a second account${others.length ? ` of ${others.join(', ')}` : ''}.`;
  }
  if (c.status === 'pending') return `${w} claimed ฿${c.amount}; it waits for a code (stock ran out). It is sent automatically when you add codes.`;
  return `${w} got a ฿${c.amount} ${BRANDS[c.brand] || c.brand} code${c.decided === 'paid' ? ' after you tapped Pay' : ' automatically'}${c.used ? ' and has used it' : ''}.`;
}
function openClaimSheet(c: Claim): void {
  const p = personOf(c.user_id);
  const actions: HTMLElement[] = [];
  const k = 'c:' + c.id;
  if (c.held && c.status === 'pending') {
    actions.push(xbtn(`Pay ฿${c.amount}`, 'ok', 'xPay-' + c.id, closeThen(() => later(k, `Paying ฿${c.amount} to ${who(c)}`, () => rpc('kr8_admin_release_claim', { p_claim: c.id })))),
      xbtn('Refuse', 'bad', 'xRefuse-' + c.id, closeThen(() => later(k, 'Claim refused (member is not told why)', () => rpc('kr8_admin_refuse_claim', { p_claim: c.id, p_reason: 'One person, one account', p_return: false })))));
  }
  if (c.user_id) actions.push(xlink('Open member', `#m/${c.user_id}`, 'xClaimMember'));
  const v = p && snap && c.held && c.status === 'pending' ? moneyRobotVerdict(c, p, snap) : null;
  const ch = claimChip(c);
  const mins = c.joined_at ? Math.round((Date.parse(c.created_at) - Date.parse(c.joined_at)) / 60000) : null;
  if (c.user_id) void loadPhotos([c.user_id]);
  openSheet({ kind: 'claim', id: c.id, title: `฿${c.amount} ${BRANDS[c.brand] || c.brand} · ${ch.text}`, who: [whoOf(c, mins != null ? `claimed ${mins} min after joining` : undefined)],
    why: claimWhy(c),
    evidence: [v ? el('div', { class: `xs-verdict ${v.tone}` }, el('b', {}, `Robot says: ${verdictSentence(v)}`), el('small', { class: 'xs-faint' }, `trust ${v.score}`)) : null,
      xrow('Claimed', both(c.created_at, true)), c.assigned_at ? xrow('Code sent', both(c.assigned_at, true), { tone: 'g' }) : null,
      c.prize?.kind ? xrow('Prize', `${c.prize.kind}${c.prize.rank ? ` · rank #${c.prize.rank}` : ''}${c.prize.week ? ` · week ${c.prize.week}` : ''}`) : null],
    actions,
    load: async (box) => {
      const ex = await explain<ExClaim>('claim', c.id);
      if (!ex) { box.append(needsDb()); return; }
      if (ex.code) box.append(xrow(`Code ${ex.code.masked}`, ex.code.status === 'assigned' ? (ex.used_at ? `used ${ago(ex.used_at)}` : 'sent, not used yet') : ex.code.status, { tone: 'g' }));
      if (ex.same_phone.length) box.append(xsec('Same phone claimed for'), ...ex.same_phone.map((o) => xrow(`#${o.no ?? '?'} ${o.name || ''}`, 'claimed a prize on the same phone', { href: o.user_id ? `#m/${o.user_id}` : undefined, tone: 'r' })));
    } });
}
function openClaimsSheet(title: string, why: string, list: Claim[], id: string): void {
  void loadPhotos(list.map((c) => c.user_id || '').filter(Boolean));
  openSheet({ kind: 'claims', id, title: `${title} · ${list.length}`, why,
    evidence: list.length ? list.map((c) => { const ch = claimChip(c); return xrow(`${who(c)} · ฿${c.amount} ${BRANDS[c.brand] || c.brand}`, `${ch.text} · ${ago(c.created_at)}`, { onTap: () => openClaimSheet(c), tone: ch.tone || '', id: 'xClaimRow-' + c.id }); })
      : [el('small', { class: 'xs-line' }, 'None.')] });
}
function openStockSheet(brand?: string, amount?: number): void {
  const s = snap;
  const stock = brand ? `${brand}:${amount}` : 'all';
  const rows = s ? s.codes.filter((k) => !brand || (k.brand === brand && k.amount === amount)) : [];
  const left = rows.reduce((n, k) => n + k.available, 0);
  openSheet({ kind: 'codes', id: stock, title: brand ? `${BRANDS[brand] || brand} ฿${amount} codes` : 'Prize codes',
    why: left <= 5 ? `Only ${left} code${left === 1 ? '' : 's'} left. Winners who claim when it hits 0 have to wait, so buy more and paste them in.` : `${left} codes are ready to send. Each row below is one code and who got it.`,
    evidence: rows.map((k) => xrow(`${BRANDS[k.brand] || k.brand} ฿${k.amount}`, `${k.available} left · ${k.assigned} given out`, { onTap: brand ? undefined : () => openStockSheet(k.brand, k.amount), tone: k.available <= 2 ? 'r' : k.available <= 5 ? 'a' : 'g' })),
    actions: [xlink('Buy codes ↗', DEFAULT_VOUCHER_BUY_URL, 'xBuyCodes'), xlink('Paste codes', '#codes', 'xPasteCodes', 'ok')],
    load: async (box) => {
      const ex = await explain<ExCodes>('codes', stock);
      if (!ex) { box.append(needsDb()); return; }
      const shown = ex.codes.filter((x) => includeTest || !x.is_test);
      box.append(xsec(`Every code · ${shown.length}`), ...shown.slice(0, 150).map((x) => xrow(`${x.masked} · ${BRANDS[x.brand] || x.brand} ฿${x.amount}`,
        x.status === 'available' ? `ready · added ${ago(x.added_at)}` : `${x.no != null ? `#${x.no} ${x.name || ''}` : 'a removed member'} · sent ${ago(x.assigned_at)}${x.used_at ? ' · used' : ''}`,
        { href: x.user_id ? `#m/${x.user_id}` : undefined, tone: x.status === 'available' ? 'g' : '' })));
    } });
}

// ─── Reels ───
const HIDE_REASONS: [string, string, string][] = [   // same texts as REEL_CHIPS in adminApp.ts (the member reads the Thai + English reason)
  ['Not a real Bangkok spot', 'Kring Reels show a real spot in Bangkok.', 'รีลบนกริ๊ง! ต้องเป็นสถานที่จริงในกรุงเทพฯ ครับ'],
  ['Wrong place pinned', 'The pinned place doesn’t match the Reel. Pin the right place and post again.', 'หมุดสถานที่ไม่ตรงกับรีล ปักหมุดให้ถูกแล้วโพสต์ใหม่ได้เลยครับ'],
  ['Not their own clip', 'This clip looks copied. Please post a Reel you filmed yourself.', 'คลิปนี้ดูเหมือนก๊อปมา รบกวนโพสต์รีลที่คุณถ่ายเองนะครับ'],
  ['Fake engagement', 'This Reel was hidden for fake engagement (bought views or many accounts).', 'รีลนี้ถูกซ่อนเพราะยอดไม่จริง (ซื้อวิวหรือใช้หลายบัญชี) ครับ'],
];
interface ReelLite { id: string; status: string; hidden?: boolean; board_off?: boolean; board_off_reason?: string | null; poster_path?: string | null; video_path?: string | null; author?: string | null; likes?: number; saves?: number; shares?: number; views?: number; note?: string | null; at?: string }
function reelWhy(r: ReelLite): string {
  if (r.hidden || r.status === 'hidden') return `This Reel is hidden${r.note ? ` (reason the member saw: ${r.note.split('\n').pop()})` : ''}.`;
  if (r.status === 'pending') return 'This Reel waits for your OK. Watch it: a real spot in Bangkok, filmed by them? → Approve. Otherwise → Hide and pick why.';
  if (r.board_off) return `This Reel is live in the feed but earns no board Rings${r.board_off_reason ? ` (${r.board_off_reason})` : ''}.`;
  return 'This Reel is live in the feed and on the board.';
}
function openReelSheet(r0: ReelLite, after?: () => void): void {
  const p = personOf(r0.author || undefined);
  const k = 'reel:' + r0.id;
  const video = el('div', { class: 'xs-video' }, el('small', { class: 'xs-line' }, 'Loading the clip…'));
  const reasons = el('div', { class: 'xs-chips', hidden: true }, ...HIDE_REASONS.map(([label, en, th], i) => xbtn(label, 'bad', `xHideWhy-${i}`,
    closeThen(() => { later(k, 'Reel hidden · reason sent', () => rpc('kr8_admin_review_reel', { p_reel: r0.id, p_status: 'hidden', p_note: `${th}\n${en}` })); after?.(); }))));
  const hidden = r0.hidden || r0.status === 'hidden';
  const actions = [
    !hidden && r0.status !== 'approved' ? xbtn('Approve', 'ok', 'xReelOk', closeThen(() => { later(k, 'Reel approved', () => rpc('kr8_admin_review_reel', { p_reel: r0.id, p_status: 'approved' })); after?.(); })) : null,
    hidden ? xbtn('Show again (approve)', 'ok', 'xReelShow', closeThen(() => { later(k, 'Reel live again', () => rpc('kr8_admin_review_reel', { p_reel: r0.id, p_status: 'approved' })); after?.(); }))
      : xbtn('Hide…', 'bad', 'xReelHide', () => { reasons.hidden = !reasons.hidden; }),
  ];
  openSheet({ kind: 'reel', id: r0.id, title: hidden ? 'Hidden Reel' : r0.status === 'pending' ? 'Reel waiting' : 'Live Reel', who: p ? [whoOf(p)] : [], why: reelWhy(r0),
    evidence: [video, reasons, r0.likes != null ? xrow(`${r0.likes} likes · ${r0.saves ?? 0} saves · ${r0.shares ?? 0} shares`, `${r0.views ?? 0} views${r0.at ? ` · posted ${ago(r0.at)}` : ''}`) : null],
    actions,
    load: async () => {
      let vp = r0.video_path || snap?.pending.reels.find((x) => x.id === r0.id)?.video_path || null;
      let pp = r0.poster_path || null;
      let places: ExReel['places'] = [];
      if (!vp) { const ex = await explain<ExReel>('reel', r0.id); if (ex) { vp = ex.video_path; pp = pp || ex.poster_path; places = ex.places; } }
      const urls = await signReelPaths([vp || '', pp || ''].filter(Boolean)).catch(() => ({} as Record<string, string>));
      if (vp && urls[vp]) video.replaceChildren(el('video', { src: urls[vp], poster: pp ? urls[pp] : undefined, controls: true, playsinline: true, preload: 'metadata', id: 'xReelVideo' }));
      else if (pp && urls[pp]) video.replaceChildren(el('img', { src: urls[pp], alt: '' }), needsDb());
      else video.replaceChildren(el('small', { class: 'xs-line' }, 'The clip could not load.'), el('a', { class: 'xs-line', href: '#q/reels' }, 'Open the Reels queue'));
      if (places.length) video.after(xrow(`Place: ${places.map((x) => x.name).join(' · ')}`, places.some((x) => x.outside_bkk) ? 'outside Bangkok (no board Rings)' : 'Bangkok'));
    } });
}

// ─── Rings this week ───
function openRingsSheet(uid: string, nm?: { no: number | null; name: string | null }): void {
  const p = personOf(uid);
  const name = `${nm?.name || p?.name || 'This member'}${(nm?.no ?? p?.no) != null ? ` #${nm?.no ?? p?.no}` : ''}`;
  const sc = p?.score;
  void loadPhotos([uid]);
  openSheet({ kind: 'rings', id: uid, title: `Rings this week · ${name}`, who: [whoOf({ user_id: uid, no: nm?.no ?? p?.no ?? null, name: nm?.name ?? p?.name ?? null })],
    why: sc ? `${name} has ${sc.score} Rings this week: ${sc.likes} likes, ${sc.saves} saves and ${sc.opens} shared-link opens that counted. Who gave them is below.` : `Who gave ${name} Rings this week, and what did not count.`,
    faint: 'A like = 1 Ring, a save = 3, a shared-link open = 5; likes and saves from verified travellers count double.',
    load: async (box) => {
      const ex = await explain<ExRings>('rings', uid);
      if (!ex) { box.append(needsDb()); return; }
      const sm = ringsSummary(ex);
      box.querySelector('#xSheetWhy')!.textContent = ringsSentence(name, sm);
      await loadPhotos(ex.gives.map((g) => g.user_id));
      const giverRows = (what: 'like' | 'save') => ex.gives.filter((g) => g.what === what).map((g) => xrow(`#${g.no ?? '?'} ${g.name || 'member'}${g.traveller ? ' · traveller ×2' : ''}`,
        g.counted ? `counted · ${ago(g.at)}` : `did not count: ${giveWhy(g.why)}`, { href: `#m/${g.user_id}`, tone: g.counted ? 'g' : 'r' }));
      const likes = giverRows('like'), saves = giverRows('save');
      box.append(...[
        sm.topGivers.length ? xsec('Who gave the most') : null, ...sm.topGivers.map((t) => xrow(`#${t.no ?? '?'} ${t.name}`, `${t.n} counted like${t.n === 1 ? '' : 's'} / save${t.n === 1 ? '' : 's'}`, { href: `#m/${t.user_id}`, tone: 'g' })),
        xsec(`Likes · ${sm.likes} counted${sm.likesOff ? ` · ${sm.likesOff} not` : ''}`), ...(likes.length ? likes : [el('small', { class: 'xs-line' }, 'No likes this week.')]),
        xsec(`Saves · ${sm.saves} counted${sm.savesOff ? ` · ${sm.savesOff} not` : ''}`), ...(saves.length ? saves : [el('small', { class: 'xs-line' }, 'No saves this week.')]),
        xsec(`Shared-link opens · ${sm.opens} counted${sm.opensOff ? ` · ${sm.opensOff} not` : ''}`),
        ...(ex.opens.length ? ex.opens.slice(0, 60).map((o) => xrow(o.counted ? `Counted · from ${o.source || 'a link'}${o.country ? ` · ${o.country}` : ''}` : `Not counted: ${openWhy(o.why)}`,
          `${ago(o.at)}${o.opener_no != null ? ` · opened by #${o.opener_no} ${o.opener_name || ''}` : ''}`, { tone: o.counted ? 'g' : 'r', href: o.opener ? `#m/${o.opener}` : undefined }))
          : [el('small', { class: 'xs-line' }, 'Nobody opened a shared link this week.')]),
        sm.offWhy.length ? xsec('Why some did not count') : null, ...sm.offWhy.map(([w, n]) => xrow(w, `${n} time${n === 1 ? '' : 's'}`, { tone: 'a' }))].filter((x): x is HTMLElement => !!x));
    } });
}

// ─── places ───
async function openPlaceById(id: string): Promise<void> {
  const ex = await explain<ExPlace>('place', id);
  if (ex) { openPlaceSheet({ id: ex.id, name_en: ex.name_en, name_th: ex.name_th, area: ex.area, status: ex.status as PlaceRow['status'], added_how: ex.added_how, outside_bkk: ex.outside_bkk,
    coords_rough: false, osm_ref: null, lat: ex.lat, lng: ex.lng, created_at: ex.created_at, by_no: ex.by_no, by_name: ex.by_name, geo: null, reels: ex.reels.length, auto: null }); return; }
  location.hash = '#places';
}
function openPlaceSheet(p: PlaceRow, after?: () => void): void {
  const key = 'place:' + p.id;
  const hide = p.status !== 'rejected';
  const map = p.coords_rough ? `https://www.google.com/maps/search/${encodeURIComponent(p.name_th || p.name_en)}` : `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  openSheet({ kind: 'place', id: p.id, title: p.name_en, why: p.status === 'rejected' ? `${p.name_en} is hidden: it does not show in search or on any Reel.`
      : `${p.name_en} was added ${p.added_how === 'typed' ? `by ${p.by_no != null ? `member #${p.by_no} ${p.by_name || ''}` : 'a member'}` : 'by Kring'} and is used on ${p.reels} Reel${p.reels === 1 ? '' : 's'}${p.outside_bkk ? '. It is outside Bangkok, so those Reels earn no board Rings' : ''}.`,
    evidence: [p.name_th && p.name_th !== p.name_en ? xrow(p.name_th, 'name in Thai (what members typed)') : null, xrow(p.area, `added ${ago(p.created_at)} · ${placeFlags(p).map(([t]) => t).join(' · ')}`),
      p.by_no != null ? xrow(`Added by #${p.by_no} ${p.by_name || ''}`, 'tap to open the member', { onTap: () => { const m = snap?.people.find((x) => x.no === p.by_no); location.hash = m ? `#m/${m.user_id}` : '#people'; } }) : null],
    actions: [xlink('Map ↗', map, 'xPlaceMap'), xbtn(hide ? 'Hide this place' : 'Restore this place', hide ? 'bad' : 'ok', hide ? 'xPlaceHide' : 'xPlaceRestore',
      closeThen(() => later(key, hide ? `Hidden: ${p.name_en}` : `Restored: ${p.name_en}`, async () => { await rpc('kr8_admin_place_undo', { p_id: p.id, p_action: hide ? 'hide' : 'restore' }); after?.(); })))],
    load: async (box) => {
      const ex = await explain<ExPlace>('place', p.id);
      if (!ex) { box.append(needsDb()); return; }
      const urls = await signReelPaths(ex.reels.map((r) => r.poster_path || '').filter(Boolean)).catch(() => ({} as Record<string, string>));
      box.append(xsec(`Reels at this place · ${ex.reels.length}`), ...(ex.reels.length ? [el('div', { class: 'xs-reels' }, ...ex.reels.map((r) => tap(el('div', { class: 'v2reel' },
        r.poster_path && urls[r.poster_path] ? el('img', { src: urls[r.poster_path], alt: '' }) : el('span', { class: 'none' }),
        el('small', {}, `#${r.no ?? '?'} ${r.name || ''}`), el('small', {}, r.hidden || r.status === 'hidden' ? 'hidden' : r.status === 'pending' ? 'waiting' : 'live')),
        () => openReelSheet({ id: r.id, status: r.status, hidden: r.hidden, poster_path: r.poster_path, author: r.author, at: r.at }))))] : [el('small', { class: 'xs-line' }, 'No Reel uses it.')]));
    } });
}

// ─── chips / flags / trust ───
function openFlagSheet(key: string, p: Person): void {
  const fl = snap ? personFlags(p, snap.people, snap.claims).find((f) => f.key === key) : undefined;
  const links = key === 'lookalike' || key === 'shared' || key === 'lookalike_board' ? p.links : [];
  void loadPhotos([p.user_id, ...links.map((l) => l.user_id)]);
  openSheet({ kind: 'flag', id: `${p.user_id}:${key}`, title: fl?.text || key.replace(/_/g, ' '), who: [whoOf(p)], why: flagWhy(key, p),
    evidence: [...links.map((l) => { const v = linkVerdict(l); return xrow(v.text, `#${l.no ?? '?'} ${l.name || ''}${v.faint ? ` · ${v.faint}` : ''}`, { href: `#m/${l.user_id}`, tone: v.tone }); }),
      key === 'opens_only' || key === 'board_off' ? xrow('See who gave the Rings', 'likes, saves and link opens this week', { onTap: () => openRingsSheet(p.user_id, p) }) : null],
    actions: [links.length ? xlink('Decide in Needs you', '#inbox/lookalike', 'xFlagDecide', 'ok') : null, xlink('Open member', `#m/${p.user_id}`, 'xFlagMember')] });
}
function openTrustSheet(p: { user_id: string; no: number | null; name: string | null }, t: Trust): void {
  const w = trustWords(t);
  openSheet({ kind: 'trust', id: p.user_id, title: w.text, who: [whoOf(p)],
    why: w.tone === 'g' ? `${who(p)} looks like a real, single account.` : w.tone === 'r' ? `${who(p)} shows strong signs of being a second account or a risk. Do not pay before checking.` : `${who(p)} has mixed signs. Look at their photos before paying.`,
    evidence: t.reasons.length ? t.reasons.map((r) => xrow(r.replace(/^[+−-]\d+\s*/, ''), r.startsWith('+') ? 'good sign' : 'warning sign', { tone: r.startsWith('+') ? 'g' : 'r' })) : [el('small', { class: 'xs-line' }, 'No good or bad signs yet.')],
    faint: `${w.detail} / 100 (50 = no signs either way)`, actions: [xlink('Open member', `#m/${p.user_id}`, 'xTrustMember')] });
}
/** chip that opens a why sheet (inside a link the link is not followed) */
function whyChip(text: string, tone: string, fn: () => void): HTMLElement { return tapIn(chip(text, tone), fn); }

// ───────── Growth (0113): the page admin opens on · 0114: Day view + Day by day table ─────────
/** founder 18 Nov: "growth status should be the default page in admin" — visitors, where from, who comes back, which links bring members.
 *  Later 18 Nov: "see Growth day by day" — a Day option (‹ › + calendar, compared with the day before) and a Day by day table under 7 / 30 days.
 *  Every number comes from the same database definitions (kr8_admin_growth_core, 0114), so the views never disagree. */
type GrowthMode = GrowthDays | 'day';
const growthCache = new Map<string, { at: number; g: unknown }>();
let growthDays: GrowthDays = (Number(LS('kr8-v2-gp')) as GrowthDays) || 7;
if (![1, 7, 30].includes(growthDays)) growthDays = 7;
let growthDay = '';   // the day the Day view last showed ("2026-11-17")
const fmt = (n: number) => n.toLocaleString('en-US');
const onGrowth = () => location.hash === '' || location.hash === '#growth' || location.hash.startsWith('#growth/');
async function cached<T>(key: string, force: boolean, get: () => Promise<unknown>, ok: (x: unknown) => x is T, need: string): Promise<T> {
  const c = growthCache.get(key);
  if (!force && c && Date.now() - c.at < 60_000 && ok(c.g)) return c.g;
  const g = await get();
  if (!ok(g)) throw new Error(`Growth needs database update ${need}`);
  growthCache.set(key, { at: Date.now(), g });
  return g;
}
const loadGrowth = (days: GrowthDays, force = false) => cached<Growth>(`p${days}`, force, () => rpc<unknown>('kr8_admin_growth', { p_days: days }), isGrowth, '0113');
const loadGrowthDay = (day: string, force = false) => cached<GrowthDay>(`d${day}`, force, () => rpc<unknown>('kr8_admin_growth_day', { p_day: day }), isGrowthDay, '0114');
const loadDaily = (days: 7 | 30, force = false) => {
  const [from, to] = dailyRange(days, bkkToday());
  return cached<GrowthDailyRow[]>(`t${from}_${to}`, force, () => rpc<unknown>('kr8_admin_growth_daily', { p_from: from, p_to: to }), isGrowthDaily, '0114');
};
/** Day by day: one thin row per Bangkok day, newest first; tap a row → that day in the Day view. 10 rows, the rest one tap away. */
function dailyTable(rows: GrowthDailyRow[], today: string): HTMLElement {
  const top = Math.max(1, ...rows.map((r) => r.visitors));
  const cell = (n: number, cls = '') => el('span', { class: `gr-td ${n ? '' : 'zero'} ${cls}` }, fmt(n));
  const row = (r: GrowthDailyRow) => el('a', { class: 'gr-tr', href: `#growth/${r.day}`, 'data-day': r.day, 'aria-label': `Open ${dayName(r.day)}` },
    el('span', { class: 'gr-tdate' }, el('b', {}, dayName(r.day).replace(/^\S+ /, '')),
      el('small', {}, r.day === today ? 'Today' : r.day === addDays(today, -1) ? 'Yesterday' : dayName(r.day).split(' ')[0])),
    el('span', { class: 'gr-td gr-tv' }, el('i', { style: `width:${Math.round((r.visitors / top) * 100)}%` }), el('b', {}, fmt(r.visitors))),
    cell(r.returning), cell(r.signins), cell(r.cards), cell(r.first_reels, 'pk'));
  const head = el('div', { class: 'gr-tr gr-th' }, el('span', {}, 'Day'), el('span', {}, 'Visitors'), el('span', {}, 'Came back'),
    el('span', {}, 'Sign-ins'), el('span', {}, 'Cards'), el('span', {}, 'First Reels'));
  const first = rows.slice(0, 10), rest = rows.slice(10);
  return el('div', { class: 'gr-table', id: 'grDaily', role: 'table' }, head, ...first.map(row),
    rest.length ? fold('grDailyMore', foldHead(`${rest.length} earlier day${rest.length === 1 ? '' : 's'}`), rest.map(row)) : null);
}
function sparkline(g: Growth): HTMLElement {
  const vals = g.series.map((x) => x.visitors);
  const { line, area, max } = sparkPath(vals, 320, 64);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 320 64'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'gr-spark');
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Visitors ${g.days === 1 ? 'per hour' : 'per day'}, highest ${max}`);
  svg.innerHTML = `<defs><linearGradient id="grFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4fd8" stop-opacity=".32"/><stop offset="1" stop-color="#ff4fd8" stop-opacity="0"/></linearGradient></defs>`
    + `<path d="${area}" fill="url(#grFill)"/><path d="${line}" fill="none" stroke="#ff4fd8" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  const [a, b] = seriesEnds(g.series, g.days);
  return el('div', { class: 'gr-sparkwrap', id: 'grSpark' }, svg, el('div', { class: 'gr-sparkx' }, el('span', {}, a), el('span', {}, `peak ${max}`), el('span', {}, b)));
}
function growthBody(g: Growth, opt: { pastDay?: boolean; daily?: HTMLElement | null } = {}): HTMLElement[] {
  const retPct = g.visitors ? Math.round((g.returning / g.visitors) * 100) : 0;
  const trend = trendWords(g.visitors, g.visitors_prev, g.days, !!opt.pastDay);
  const up = g.visitors >= g.visitors_prev;
  const stat = (id: string, val: string, label: string) => el('div', { class: 'gr-stat', id }, el('b', {}, val), el('span', {}, label));
  const hero = el('section', { class: 'gr-hero', id: 'grHero' },
    el('div', { class: 'gr-big' },
      el('div', {}, el('b', { id: 'grVisitors' }, fmt(g.visitors)), el('span', {}, 'visitors')),
      trend ? el('small', { class: `gr-trend ${up ? 'up' : 'down'}` }, trend) : null),
    sparkline(g),
    el('div', { class: 'gr-grid' },
      stat('grVisits', fmt(g.visits), 'Visits'),
      stat('grReturning', `${fmt(g.returning)}`, `Came back · ${retPct}%`),
      stat('grSignins', fmt(g.signins), 'New sign-ins'),
      stat('grCards', fmt(g.cards), 'New cards'),
      stat('grReels', fmt(g.first_reels), 'First Reels'),
      stat('grInstalls', fmt(g.app_installs), 'App installs')));

  // funnel: visitors, then ONE group of people (signed in this period → made a card → posted a Reel)
  const f: [string, number, number][] = [['Visitors', g.visitors, 0], ['Signed in', g.funnel.signed_in, g.visitors], ['Card made', g.funnel.card, g.funnel.signed_in], ['First Reel', g.funnel.reel, g.funnel.card]];
  const pcts = f.slice(1).map(([, n, of]) => (of ? n / of : 1));
  const low = Math.min(...pcts);
  const funnel = el('div', { class: 'v2funnel gr-funnel', id: 'grFunnel' }, ...f.map(([t, n, of], k) => el('div', { class: 'v2fun' },
    el('span', {}, t), el('i', {}, el('u', { style: `width:${Math.max(n ? 3 : 0, Math.round((n / Math.max(1, g.visitors)) * 100))}%` })), el('b', {}, fmt(n)),
    el('small', { class: k && of && n / of === low ? 'low' : '' }, k ? stepPct(n, of) : ''))));

  const src = groupSources(g.sources);
  // 18 Nov tap-all: each source / link / country row opens what it means
  const sources = el('div', { class: 'lt-list', id: 'grSources' }, ...(src.length ? src.map((x) => tap(el('div', { class: 'v2li gr-row', 'data-src': x.key, title: x.hosts.join(', ') || undefined },
    el('span', { class: `gr-dot s-${x.key}` }),
    el('div', { class: 'grow' }, el('b', {}, x.label), el('i', { class: 'gr-bar' }, el('u', { style: `width:${Math.max(2, x.share)}%` })),
      x.key === 'other' && x.hosts.length ? el('small', {}, x.hosts.join(' · ')) : null),
    el('div', { class: 'gr-n' }, el('b', {}, fmt(x.visitors)), el('small', {}, `${x.share}%`))), () => openSheet({ kind: 'source', id: `${g.from}:${g.to}:${x.key}`, title: x.label,
      why: `${fmt(x.visitors)} visitor${x.visitors === 1 ? '' : 's'} (${x.share}% of everyone in this period) came to Kring first from ${x.label}.`,
      evidence: x.hosts.length ? [xsec('Sites that sent them'), ...x.hosts.map((h) => xrow(h, 'the site the visit came from'))] : [el('small', { class: 'xs-line' }, 'No site name was passed on (typed link, home-screen app or an in-app browser).')] })))
    : [el('div', { class: 'v2sub gr-none' }, 'No visitors in this period yet.')]));

  const refs = visibleRefs(g.refs);
  const refRow = (r: (typeof refs)[number]) => tap(el('div', { class: 'v2li gr-row', 'data-ref': r.ref },
    el('span', { class: 'gr-ic' }, ic('link')),
    el('div', { class: 'grow' }, el('b', {}, refLabel(r)),
      el('small', {}, `${fmt(r.visitors)} visitor${r.visitors === 1 ? '' : 's'} · ${r.reels} posted a Reel`)),
    el('div', { class: 'gr-n' }, el('b', { class: r.joined ? 'hot' : '' }, fmt(r.joined)), el('small', {}, 'joined'))), () => {
      const joined = snap ? snap.people.filter((p) => p.kind === 'real' && (p.ref || '').toLowerCase() === r.ref.toLowerCase()) : [];
      void loadPhotos(joined.map((p) => p.user_id));
      openSheet({ kind: 'ref', id: `${g.from}:${r.ref}`, title: refLabel(r),
        why: `${fmt(r.visitors)} phone${r.visitors === 1 ? '' : 's'} opened this link; ${r.joined} made a member card${r.reels ? ` and ${r.reels} posted a Reel` : ''}.`,
        who: joined.slice(0, 30).map((p) => whoOf(p, `joined ${ago(p.joined_at)}`)),
        evidence: joined.length ? [] : [el('small', { class: 'xs-line' }, 'Nobody with this code is in the member list yet.')],
        actions: [xlink('Recruiters page', '#recruiters', 'xRefRecruiters')] });
    });
  const head = refs.slice(0, 6); const rest = refs.slice(6);
  const recruit = el('div', { class: 'lt-list', id: 'grRefs' },
    ...(refs.length ? head.map(refRow) : [el('div', { class: 'v2sub gr-none' }, 'No recruiter or invite link was used in this period.')]),
    rest.length ? fold('grRefsMore', foldHead(`${rest.length} more link${rest.length === 1 ? '' : 's'}`), rest.map(refRow)) : null,
    el('a', { class: 'v2li gr-row', href: '#recruiters', id: 'grInstallsRow' }, el('span', { class: 'gr-ic' }, ic('reel')),
      el('div', { class: 'grow' }, el('b', {}, 'App installs opened'), el('small', {}, g.share_opens === null ? 'Kring added to a home screen' : `Shared Reel links opened: ${fmt(g.share_opens)}`)),
      el('div', { class: 'gr-n' }, el('b', {}, fmt(g.app_installs)), el('small', {}, 'installs'))));

  const cMax = Math.max(1, ...g.countries.map((c) => c.visitors));
  const countries = el('div', { class: 'lt-list', id: 'grCountries' }, ...(g.countries.length ? g.countries.map((c) => tap(el('div', { class: 'v2li gr-row' },
    el('span', { class: 'gr-flag' }, flag(c.country) || '🌐'),
    el('div', { class: 'grow' }, el('b', {}, countryName(c.country)), el('i', { class: 'gr-bar c' }, el('u', { style: `width:${Math.max(2, Math.round((c.visitors / cMax) * 100))}%` }))),
    el('div', { class: 'gr-n' }, el('b', {}, fmt(c.visitors)))), () => openSheet({ kind: 'country', id: `${g.from}:${c.country}`, title: countryName(c.country),
      why: `${fmt(c.visitors)} visitor${c.visitors === 1 ? '' : 's'} in this period came from ${countryName(c.country)}${c.country === 'TH' ? ' — the people Kring is for' : c.country === 'US' ? ' — often our own testing and robots' : ''}.` })))
    : [el('div', { class: 'v2sub gr-none' }, 'No visitors in this period yet.')]));

  const sec = (t: string, note: string, id: string) => el('div', { class: 'v2sec gr-sec' }, t, info(note, id));
  return [hero, ...(opt.daily ? [opt.daily] : []),
    sec('Visitor to Reel', 'Visitors = phones that opened the site or app. The next three steps follow ONE group: people who signed in during this period, how many of them made a card, and how many of them posted a Reel. The % is step to step; the weakest step is pink.', 'grFunnelInfo'), funnel,
    sec('Where visitors come from', 'Each visitor counts once, by the site that sent their first visit in this period. Direct / in-app = no site was passed on (typed link, home-screen app, many in-app browsers). Shared links = a ?ref= link with no site passed on. Test phones, robots, localhost and preview links are left out.', 'grSrcInfo'), sources,
    sec('Recruiter links', 'Visitors = phones that opened a ?ref= link. Joined = real members who made a card in this period with that code (or were credited to it). The code is saved on the card, so a sign-in without a card cannot be tied to a link. Test, demo and perf links are hidden.', 'grRefInfo'), recruit,
    sec('Countries', 'Top 8 countries of this period\'s visitors (from the visit counter; Unknown = not sent).', 'grCtyInfo'), countries,
    el('p', { class: 'gr-foot' }, `Bangkok ${g.from === g.to ? `day · ${dayName(g.to)}` : `days · ${dayName(g.from)} → ${dayName(g.to)}`} · came back = also visited on an earlier day`)];
}
export function growthView(dayArg?: string) {
  stopV2();
  const today = bkkToday();
  const mode: GrowthMode = dayArg ? 'day' : growthDays;
  if (dayArg) growthDay = clampDay(dayArg === 'day' ? growthDay || addDays(today, -1) : dayArg, today, '2026-10-01');
  const periods: [GrowthMode, string][] = [[1, 'Today'], [7, '7 days'], [30, '30 days'], ['day', 'Day']];
  const chips = el('div', { class: 'v2chips gr-period', role: 'tablist', id: 'grPeriod' }, ...periods.map(([d, t]) => {
    const b = el('button', { type: 'button', role: 'tab', class: d === mode ? 'on' : '', 'aria-selected': String(d === mode), id: `grP${d}` }, d === 'day' ? ic('cal') : null, t);
    b.onclick = () => {
      if (d === mode) return;
      if (d === 'day') { location.hash = `#growth/${growthDay || addDays(today, -1)}`; return; }
      growthDays = d; LS('kr8-v2-gp', String(d));
      if (location.hash.startsWith('#growth/')) location.hash = '#growth'; else growthView();
    };
    return b;
  }));
  // Day view: ‹ day › with a calendar under the day name (the phone's own date picker)
  let dayNav: HTMLElement | null = null;
  if (mode === 'day') {
    const d = growthDay;
    const go = (x: string) => { location.hash = `#growth/${clampDay(x, today, '2026-10-01')}`; };
    const prev = el('button', { type: 'button', class: 'gr-step', id: 'grPrevDay', 'aria-label': 'Day before' }, ic('back'));
    const next = el('button', { type: 'button', class: 'gr-step', id: 'grNextDay', 'aria-label': 'Next day', disabled: d >= today }, ic('chev'));
    prev.onclick = () => go(addDays(d, -1)); next.onclick = () => go(addDays(d, 1));
    const pick = el('input', { type: 'date', id: 'grPick', value: d, max: today, min: '2026-10-01', 'aria-label': 'Pick a day' }) as HTMLInputElement;
    pick.onchange = () => { if (pick.value) go(pick.value); };
    const label = el('label', { class: 'gr-dayname', for: 'grPick' },
      el('b', {}, dayName(d)), el('small', {}, d === today ? 'Today so far' : d === addDays(today, -1) ? 'Yesterday' : 'Tap to pick a day'), ic('cal'), pick);
    label.onclick = () => { try { pick.showPicker?.(); } catch { /* older phones open it on focus */ } };
    dayNav = el('div', { class: 'gr-daynav', id: 'grDayNav' }, prev, label, next);
  }
  const body = el('div', { id: 'grBody' }, loadingCard());
  const fresh = el('button', { type: 'button', class: 'v2fresh', id: 'grFresh', title: 'Tap to refresh now' }, 'Loading…');
  const hd = el('header', { class: 'v2hd' }, el('span', { class: 'v2dot' }),
    el('div', { class: 'grow' }, el('h1', {}, 'Growth'), el('div', { class: 'v2sub', id: 'grSub' }, mode === 'day' ? 'One day vs the day before' : 'Visitors, sources and sign-ups')), fresh);
  let gotAt = 0;
  const key = location.hash;
  const paint = async (force: boolean) => {
    body.querySelector('.gr-hero')?.classList.add('gr-dim');
    if (!body.querySelector('.gr-hero')) body.replaceChildren(loadingCard());
    try {
      let g: Growth; let daily: HTMLElement | null = null;
      if (mode === 'day') g = await loadGrowthDay(growthDay, force);
      else {
        const t = mode === 1 ? null : loadDaily(mode, force).then((rows) => dailyTable(rows, today))
          .catch((e) => el('div', { class: 'v2sub gr-none', id: 'grDaily' }, `Day by day: ${String((e as Error).message || e)}`));
        g = await loadGrowth(mode, force);
        if (t) daily = el('div', {}, el('div', { class: 'v2sec gr-sec' }, 'Day by day', info('Newest first. Tap a day to open it. Each day counts a phone once, so a phone that came on 3 days is 1 visitor in the 7-day total but shows on each of those 3 days here. Sign-ins, cards and first Reels add up to the total.', 'grDailyInfo')), await t);
      }
      if (location.hash !== key || !onGrowth()) return;
      gotAt = Date.now();
      fresh.textContent = `Updated ${ago(new Date(gotAt).toISOString())}`;
      body.replaceChildren(...growthBody(g, { pastDay: mode === 'day' && growthDay !== today, daily }));
    } catch (e) { body.replaceChildren(errorCard(e)); fresh.textContent = 'Tap to retry'; }
  };
  fresh.onclick = () => { fresh.textContent = 'Refreshing…'; void paint(true); };
  screen('growth', hd, chips, dayNav, body);
  void paint(false);
  // the Needs you badge on the dock still shows (it comes from the admin snapshot)
  void loadSnapshot().then(() => { if (location.hash === key) app().querySelector('.v2bar')?.replaceWith(v2Tabbar('growth')); }).catch(() => undefined);
  pollTimer = window.setInterval(() => { if (document.visibilityState === 'visible' && location.hash === key && (mode !== 'day' || growthDay === bkkToday())) void paint(true); }, 120_000);
  tickTimer = window.setInterval(() => { if (gotAt && document.getElementById('grFresh') === fresh) fresh.textContent = `Updated ${ago(new Date(gotAt).toISOString())}`; }, 5000);
}

// ───────── Needs you: one case per card ─────────
let inboxFilter: 'all' | InboxItem['kind'] = (LS('kr8-v2-if') as 'all' | InboxItem['kind']) || 'all';
/** #inbox/case/<key>: the one case to scroll to and flash after the list paints */
let focusCase = '';
export function inboxView() {
  const help = helpSection(setHelpWaiting);   // 0097: created once per visit, so a half-typed reply survives the 30 s refresh
  const bugs = bugSection(setBugsWaiting);    // 0110: "Spot a bug" notes from View as member, one case per card
  const farm = farmSection();                 // 0123: Ring-farming check cards, top of Needs you
  void withSnap('inbox', (s) => {
    const { items, handled, preview } = buildInbox(s);
    const open = items.filter((i) => !hiddenKeys.has(i.key));
    if (inboxFilter !== 'all' && !open.some((i) => i.kind === inboxFilter)) inboxFilter = 'all';
    const shown = open.filter((i) => inboxFilter === 'all' || i.kind === inboxFilter);
    void loadPhotos(shown.flatMap((i) => i.people.map((p) => p.user_id))).then(paintPhotos);
    const count = (k: 'all' | InboxItem['kind']) => (k === 'all' ? open.length : open.filter((i) => i.kind === k).length);
    const chips = el('div', { class: 'v2chips v2ifl', id: 'v2InboxFilters', role: 'tablist' }, ...INBOX_FILTERS.map((f) => {
      const n = count(f.key);
      const b = el('button', { type: 'button', class: (inboxFilter === f.key ? 'on ' : '') + (n ? '' : 'zero'), 'data-f': f.key, role: 'tab', 'aria-selected': String(inboxFilter === f.key) },
        f.label, el('span', { class: 'n' }, String(n)));
      b.onclick = () => { inboxFilter = f.key; LS('kr8-v2-if', f.key); rerender?.(); };
      return b;
    }));
    const mb = morningCache || synthesizeMorningBrief(s, { items: open });
    const alerts = mb.alerts.filter((a) => !hiddenKeys.has('alert:' + a.id));
    const redN = alerts.filter((a) => a.severity === 'red').length;
    const filterName = INBOX_FILTERS.find((f) => f.key === inboxFilter)?.label || 'All';
    screen('inbox', header('Needs you', open.length + bugsWaiting ? `${open.length + bugsWaiting} decision${open.length + bugsWaiting === 1 ? '' : 's'}` : 'Inbox zero'),
      farm,
      // 6 alert boxes → one status line (opens to the same Alert centre)
      fold('v2AlertFold', foldHead(alerts.length ? `${alerts.length} robot alert${alerts.length === 1 ? '' : 's'}` : 'All robots OK', redN ? `${redN} broken` : alerts.length ? 'none broken' : '0 alerts', redN ? 'r' : alerts.length ? 'a' : 'g'),
        [renderAlertCentre(s, open)], 'lt-status'),
      help,
      bugs,
      open.length ? fold('v2FilterFold', foldHead(`Showing ${filterName.toLowerCase()} · ${shown.length}`, 'Filter'), [chips], 'lt-filter') : null,
      open.length || bugsWaiting ? null : el('div', { class: 'v2zero', id: 'v2Zero' }, ic('check'), el('b', {}, 'Nothing needs you'), el('span', {}, 'Everything else was handled automatically.')),
      el('div', { id: 'v2Inbox' }, ...shown.map((i) => inboxCard(i, open))),
      handledBox(handled, preview));
    if (focusCase) {
      const t = document.querySelector<HTMLElement>(`[data-item="${CSS.escape(focusCase)}"]`);
      focusCase = '';
      if (t) { t.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); t.classList.add('v2flash'); window.setTimeout(() => t.classList.remove('v2flash'), 1400); }
    }
  }, header('Needs you'));
}
const KIND_LABEL: Record<InboxItem['kind'], [string, string]> = { held: ['Money', 'r'], lookalike: ['Look-alike', 'a'], check: ['Face check', 'b'], reel: ['Reel', 'p'], reports: ['Reports', 'a'] };
function personRow(p: Person): HTMLElement {
  return el('a', { class: 'v2who', href: personLink(p), 'data-uid': p.user_id }, avatar(p, 52),
    el('div', { class: 'grow' }, el('b', {}, `${p.name || 'Member'} #${p.no ?? '–'}`), el('small', {}, `joined ${ago(p.joined_at)}`)));
}
function inboxCard(i: InboxItem, open?: InboxItem[]): HTMLElement {
  const [kl, kt] = KIND_LABEL[i.kind];
  const card = el('article', { class: `v2card v2item v2case t-${i.tone} k-${i.kind}`, 'data-item': i.key, id: 'case-' + i.key.replace(/[^a-zA-Z0-9_-]/g, '_') },
    el('div', { class: 'v2item-top' }, chip(kl, kt), el('small', { class: 'v2wait', title: `${both(i.at, true)}` }, i.kind === 'reports' ? 'open' : waitShort(i.at))),
    el('h3', { class: 'v2q' }, i.question));
  if (i.people.length) card.append(el('div', { class: 'v2whos' }, ...i.people.map(personRow)));
  if (i.what[0]) card.append(el('div', { class: 'v2what' }, i.what[0]));
  if (i.verdict) {
    const v = i.verdict;
    // the robot's reasons (and the second "what happened" line) sit behind the pill: one tap
    const restBox = el('div', { class: 'v2rest', hidden: true }, el('div', { class: 'v2flags' }, ...v.reasons.map((r) => chip(r, r.startsWith('+') ? 'g' : 'a'))),
      i.what[1] ? el('small', { class: 'v2sub' }, i.what[1]) : null);
    // 18 Nov: the decision in one plain sentence; the score is small faint detail
    const pill = el('button', { type: 'button', class: `v2pill ${v.tone}`, 'data-call': v.call, 'aria-expanded': 'false' }, ic('robot'), `Robot: ${v.call}`, el('small', { class: 'v2faint' }, ` · trust ${v.score}`));
    pill.onclick = () => { restBox.hidden = !restBox.hidden; pill.setAttribute('aria-expanded', String(!restBox.hidden)); };
    card.append(el('div', { class: 'v2verdict2' }, el('b', { class: `v2vsent ${v.tone}` }, `Robot says: ${verdictSentence(v)}`), pill, restBox));
  } else if (i.what[1]) card.append(el('small', { class: 'v2sub v2what2' }, i.what[1]));
  // 18 Nov (founder: "how do I decide if you don't show me the selfies"): every face decision shows the photos side by side, big
  if (i.kind === 'check' || i.kind === 'lookalike') card.append(comparePhotos(i));
  card.append(actions(i));
  const rel = (i.related || []).filter((k) => !hiddenKeys.has(k) && (!open || open.some((o) => o.key === k)));
  if (rel.length) {
    const b = el('button', { type: 'button', class: 'v2rel' }, `related: ${rel.length} more case${rel.length === 1 ? '' : 's'}`);
    b.onclick = () => {
      if (inboxFilter !== 'all') { inboxFilter = 'all'; rerender?.(); }
      window.setTimeout(() => {
        const t = document.querySelector<HTMLElement>(`[data-item="${CSS.escape(rel[0])}"]`);
        if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.classList.add('v2flash'); window.setTimeout(() => t.classList.remove('v2flash'), 1200); }
      }, 30);
    };
    card.append(b);
  }
  return card;
}

/** Big side-by-side photos for a face decision. Face check: card photo | live selfie. Look-alike: each person's card photo and selfie. */
function comparePhotos(i: InboxItem): HTMLElement {
  const box = el('div', { class: 'v2cmp', style: 'margin:10px 0 4px' }, el('small', { class: 'v2sub' }, 'Loading photos…'));
  const tile = (src: string | null | undefined, cap: string) => el('figure', { style: 'margin:0;flex:1;min-width:0' },
    src ? el('img', { src, alt: '', style: 'width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:14px;display:block' })
      : el('div', { style: 'width:100%;aspect-ratio:3/4;border-radius:14px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.06);font-size:13px;opacity:.7' }, 'No photo'),
    el('figcaption', { style: 'font-size:13px;margin-top:4px;opacity:.85;text-align:center' }, cap));
  const row = (...kids: HTMLElement[]) => el('div', { style: 'display:flex;gap:8px;margin-top:8px' }, ...kids);
  void (async () => {
    const ppl = i.people.slice(0, 2);
    await loadPhotos(ppl.map((p) => p.user_id));
    const faces = await Promise.all(ppl.map((p) => rpc<FaceCheck[]>('kr8_admin_v2_face_checks', { p_user: p.user_id, p_auto_only: false, p_limit: 3 }).catch(() => [] as FaceCheck[])));
    const signed = await signSelfies(faces.flat());
    const selfieOf = (k: number) => { const f = faces[k].find((x) => x.selfie_path && !x.selfie_deleted_at); return f?.selfie_path ? signed[f.selfie_path] : null; };
    const nm = (p: Person) => `#${p.no ?? '–'} ${p.name || ''}`.trim();
    if (i.kind === 'check') {
      box.replaceChildren(row(tile(photos.get(ppl[0].user_id), `${nm(ppl[0])} · profile photo`), tile(selfieOf(0), 'Live selfie (taken now)')),
        el('small', { class: 'v2sub', style: 'display:block;margin-top:6px' }, 'Same person in both? Real face (not a child, celebrity or a photo of a screen)? → Approve. Otherwise → Reject.'));
    } else {
      box.replaceChildren(
        row(tile(photos.get(ppl[0].user_id), `${nm(ppl[0])} · profile`), tile(selfieOf(0), `${nm(ppl[0])} · selfie`)),
        ppl[1] ? row(tile(photos.get(ppl[1].user_id), `${nm(ppl[1])} · profile`), tile(selfieOf(1), `${nm(ppl[1])} · selfie`)) : el('span', {}),
        el('small', { class: 'v2sub', style: 'display:block;margin-top:6px' }, 'Top row and bottom row the same human? → Same person (the newer account is hidden). Different humans → Different.'));
    }
  })().catch(() => box.replaceChildren(el('small', { class: 'v2sub' }, 'Photos could not load. Open the member to see them.')));
  return box;
}
function act(label: string, cls: string, id: string, fn: () => void): HTMLButtonElement {
  const b = el('button', { type: 'button', class: `v2btn ${cls}`, id }, label); b.onclick = fn; return b;
}
function actions(i: InboxItem): HTMLElement {
  const box = el('div', { class: 'v2acts v2acts2' });
  if (i.kind === 'held' && i.claims.length) {
    const c = i.claims[0];
    const refuseFirst = i.verdict?.call === 'REFUSE';
    box.append(act(`Pay ฿${c.amount}`, refuseFirst ? 'ok soft' : 'ok', 'v2Pay-' + c.id, () => later(i.key, `Paying ฿${c.amount} to ${who(c)}`, () => rpc('kr8_admin_release_claim', { p_claim: c.id }))),
      act('Refuse', refuseFirst ? 'bad solid' : 'bad', 'v2Refuse-' + c.id, () => later(i.key, 'Claim refused (member is not told why)', () => rpc('kr8_admin_refuse_claim', { p_claim: c.id, p_reason: 'One person, one account', p_return: false }))));
  } else if (i.kind === 'lookalike' && i.people.length > 1) {
    const [keep, ...others] = i.people;
    const otherIds = others.map((p) => p.user_id);
    const pair = `${keep.user_id}-${otherIds.join('-')}`;
    box.append(
      act('Same person', 'bad', `v2Same-${pair}`, () => later(i.key, `Kept #${keep.no}; ${others.map((p) => '#' + p.no).join(', ')} hidden`,
        () => rpc('kr8_admin_dup_resolve', { p_keep: keep.user_id, p_others: otherIds, p_action: 'hide' }))),
      act('Different', 'ok', `v2Diff-${pair}`, () => later(i.key, 'Marked as different people',
        () => rpc('kr8_admin_dup_resolve', { p_keep: keep.user_id, p_others: otherIds, p_action: 'not_same' }))));
  } else if (i.kind === 'check') {
    box.append(act('Approve', 'ok', 'v2Approve-' + i.checkIds[0], () => later(i.key, `${who(i.people[0])} verified`, () => rpc('kr8_admin_review_verification', { p_id: i.checkIds[0], p_approve: true }))),
      el('a', { class: 'v2btn bad', href: '#q/faces', id: 'v2Reject-' + i.checkIds[0] }, 'Reject…'));
  } else if (i.kind === 'reel') {
    box.append(act(i.reelIds.length > 1 ? `Approve all ${i.reelIds.length}` : 'Approve', 'ok', 'v2ReelOk-' + i.key, () => later(i.key, 'Approved', async () => { for (const id of i.reelIds) await rpc('kr8_admin_review_reel', { p_reel: id, p_status: 'approved' }); })),
      el('a', { class: 'v2btn', href: '#q/reels' }, 'Watch first'));
  } else if (i.kind === 'reports') box.append(el('a', { class: 'v2btn ok', href: '#q/reports' }, 'Open reports'));
  return box;
}
function dupUndoButton(h: Handled): HTMLElement | null {
  if (!h.undoDup || h.undone) return h.undone ? chip('undone', 'k') : null;
  const dupId = h.undoDup;
  const b = el('button', { type: 'button', class: 'v2btn ok v2undo-s', id: 'dupUndo-' + dupId }, 'Undo');
  b.onclick = () => later(h.key, 'Duplicate restored · ghost mode off', () => rpc('kr8_admin_dup_auto_undo', { p_dup: dupId, p_action: 'undo' }));
  return b;
}
function handledLine(h: Handled, tag?: HTMLElement | null): HTMLElement {
  return tap(el('div', { class: 'v2li v2hl', style: hiddenKeys.has(h.key) ? 'opacity:.4' : undefined, 'data-h': h.key }, ic('robot'),
    el('div', { class: 'grow' }, el('b', {}, h.text), el('small', {}, ago(h.at))), tag ?? dupUndoButton(h)), () => openHandledSheet(h));
}
/** "Handled automatically" — collapsed at the bottom of Needs you, one line per robot action, Undo where it can be undone */
function handledBox(handled: Handled[], preview: Handled[]): HTMLElement {
  return el('details', { class: 'v2card v2auto', id: 'v2AutoBox' },
    el('summary', {}, ic('robot'), el('b', { class: 'grow' }, `Handled automatically · ${handled.length}`), preview.length ? chip(`${preview.length} preview`, 'a') : null),
    preview.length ? el('div', { class: 'v2list', id: 'v2AutoPreview' }, ...preview.map((h) => handledLine(h, chip('preview', 'a')))) : null,
    el('div', { class: 'v2list' }, ...handled.slice(0, 40).map((h) => handledLine(h))),
    el('a', { class: 'v2more', href: '#auto' }, 'Full log →'));
}
export function autoView() {
  void withSnap('inbox', (s) => {
    const { handled, preview } = buildInbox(s);
    screen('inbox', header('Handled automatically', `${handled.length} things you did not have to touch`, '#inbox'),
      preview.length ? el('div', { class: 'v2sec', id: 'v2PreviewHd' }, `Handled automatically: preview · ${preview.length}`) : null,
      preview.length ? el('div', { class: 'v2sub', style: 'margin:-4px 2px 8px' }, 'Dry run of past data: the duplicate robot WOULD hide these accounts. Nobody is hidden until the sweep switch is on.') : null,
      preview.length ? el('div', { class: 'v2card v2list', id: 'v2Preview' }, ...preview.map((h) => tap(el('div', { class: 'v2li' }, ic('robot'),
        el('div', { class: 'grow' }, el('b', {}, h.text), el('small', {}, `${ago(h.at)} · ${both(h.at, true)}`)), chip('preview', 'a')), () => openHandledSheet(h)))) : null,
      el('div', { class: 'v2card v2list' }, ...handled.map((h) => {
        const undoBtn = h.undoDup && !h.undone
          ? el('button', { type: 'button', class: 'v2btn ok', id: 'dupUndo-' + h.undoDup, style: 'flex:0 0 auto;min-height:36px;padding:0 12px' }, 'Undo')
          : null;
        if (undoBtn && h.undoDup) {
          const dupId = h.undoDup;
          undoBtn.onclick = () => later(h.key, 'Duplicate restored · ghost mode off', () => rpc('kr8_admin_dup_auto_undo', { p_dup: dupId, p_action: 'undo' }));
        }
        return tap(el('div', { class: 'v2li', style: hiddenKeys.has(h.key) ? 'opacity:.4' : undefined },
          ic('robot'),
          el('div', { class: 'grow' }, el('b', {}, h.text), el('small', {}, `${ago(h.at)} · ${both(h.at, true)}`)),
          undoBtn || (h.undone ? chip('undone', 'k') : null)), () => openHandledSheet(h));
      })));
  }, header('Handled automatically', undefined, '#inbox'));
}

// ───────── People (looks like the member app's People tab, plus admin overlays) ─────────
let pFilter: PeopleFilter = (LS('kr8-v2-pf') as PeopleFilter) || 'all';
let pQuery = ''; let pRef = '';
let showRemoved = false;
let peopleFiltOpen = false;
export function peopleView() {
  void withSnap('people', (s) => {
    const list = filterPeople(s, pFilter, pQuery, pRef, false);
    const pc = peopleCounts(s);
    void loadPhotos([...list.map((p) => p.user_id), ...(showRemoved ? (s.extra?.removed || []).map((r) => r.user_id) : [])]).then(paintPhotos);
    const q = el('input', { type: 'search', id: 'v2Search', placeholder: 'Search name, #no, referrer, IG', value: pQuery, autocomplete: 'off' });
    q.oninput = () => { pQuery = q.value; const g = document.getElementById('v2Grid'); if (g) g.replaceWith(grid(s)); };
    const fb = (k: PeopleFilter, label: string) => { const b = el('button', { type: 'button', class: pFilter === k ? 'on' : '', id: 'pf-' + k }, label); b.onclick = () => { pFilter = k; LS('kr8-v2-pf', k); peopleView(); }; return b; };
    const refSel = el('select', { id: 'v2Ref', 'aria-label': 'Referrer' }, el('option', { value: '' }, 'Any referrer'), ...referrers(s).map((r) => el('option', { value: r, selected: r === pRef }, r)));
    refSel.onchange = () => { pRef = refSel.value; peopleView(); };
    const d0 = Date.parse(s.day_start);
    const rm = el('input', { type: 'checkbox', id: 'v2RemovedToggle', checked: showRemoved });
    rm.onchange = () => { showRemoved = rm.checked; peopleView(); };
    // filters, referrer and "Removed" are one tap away (⋯), not on screen all the time
    const active = pFilter !== 'all' || !!pRef || showRemoved;
    const panel = el('div', { class: 'v2filt', id: 'v2Filt', hidden: !peopleFiltOpen },
      el('div', { class: 'v2chips', role: 'tablist' }, fb('all', 'All'), fb('today', `New today · ${s.people.filter((p) => p.kind === 'real' && Date.parse(p.joined_at) >= d0).length}`),
        fb('unverified', 'Not verified'), fb('flagged', 'Flagged'), fb('claims', 'Has claims'), fb('nocard', 'No card')),
      el('div', { class: 'v2row2' }, refSel, el('label', { class: 'v2toggle' }, el('span', {}, `Removed (${pc.removed})`), rm, el('i', {}))));
    const fbtn = el('button', { type: 'button', class: `v2fbtn ${active ? 'on' : ''}`, id: 'v2FiltBtn', 'aria-label': 'Filters', 'aria-expanded': String(peopleFiltOpen) }, ic('more'));
    fbtn.onclick = () => { peopleFiltOpen = !peopleFiltOpen; panel.hidden = !peopleFiltOpen; fbtn.setAttribute('aria-expanded', String(peopleFiltOpen)); };
    screen('people', header('People', peopleHeadline(pc)),
      el('div', { class: 'v2srow' }, el('label', { class: 'v2search' }, ic('search'), q), fbtn),
      panel,
      grid(s));
  }, header('People'));
}
function grid(s: Snapshot): HTMLElement {
  const list = filterPeople(s, pFilter, pQuery, pRef, false);
  const g = groupPeople(list, s);
  const removed = showRemoved ? (s.extra?.removed || []) : [];
  const box = el('div', { id: 'v2Grid' });
  if (!list.length) box.append(el('div', { class: 'v2card v2sub' }, 'Nobody matches.'));
  // members with a real photo first (newest first), then "No photo yet", then "Signed up, no card" (filterPeople keeps newest first)
  if (g.photo.length) box.append(el('div', { class: 'v2grid', id: 'v2GridPhoto' }, ...g.photo.map((p) => pcard(p, s))));
  if (g.nophoto.length) box.append(el('div', { class: 'v2sec', id: 'v2SecNoPhoto' }, `No photo yet (${g.nophoto.length})`), el('div', { class: 'v2grid' }, ...g.nophoto.map((p) => pcard(p, s))));
  if (g.nocard.length) box.append(el('div', { class: 'v2sec', id: 'v2SecNoCard' }, `Signed up, no card (${g.nocard.length})`),
    el('div', { class: 'v2stack' }, ...g.nocard.map((p) => el('a', { class: 'v2card v2row', href: personLink(p), 'data-uid': p.user_id },
      el('span', { class: 'v2av none', style: 'width:36px;height:36px' }, (p.email_hint || '?').slice(0, 1)),
      el('div', { class: 'grow' }, el('b', {}, p.email_hint || 'No email'), el('div', { class: 'v2sub' }, `${p.kind === 'admin' ? 'Admin sign-in · ' : ''}signed in ${ago(p.joined_at)} · no card yet`)),
      p.kind === 'admin' ? chip('admin', 'k') : chip('no card', '')))));
  if (removed.length) box.append(el('div', { class: 'v2sec', id: 'v2SecRemoved' }, `Removed (${removed.length}) · demo & duplicates`),
    el('div', { class: 'v2stack' }, ...removed.map((r) => el('a', { class: 'v2card v2row v2gone', href: `#m/${r.user_id}`, 'data-uid': r.user_id },
      avatar({ user_id: r.user_id, name: r.name }, 36),
      el('div', { class: 'grow' }, el('b', {}, `${r.name || 'member'}${r.no != null ? ` #${r.no}` : ''}`), el('div', { class: 'v2sub' }, `joined ${ago(r.joined_at)}`)),
      chip(r.why === 'demo' ? 'demo' : 'duplicate', 'k')))));
  return box;
}
function pcard(p: Person, s: Snapshot): HTMLElement {
  const src = photos.get(p.user_id);
  const flags = personFlags(p, s.people, s.claims);
  const kindChip = p.kind === 'real' || noCard(p) ? null : chip(p.kind, 'k');
  const step = stepChip(p, s);
  const tt = !noCard(p) ? personTrust(p, s) : null;
  const tr = tt ? trustWords(tt) : null;
  return el('a', { class: `v2pc ${p.who === 'traveller' ? 'trav' : ''} ${flags.some((f) => f.tone === 'r') ? 'red' : ''}`, href: personLink(p), 'data-uid': p.user_id, 'data-who': p.who || 'local',
    title: `joined ${both(p.joined_at, true)} · ${p.ref ? `via ${p.ref}` : p.src ? `no referrer · came from ${p.src}` : 'no referrer'}` },
    el('span', { class: `v2pc-img ${src ? '' : 'none'}`, style: src ? `background-image:url("${src}")` : '' }, src ? '' : (p.name || p.email_hint || '?').slice(0, 1)),
    el('span', { class: 'v2pc-scrim' }),
    el('span', { class: 'v2pc-tl' }, el('b', {}, p.no != null ? `#${p.no}` : 'no card'), kindChip),
    el('span', { class: 'v2pc-tr' }, tr && tt ? tapIn(el('span', { class: `v2chip ${tr.tone}` }, tr.text, el('small', { class: 'v2faint' }, ` · ${tr.detail}`)), () => openTrustSheet(p, tt)) : null),
    el('span', { class: 'v2pc-info' },
      step ? el('span', { class: `v2step ${step.tone}`, 'data-step': step.key }, step.text) : null,
      el('b', { class: 'nm' }, p.name || p.email_hint || 'No name'),
      el('small', {}, p.kind === 'nocard' ? 'Signed in · no card yet' : `${p.who === 'traveller' ? 'Visiting' : 'Local'}${p.area ? ' · ' + p.area : ''} · ${ago(p.joined_at)}`),
      el('span', { class: 'v2pc-flags' },
        ...flags.filter((f) => ['lookalike', 'shared', 'board_off'].includes(f.key)).map((f) => whyChip(f.key === 'lookalike' ? '👥 ' + f.text.replace('Looks like ', '') : f.key === 'shared' ? '📶 shared' : '⛔ board off', f.tone, () => openFlagSheet(f.key, p))),
        p.claims?.held ? whyChip(`${p.claims.held} held claim${p.claims.held === 1 ? "" : "s"}`, "a", () => openClaimsSheet('Held claims', `${who(p)}'s prize claims the robot held for your decision.`, s.claims.filter((c) => c.user_id === p.user_id && c.held && c.status === 'pending'), 'held-' + p.user_id)) : null)));
}

// ───────── Member 360 ─────────
interface M360 {
  user_id: string; kind: string; trust?: Trust | null; card: null | { no: number; name: string; photo: string | null; who: string; area: string; bio: string | null; langs: string[] | null; interests: string[] | null;
    gender: string | null; ig: string | null; tt: string | null; verified: boolean; photo_check: string | null; ref: string | null; src: string | null; joined_at: string; last_active_at: string | null; age_ok_at: string | null; ghost: boolean };
  email_hint: string | null; signed_up_at: string | null; last_sign_in_at: string | null; line: boolean;
  consents: { terms_version: string | null; terms_at: string | null; promo_ok: boolean | null; promo_at: string | null; web_reels: boolean | null; web_reels_at: string | null; log: { at: string; version: string; kind: string; promo: boolean | null; source: string | null }[] };
  reels: { id: string; status: string; hidden: boolean; board_off: boolean; board_off_reason: string | null; likes: number; saves: number; shares: number; views: number; at: string; poster_path: string | null; note: string | null }[];
  rings_week: { likes: number | null; saves: number | null; opens: number | null; score: number | null } | null; board: { rank: number; rings: number } | null;
  rings_ledger: { at: string; delta: number; reason: string }[]; results: { week: string; rank: number; rings: number }[];
  claims: { id: string; brand: string; amount: number; status: Claim['status']; held: boolean; used: boolean; created_at: string; assigned_at: string | null; hold_reason: string | null; decided: string | null; decided_at: string | null }[];
  referrals: { user_id: string; no: number; name: string; joined_at: string }[];
  links: { user_id: string; no: number | null; name: string | null; reason: string; dist: number | null; at: string; dismissed: boolean }[];
  checks: { id: string; status: string; auto: string | null; reason: string | null; at: string; reviewed_at: string | null; by_admin: boolean }[];
  admin_log: { at: string; action: string }[];
}
export async function memberView(uid: string) {
  const body = el('div', {}, loadingCard());
  screen('people', header('Member', undefined, '#people'), body);
  stopV2();
  rerender = () => { if (location.hash === `#m/${uid}`) void memberView(uid); };   // an Approve / Hide / Pay in a sheet refreshes this page
  let m: M360;
  try { m = await rpc<M360>('kr8_admin_v2_member', { p_user: uid }); } catch (e) { body.replaceChildren(errorCard(e)); return; }
  const c = m.card;
  const snapP = snap?.people.find((p) => p.user_id === uid);
  const flags = snapP && snap ? personFlags(snapP, snap.people, snap.claims) : [];
  const tr: Trust | null = m.trust || (snapP && snap ? personTrust(snapP, snap) : null);
  const [urls, faces] = await Promise.all([
    signReelPaths(m.reels.map((r) => r.poster_path || '').filter(Boolean)).catch(() => ({} as Record<string, string>)),
    rpc<FaceCheck[]>('kr8_admin_v2_face_checks', { p_user: uid, p_auto_only: false, p_limit: 10 }).catch(() => [] as FaceCheck[]),
  ]);
  const selfies = await signSelfies(faces);
  // 18 Nov declutter: every section is one list row that opens; empty sections are not shown at all
  const sec = (title: string, n: number | string, ...kids: Kid[]) => fold(undefined, foldHead(title, String(n)), kids, 'v2m');
  const kv = (k: string, v: Kid) => el('div', { class: 'v2kv' }, el('span', {}, k), el('b', {}, v ?? '–'));
  const yes = (b: boolean | null | undefined) => (b ? 'Yes' : b === false ? 'No' : '–');
  // 18 Nov tap-all: a member claim as a snapshot Claim (so the claim sheet works here too)
  const asClaim = (x: M360['claims'][number]): Claim => snap?.claims.find((y) => y.id === x.id) || ({ ...x, user_id: uid, no: c?.no ?? null, name: c?.name ?? null, is_test: false,
    face_dist: null, joined_at: c?.joined_at ?? null, hold_others: null, prize: null } as Claim);
  const reelOf = (r: M360['reels'][number]) => ({ ...r, author: uid });
  const checkSheet = (v: M360['checks'][number]) => openSheet({ kind: 'check', id: v.id, title: `Face check ${v.status}`, who: [whoOf({ user_id: uid, no: c?.no ?? null, name: c?.name ?? null })],
    why: v.status === 'approved' ? `${c?.name || 'The member'}'s live selfie was approved${v.by_admin ? ' by you' : ' automatically'}.` : v.status === 'pending' ? 'This face check waits for your yes / no in Needs you.'
      : `${c?.name || 'The member'}'s face check was refused${v.reason ? `: ${v.reason.split('\n').pop()}` : ''}.`,
    evidence: [xrow('Taken', both(v.at, true)), v.reviewed_at ? xrow('Decided', both(v.reviewed_at, true)) : null],
    actions: [v.status === 'pending' ? xlink('Decide in Needs you', '#inbox/check', 'xCheckDecide', 'ok') : xlink('Face checks page (Reject / Undo)', '#faces', 'xCheckFaces')] });
  const timeline: { at: string; t: string; go: () => void }[] = [
    ...(c ? [{ at: c.joined_at, t: 'Joined' + (c.ref ? ` via ${c.ref}` : ''), go: () => openSheet({ kind: 'event', id: `${uid}:joined`, title: 'Joined Kring', who: [whoOf({ user_id: uid, no: c.no, name: c.name })],
      why: `${c.name} made a card ${ago(c.joined_at)}${c.ref ? ` using the invite / recruiter code ${c.ref}` : c.src ? `, coming from ${c.src}` : ' with no invite code'}.`, evidence: [xrow('Joined', both(c.joined_at, true))] }) }] : []),
    ...m.reels.map((r) => ({ at: r.at, t: `Posted a Reel (${r.hidden ? 'hidden' : r.status})`, go: () => openReelSheet(reelOf(r)) })),
    ...m.checks.map((v) => ({ at: v.at, t: `Face check ${v.status}${v.auto ? ` · robot said ${v.auto}` : ''}`, go: () => checkSheet(v) })),
    ...m.claims.map((x) => ({ at: x.created_at, t: `Claimed ฿${x.amount} ${x.brand} · ${claimChip({ ...x, user_id: uid } as unknown as Claim).text}`, go: () => openClaimSheet(asClaim(x)) })),
    ...m.links.map((l) => ({ at: l.at, t: `Linked to #${l.no}: ${linkVerdict(l).text}${l.dismissed ? ' · you said different people' : ''}`, go: () => { location.hash = `#m/${l.user_id}`; } })),
    ...m.admin_log.map((a) => ({ at: a.at, t: `Admin: ${a.action.replace(/_/g, ' ')}`, go: () => openSheet({ kind: 'event', id: `${uid}:${a.at}`, title: 'Done in admin',
      why: `Someone in admin did "${a.action.replace(/_/g, ' ')}" for this member.`, evidence: [xrow('When', both(a.at, true))] }) })),
    ...m.claims.filter((x) => x.decided_at).map((x) => ({ at: x.decided_at!, t: `You decided the held claim: ${x.decided}`, go: () => openClaimSheet(asClaim(x)) })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const liveReels = m.reels.filter((r) => r.status === 'approved' && !r.hidden).length;
  const paidThb = m.claims.filter((x) => x.status === 'assigned').reduce((n, x) => n + x.amount, 0);
  body.replaceChildren(
    // photo-first: the card photo full width with a soft fade, the name sits on the picture
    el('section', { class: 'v2hero lt-hero' },
      c?.photo ? el('img', { class: 'v2hero-img', src: c.photo, alt: '' }) : el('div', { class: 'v2hero-img none' }, (c?.name || '?').slice(0, 1)),
      el('div', { class: 'v2hero-info' },
        el('div', { class: 'v2flags' }, chip(c ? `#${c.no}` : 'no card', 'k'), m.kind !== 'real' ? chip(m.kind, 'a') : null,
          c?.verified ? chip('✓ verified', 'g') : chip('not verified', ''),
          tr ? tapIn(el('span', { class: `v2chip ${trustWords(tr).tone}`, id: 'v2MemberTrustChip' }, trustWords(tr).text, el('small', { class: 'v2faint' }, ` · ${trustWords(tr).detail}`)),
            () => openTrustSheet({ user_id: uid, no: c?.no ?? null, name: c?.name ?? null }, tr)) : null),
        el('h2', {}, c?.name || m.email_hint || 'Account without a card'),
        el('div', { class: 'v2sub' }, c ? `${c.who === 'traveller' ? 'Visiting' : 'Local'} · ${c.area || '–'} · joined ${ago(c.joined_at)}` : `Signed up ${ago(m.signed_up_at)}`,
          c?.ig ? el('a', { href: `https://instagram.com/${c.ig}`, target: '_blank', rel: 'noopener' }, ` · IG @${c.ig}`) : null))),
    flags.length && snapP ? el('div', { class: 'v2flags v2m-flags' }, ...flags.map((f) => whyChip(f.text, f.tone, () => openFlagSheet(f.key, snapP)))) : '',
    el('div', { class: 'v2stats lt-stats' },
      tap(el('div', { id: 'v2StatReels' }, el('b', {}, String(liveReels)), el('span', {}, 'live Reels')), () => document.querySelector('.v2reels')?.scrollIntoView({ behavior: 'smooth', block: 'center' })),
      tap(el('div', { id: 'v2StatRings' }, el('b', {}, m.board ? `#${m.board.rank}` : '–'), el('span', {}, `board · ${m.board?.rings ?? 0} Rings`)), () => openRingsSheet(uid, { no: c?.no ?? null, name: c?.name ?? null })),
      tap(el('div', { id: 'v2StatClaims' }, el('b', {}, `฿${paidThb}`), el('span', {}, `${m.claims.length} claims`)),
        () => openClaimsSheet('Claims', `Every prize claim by ${c?.name || 'this member'}. Tap one to see why it was paid, held or refused.`, m.claims.map(asClaim), 'm-' + uid))),
    m.reels.length ? el('div', { class: 'v2reels' }, ...m.reels.map((r) => tap(el('div', { class: 'v2reel', 'data-reel': r.id },
      r.poster_path && urls[r.poster_path] ? el('img', { src: urls[r.poster_path], alt: '' }) : el('span', { class: 'none' }),
      el('small', {}, r.hidden || r.status === 'hidden' ? '🙈 hidden' : r.status === 'pending' ? '⏳ waiting' : r.board_off ? '⛔ off board' : '✓ live'),
      el('small', {}, `♥${r.likes} 🔖${r.saves} ↗${r.shares} 👁${r.views}`)), () => openReelSheet(reelOf(r))))) : '',
    el('div', { class: 'lt-list' },
      tr ? sec('Trust score', `${trustWords(tr).text} · ${tr.score} / 100`,
        tr.reasons.length
          ? el('div', { class: 'v2kvs', id: 'v2MemberTrust' }, ...tr.reasons.map((r) => el('div', { class: 'v2kv' }, el('b', { style: 'text-align:left' }, r))))
          : el('div', { class: 'v2sub', id: 'v2MemberTrust' }, 'Neutral baseline (50) — no positive or negative signals yet.')) : '',
      sec('Rings this week', m.rings_week?.score ?? 0, el('div', { class: 'v2kvs', id: 'v2MemberRings' },
        ...([['Likes', String(m.rings_week?.likes ?? 0)], ['Saves', String(m.rings_week?.saves ?? 0)], ['Link opens', String(m.rings_week?.opens ?? 0)]] as [string, string][])
          .map(([k, v]) => tap(kv(k, v), () => openRingsSheet(uid, { no: c?.no ?? null, name: c?.name ?? null }))),
        kv('Past weeks', m.results.map((r) => `#${r.rank}`).join(', ') || '–')),
        tap(el('div', { class: 'v2li', id: 'v2RingsWho' }, el('div', { class: 'grow' }, el('b', {}, 'Who gave these Rings?'), el('small', {}, 'likes, saves and link opens — counted or not, and why')), ic('chev')),
          () => openRingsSheet(uid, { no: c?.no ?? null, name: c?.name ?? null }))),
      m.claims.length ? sec('Claims', m.claims.length, ...m.claims.map((x) => { const ch = claimChip({ ...x, user_id: uid } as unknown as Claim); return tap(el('div', { class: 'v2li', 'data-claim': x.id },
        el('div', { class: 'grow' }, el('b', {}, `฿${x.amount} ${x.brand}`), el('small', {}, `${both(x.created_at, true)}${c ? ` · ${Math.round((Date.parse(x.created_at) - Date.parse(c.joined_at)) / 60000)} min after joining` : ''}`)), chip(ch.text, ch.tone)),
        () => openClaimSheet(asClaim(x))); })) : '',
      m.links.length ? sec('Look-alikes & links', m.links.length, ...m.links.map((l) => { const w = linkVerdict(l); return el('a', { class: 'v2li', href: `#m/${l.user_id}` },
        el('div', { class: 'grow' }, el('b', {}, `#${l.no} ${l.name || ''}`), el('small', {}, `${l.dismissed ? 'You said different people' : w.text}`), w.faint ? el('small', { class: 'v2faint' }, w.faint) : null),
        chip(l.dismissed ? 'settled' : 'open', l.dismissed ? '' : w.tone)); })) : '',
      m.referrals.length ? sec('Brought in', m.referrals.length, ...m.referrals.map((r) => el('a', { class: 'v2li', href: `#m/${r.user_id}` }, el('div', { class: 'grow' }, el('b', {}, `#${r.no} ${r.name}`), el('small', {}, ago(r.joined_at)))))) : '',
      faces.length || m.checks.length ? sec('Face check', faces.length ? faceStatusWords(faces[0]) : m.checks[0].status,
        ...faces.map((f, i) => facePair(f, c?.photo || null, selfies, i === 0)),
        ...m.checks.map((v) => tap(el('div', { class: 'v2li' },
          el('div', { class: 'grow' }, el('b', {}, `${v.status}${v.auto ? ` · robot: ${v.auto}` : ''}`), el('small', {}, `${both(v.at, true)}${v.reason ? ' · ' + v.reason.split('\n').pop() : ''}`)),
          chip(v.by_admin ? 'by you' : v.reviewed_at ? 'auto' : 'waiting', '')), () => checkSheet(v)))) : '',
      sec('Timeline', timeline.length, ...timeline.slice(0, 40).map((t) => tap(el('div', { class: 'v2li tl' }, el('i', {}), el('div', { class: 'grow' }, el('b', {}, t.t), el('small', {}, `${ago(t.at)} · ${both(t.at, true)}`))), t.go))),
      sec('Account & consents', m.consents.terms_version || '–', el('div', { class: 'v2kvs' },
        kv('Terms', m.consents.terms_version ? `${m.consents.terms_version} · ${clock(m.consents.terms_at)}` : 'Not accepted'),
        kv('Promo use of content', yes(m.consents.promo_ok)), kv('Reels on the website', yes(m.consents.web_reels)), kv('18+ confirmed', c?.age_ok_at ? clock(c.age_ok_at) : '–'),
        kv('Joined', both(c?.joined_at || m.signed_up_at, true)), kv('Brought in', String(m.referrals.length)),
        kv('Sign-in', `${m.email_hint || '–'} · LINE ${m.line ? 'linked' : 'no'} · last ${ago(m.last_sign_in_at)}`)))));
}

// ───────── Money ─────────
export function moneyView() {
  void withSnap('money', (s) => {
    const m = money(s);
    const claims = s.claims.filter((c) => includeTest || !c.is_test);
    // 18 Nov tap-all: each tile opens the claims behind its number; each stock row opens its codes and who got them
    const w0 = Date.parse(s.week_start);
    const paid = claims.filter((c) => c.status === 'assigned');
    screen('money', header('Money', 'TrueMoney / Grab codes and every claim', '#more'),
      el('div', { class: 'v2kpis' },
        tap(el('div', { class: `v2kpi ${m.available < 5 ? 'hot' : ''}`, id: 'mAvail' }, el('b', {}, String(m.available)), el('span', {}, 'Codes left'), el('small', {}, `${m.assigned} given out`)), () => openStockSheet()),
        tap(el('div', { class: 'v2kpi', id: 'mWeek' }, el('b', {}, `฿${m.paidWeekThb}`), el('span', {}, 'Paid this week'), el('small', {}, `${m.paidWeekN} claims · since Mon (BKK)`)),
          () => openClaimsSheet('Paid this week', 'Prize codes sent since Monday (Bangkok time). Tap one to see who and why.', paid.filter((c) => Date.parse(c.assigned_at || c.created_at) >= w0), 'week')),
        tap(el('div', { class: `v2kpi ${m.heldN ? 'hot' : ''}`, id: 'mHeld' }, el('b', {}, `฿${m.heldThb}`), el('span', {}, 'Held'), el('small', {}, `${m.heldN} waiting for you`)),
          () => openClaimsSheet('Held claims', 'The robot held these claims because something looked like a second account. Tap one to see why, then Pay or Refuse.', claims.filter((c) => c.held && c.status === 'pending'), 'held')),
        tap(el('div', { class: 'v2kpi', id: 'mAll' }, el('b', {}, `฿${m.paidAllThb}`), el('span', {}, 'Paid in all'), el('small', {}, `${paid.length} claims`)),
          () => openClaimsSheet('Paid in all', 'Every prize code ever sent. Tap one to see who and why.', paid, 'all'))),
      el('div', { class: 'v2sec' }, 'Code stock'),
      el('div', { class: 'v2card v2list', id: 'mStock' }, ...s.codes.map((k) => tap(el('div', { class: 'v2li', 'data-stock': `${k.brand}:${k.amount}` }, el('div', { class: 'grow' }, el('b', {}, `${k.brand === 'truemoney' ? 'TrueMoney' : k.brand} ฿${k.amount}`),
        el('small', {}, `${k.assigned} given out${k.used ? ` · ${k.used} other` : ''}`)), el('span', { class: 'v2meter' }, el('i', { style: `width:${Math.round((k.available / Math.max(1, k.available + k.assigned)) * 100)}%` })), el('b', {}, `${k.available} left`)),
        () => openStockSheet(k.brand, k.amount))),
        el('a', { class: 'v2li', href: '#codes' }, el('div', { class: 'grow' }, el('b', {}, 'Add codes')), ic('chev'))),
      el('div', { class: 'v2sec' }, `Per member · ${m.byMember.length}`),
      el('div', { class: 'v2card v2list', id: 'mPer' }, ...m.byMember.map((r) => el('a', { class: 'v2li', href: r.p.user_id ? `#m/${r.p.user_id}` : '#money' },
        el('div', { class: 'grow' }, el('b', {}, who(r.p)), el('small', {}, `${r.n} claim${r.n === 1 ? '' : 's'}`)), el('b', {}, `฿${r.thb}`)))),
      el('div', { class: 'v2sec' }, `Every claim · ${claims.length}`),
      el('div', { class: 'v2card v2list', id: 'mClaims' }, ...claims.map((c) => { const ch = claimChip(c); const mins = c.joined_at ? Math.round((Date.parse(c.created_at) - Date.parse(c.joined_at)) / 60000) : null;
        return tapIn(el('a', { class: 'v2li', href: c.user_id ? `#m/${c.user_id}` : '#money', 'data-claim': c.id },
          el('div', { class: 'grow' }, el('b', {}, `${who(c)} · ฿${c.amount}`), el('small', {}, `${clock(c.created_at)} IST${mins != null ? ` · ${mins} min after joining` : ''}${c.prize?.kind ? ` · ${c.prize.kind}` : ''}`)), chip(ch.text, ch.tone)), () => openClaimSheet(c)); })),
      testToggle());
  }, header('Money', undefined, '#more'));
}

// ───────── Board ─────────
export function boardView() {
  void withSnap('board', (s) => {
    const byId = new Map(s.people.map((p) => [p.user_id, p]));
    void loadPhotos(s.board.rows.map((r) => r.user_id)).then(paintPhotos);
    const wk = new Date(s.board.week_start).toLocaleDateString('en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' });
    // the rules (week start, how many win, Rings to qualify) live behind ⓘ; each row: rank, face, name, Rings, one small line, only odd flags
    screen('board', header('Board', el('span', {}, `Ends ${weekLeft(s)}`, info(`Week from Mon ${wk} (Bangkok). Top ${s.board.paid_ranks} win a prize. ${s.board.floor} Rings to qualify. Tap a row for likes, saves and opens.`, 'v2BoardInfo')), '#more'),
      el('div', { class: 'lt-list', id: 'v2Board' }, ...s.board.rows.map((r) => {
        const p = byId.get(r.user_id);
        // 18 Nov tap-all: each chip opens why; the Rings number opens who gave them
        const fl = p ? [r.opens && !(r.likes || 0) && !(r.saves || 0) ? whyChip('opens only', 'a', () => openFlagSheet('opens_only', p)) : null,
          p.reels?.board_off ? whyChip('board off', 'a', () => openFlagSheet('board_off', p)) : null, p.links.length ? whyChip('look-alike', 'r', () => openFlagSheet('lookalike_board', p)) : null] : [];
        const line = r.rings < s.board.floor && r.rank <= s.board.paid_ranks ? `${s.board.floor - r.rings} Rings to qualify` : r.prize ? `prize ฿${r.prize.toLocaleString('en-US')}` : `#${r.no}`;
        return el('a', { class: 'v2li v2brow', href: `#m/${r.user_id}`, 'data-uid': r.user_id, title: `♥${r.likes ?? 0} · 🔖${r.saves ?? 0} · opens ${r.opens ?? 0}${r.is_new ? ' · new this week' : ''}` },
          el('span', { class: `v2rank ${r.rank <= 3 ? 'top' : ''}` }, String(r.rank)), avatar({ user_id: r.user_id, name: r.name }, 40),
          el('div', { class: 'grow' }, el('b', {}, r.name), el('small', {}, line), fl.some(Boolean) ? el('span', { class: 'v2flags' }, ...fl) : null),
          tapIn(el('b', { class: 'v2rings', id: 'v2Rings-' + r.user_id, title: 'Who gave these Rings' }, String(r.rings)), () => openRingsSheet(r.user_id, r)));
      })),
      el('a', { class: 'v2pri', href: '#week', id: 'v2WeekGo' }, 'Approve last week', ic('chev')));
    farmBoardMark(document.getElementById('v2Board'));   // 0123: "Ring-farming?" chip → the case
  }, header('Board', undefined, '#more'));
}

// ───────── Activity log ─────────
type Ev = { at: string; kind: string; auto: boolean; user_id: string | null; no: number | null; name: string | null; text: string; other_no: number | null };
let logFilter = 'all';
export async function logView() {
  const body = el('div', {}, loadingCard());
  screen('more', header('Activity log', 'Everything, newest first · India time', '#more'), body);
  stopV2();
  let ev: Ev[];
  try { ev = await rpc<Ev[]>('kr8_admin_v2_activity', { p_limit: 300, p_include_test: includeTest }); } catch (e) { body.replaceChildren(errorCard(e)); return; }
  const groups: [string, string, (e: Ev) => boolean][] = [['all', 'All', () => true], ['signup', 'Sign-ups', (e) => e.kind === 'signup'], ['money', 'Money', (e) => e.kind.startsWith('claim') || e.kind === 'hold_decided'],
    ['trust', 'Trust', (e) => ['check', 'check_done', 'link', 'link_dismissed'].includes(e.kind)], ['reel', 'Reels', (e) => e.kind.startsWith('reel')], ['you', 'By you', (e) => !e.auto]];
  const paint = () => {
    const f = groups.find((g) => g[0] === logFilter)![2];
    let day = '';
    const rows: HTMLElement[] = [];
    for (const e of ev.filter(f)) {
      const d = new Date(e.at).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
      if (d !== day) { day = d; rows.push(el('div', { class: 'v2sec' }, d)); }
      const evRow = el(e.user_id ? 'a' : 'div', { class: `v2li ev k-${e.kind}`, href: e.user_id ? `#m/${e.user_id}` : undefined },
        el('span', { class: `v2evdot ${e.auto ? 'auto' : 'you'}` }), el('div', { class: 'grow' }, el('b', {}, `${e.no != null ? `#${e.no} ${e.name || ''}` : 'Admin'} · ${e.text}${e.other_no ? ` #${e.other_no}` : ''}`),
          el('small', {}, `${clock(e.at, 'Asia/Kolkata', false)} IST · ${clock(e.at, 'Asia/Bangkok', false)} BKK · ${e.auto ? 'automatic' : 'by a person'}`)));
      rows.push(e.user_id ? evRow : tap(evRow, () => openSheet({ kind: 'event', id: `log:${e.at}:${e.kind}`, title: e.auto ? 'Done by a robot' : 'Done in admin',
        why: `${e.text}${e.other_no ? ` #${e.other_no}` : ''}.`, evidence: [xrow('When', both(e.at, true))] })));
    }
    body.replaceChildren(el('div', { class: 'v2chips' }, ...groups.map(([k, l]) => { const b = el('button', { type: 'button', class: logFilter === k ? 'on' : '', id: 'lf-' + k }, l); b.onclick = () => { logFilter = k; paint(); }; return b; })),
      el('div', { class: 'v2card v2list', id: 'v2Log' }, ...rows));
  };
  paint();
}

// ───────── Places (0086: members' places decide themselves; this is only to look, or to undo) ─────────
let plFilter = LS('kr8-v2-plf') || 'members';
let plQuery = '';
export async function placesView() {
  const body = el('div', {}, loadingCard());
  screen('more', header('Places', 'Added by members · decided automatically · tap to hide or restore', '#more'), body);
  stopV2();
  let rows: PlaceRow[] = [];
  const load = async () => {
    try { rows = await rpc<PlaceRow[]>('kr8_admin_places_list', { p_filter: plFilter, p_q: plQuery || null, p_limit: 300 }); paint(); }
    catch (e) { body.replaceChildren(errorCard(e)); }
  };
  const row = (p: PlaceRow): HTMLElement => {
    const key = 'place:' + p.id;
    const hide = p.status !== 'rejected';
    const btn = el('button', { type: 'button', class: `v2btn ${hide ? 'bad' : 'ok'}`, id: (hide ? 'plHide-' : 'plRestore-') + p.id, style: 'flex:0 0 auto;min-height:38px' }, hide ? 'Hide' : 'Restore');
    btn.onclick = () => later(key, hide ? `Hidden: ${p.name_en}` : `Restored: ${p.name_en}`, async () => { await rpc('kr8_admin_place_undo', { p_id: p.id, p_action: hide ? 'hide' : 'restore' }); await load(); });
    const map = !p.coords_rough ? el('a', { href: `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`, target: '_blank', rel: 'noopener', class: 'v2sub' }, 'Map')
      : el('a', { href: `https://www.google.com/maps/search/${encodeURIComponent(p.name_th || p.name_en)}`, target: '_blank', rel: 'noopener', class: 'v2sub' }, 'Search map');
    return tap(el('div', { class: 'v2li', 'data-place': p.id, style: hiddenKeys.has(key) ? 'opacity:.4' : undefined },
      el('div', { class: 'grow' }, el('b', {}, p.name_en), p.name_th && p.name_th !== p.name_en ? el('div', { class: 'v2sub' }, p.name_th) : null,
        el('small', {}, `${p.area} · ${p.by_no != null ? `#${p.by_no} ${p.by_name || ''} · ` : ''}${ago(p.created_at)} · on ${p.reels} Reel${p.reels === 1 ? '' : 's'} · `, map),
        el('span', { class: 'v2flags' }, ...placeFlags(p).map(([t, tone]) => chip(t, tone)))),
      btn), () => openPlaceSheet(p, () => void load()));
  };
  const paint = () => {
    const q = el('input', { type: 'search', id: 'plSearch', placeholder: 'Search place name', value: plQuery, autocomplete: 'off' });
    let t = 0;
    q.oninput = () => { clearTimeout(t); t = window.setTimeout(() => { plQuery = q.value.trim(); void load(); }, 300); };
    const chips: [string, string][] = [['members', 'Added by members'], ['hidden', 'Hidden / refused'], ['all', 'All places']];
    body.replaceChildren(
      el('label', { class: 'v2search' }, ic('search'), q),
      el('div', { class: 'v2chips' }, ...chips.map(([k, l]) => { const b = el('button', { type: 'button', class: plFilter === k ? 'on' : '', id: 'plf-' + k }, l); b.onclick = () => { plFilter = k; LS('kr8-v2-plf', k); void load(); }; return b; })),
      rows.length ? el('div', { class: 'v2card v2list', id: 'v2Places' }, ...rows.map(row)) : el('div', { class: 'v2card v2sub' }, 'No places here.'));
    if (plQuery) { q.focus(); (q as HTMLInputElement).setSelectionRange(plQuery.length, plQuery.length); }
  };
  rerender = () => paint();
  await load();
}

// ───────── Face checks (0089): selfie next to the card photo ─────────
/** 10-minute signed URLs from the PRIVATE kr8-verify bucket, signed with the admin's own sign-in (storage policy: kr8_is_admin()). */
async function signSelfies(fs: FaceCheck[]): Promise<Record<string, string>> {
  const paths = fs.map((f) => f.selfie_path).filter((x): x is string => !!x);
  if (!paths.length) return {};
  try {
    const { data } = await (await v5Client()).storage.from('kr8-verify').createSignedUrls(paths, 600);
    return Object.fromEntries((data || []).filter((d) => d.path && d.signedUrl).map((d) => [d.path as string, d.signedUrl as string]));
  } catch { return {}; }
}
function facePair(f: FaceCheck, photo: string | null, selfies: Record<string, string>, big = true): HTMLElement {
  const pic = (src: string | null | undefined, cap: string, empty: string) => el('figure', { class: 'v2fpic' },
    src ? el('img', { src, alt: '' }) : el('div', { class: 'none' }, empty), el('figcaption', {}, cap));
  const selfie = f.selfie_path ? selfies[f.selfie_path] : null;
  const tone = f.status === 'approved' ? 'g' : f.status === 'pending' ? 'a' : 'r';
  return el('div', { class: `v2face1 ${big ? '' : 'small'}`, 'data-face': f.id },
    el('div', { class: 'v2fpair' }, pic(photo, 'Card photo', 'No photo'),
      pic(selfie, 'Live selfie', f.selfie_deleted_at ? 'Deleted after 30 days' : f.selfie_path ? 'Could not load' : 'No selfie')),
    el('div', { class: 'v2flags' }, chip(faceStatusWords(f), tone), chip(f.auto ? 'auto' : f.status === 'pending' ? 'waiting' : 'manual', 'k'),
      f.live ? (() => { const w = selfieWords(f.live.match, /^sface/.test(f.live.model || '')); return el('span', { class: `v2chip ${w.tone}` }, w.text, w.faint ? el('small', { class: 'v2faint' }, ` · ${w.faint}`) : null); })() : null),
    el('small', { class: 'v2sub' }, `${both(f.at, true)}${f.reviewed_at ? ` · decided ${clock(f.reviewed_at)} IST` : ''}`),
    el('small', { class: 'v2sub' }, liveSteps(f.live)),
    f.reason && f.status === 'rejected' ? el('small', { class: 'v2sub' }, f.reason.split('\n').pop() || '') : null);
}
export async function facesView() {
  const body = el('div', {}, loadingCard());
  screen('more', header('Face checks', 'Auto-approved · newest first · straight + left + right passed', '#more'), body);
  stopV2();
  let rows: FaceCheck[] = [];
  let selfies: Record<string, string> = {};
  const load = async () => {
    try { rows = await rpc<FaceCheck[]>('kr8_admin_v2_face_checks', { p_user: null, p_auto_only: true, p_limit: 60 }); } catch (e) { body.replaceChildren(errorCard(e)); return; }
    selfies = await signSelfies(rows);
    await loadPhotos(rows.map((r) => r.user_id));
    paint();
  };
  const paint = () => {
    if (!rows.length) { body.replaceChildren(el('div', { class: 'v2card v2sub' }, 'No automatic face approvals yet.')); return; }
    body.replaceChildren(...rows.map((f) => {
      const key = 'face:' + f.id;
      const btn = f.status === 'approved'
        ? act('Reject', 'bad', 'faceReject-' + f.id, () => later(key, `Face check of ${who(f)} rejected · ${f.paid ? `${f.paid} paid code${f.paid === 1 ? '' : 's'} flagged` : 'member un-verified'}`,
            async () => { await rpc('kr8_admin_v2_face_reject', { p_id: f.id, p_reason: null }); await load(); }))
        : f.undo ? act('Undo reject', 'ok', 'faceUndo-' + f.id, () => later(key, `${who(f)} approved again`, async () => { await rpc('kr8_admin_v2_face_undo', { p_id: f.id }); await load(); })) : null;
      return el('section', { class: 'v2card', style: hiddenKeys.has(key) ? 'opacity:.4' : undefined },
        el('a', { class: 'v2row', href: `#m/${f.user_id}`, style: 'margin-bottom:10px;text-decoration:none;color:inherit' }, el('b', { class: 'grow' }, who(f)),
          f.paid ? chip(`฿ ${f.paid} paid${f.status === 'rejected' ? ' · flagged' : ''}`, f.status === 'rejected' ? 'r' : 'g') : null, ic('chev')),
        facePair(f, photos.get(f.user_id) || null, selfies),
        btn ? el('div', { class: 'v2acts' }, btn) : null);
    }));
  };
  rerender = () => paint();
  await load();
}

// ───────── Autopilot (0098 M1: More -> Autopilot) ─────────
async function flushQueuedStorageDeletions(): Promise<{ verifyRemoved: number; otherRemoved: number }> {
  let verifyRemoved = 0;
  let otherRemoved = 0;
  const cli = await v5Client();

  try {
    const due = await rpc<{ id: string; selfie_path: string }[]>('kr8_admin_verify_files_due');
    if (Array.isArray(due) && due.length > 0) {
      const paths = due.map((d) => d.selfie_path).filter(Boolean);
      const { error } = paths.length ? await cli.storage.from('kr8-verify').remove(paths) : { error: null };
      if (!error) {
        const n = await rpc<number>('kr8_admin_mark_selfies_deleted', { p_ids: due.map((d) => d.id) });
        verifyRemoved = typeof n === 'number' ? n : due.length;
      }
    }
  } catch { /* verify queue optional in offline unit tests */ }

  try {
    const trash = await rpc<{ id: string; bucket: string; name: string }[]>('kr8_admin_storage_trash');
    if (Array.isArray(trash) && trash.length > 0) {
      const byBucket = new Map<string, { id: string; name: string }[]>();
      for (const t of trash) {
        if (!t.bucket || !t.name) continue;
        const arr = byBucket.get(t.bucket) || [];
        arr.push({ id: t.id, name: t.name });
        byBucket.set(t.bucket, arr);
      }
      const doneIds: string[] = [];
      for (const [bucket, items] of byBucket) {
        const { error } = await cli.storage.from(bucket).remove(items.map((x) => x.name));
        if (!error) doneIds.push(...items.map((x) => x.id));
      }
      if (doneIds.length > 0) {
        const n = await rpc<number>('kr8_admin_storage_trash_done', { p_ids: doneIds });
        otherRemoved = typeof n === 'number' ? n : doneIds.length;
      }
    }
  } catch { /* general trash queue optional in offline unit tests */ }

  return { verifyRemoved, otherRemoved };
}

let apLogFilter = 'all';
let apShowMemberCopy = false;
const apOpen = new Set<string>();
export async function autopilotView() {
  apShowMemberCopy = false;
  const body = el('div', {}, loadingCard());
  screen('more', header('Autopilot', undefined, '#more'), body);
  stopV2();
  let st: AutopilotState = fallbackAutopilotState(snap);
  let hw: HealthWatchReport = fallbackHealthWatch(snap, st);
  let sf: SelfFixStatus = fallbackSelfFixStatus(snap, st);
  let pr: ProtectOverview = fallbackProtectOverview(snap, st);
  let gn: GrowthNudgesPreview = fallbackGrowthNudgesPreview(snap, st);
  let ai: AiSlotStatus = fallbackAiSlotStatus(st);
  let aiTestLine = '';

  const load = async () => {
    const t0 = Date.now();
    try {
      const [raw, rawHw, rawSf, rawPr, rawGn, rawAi] = await Promise.all([
        rpc<unknown>('kr8_admin_autopilot_state', { p_limit: 120 }),
        rpc<unknown>('kr8_admin_health_watch', { p_run: false }).catch(() => null),
        rpc<unknown>('kr8_admin_self_fix_status').catch(() => null),
        rpc<unknown>('kr8_admin_protect_overview').catch(() => null),
        rpc<unknown>('kr8_admin_growth_nudges_preview').catch(() => null),
        rpc<unknown>('kr8_admin_ai_slot_status').catch(() => null),
      ]);
      const elapsed = Date.now() - t0;
      st = isAutopilotState(raw) ? raw : fallbackAutopilotState(snap);
      hw = isHealthWatchReport(rawHw) ? rawHw : fallbackHealthWatch(snap, st, elapsed);
      sf = isSelfFixStatus(rawSf) ? rawSf : fallbackSelfFixStatus(snap, st);
      pr = isProtectOverview(rawPr) ? rawPr : fallbackProtectOverview(snap, st);
      gn = isGrowthNudgesPreview(rawGn) ? rawGn : fallbackGrowthNudgesPreview(snap, st);
      ai = isAiSlotStatus(rawAi) ? rawAi : fallbackAiSlotStatus(st);
    } catch {
      st = fallbackAutopilotState(snap);
      hw = fallbackHealthWatch(snap, st);
      sf = fallbackSelfFixStatus(snap, st);
      pr = fallbackProtectOverview(snap, st);
      gn = fallbackGrowthNudgesPreview(snap, st);
      ai = fallbackAiSlotStatus(st);
    }
    snapAt = Date.now();
    const freshEl = document.getElementById('v2Fresh');
    if (freshEl) freshEl.textContent = 'Updated 0s ago';
    paint();
  };

  const renderRobot = (r: RobotRow): HTMLElement => {
    const cap = capStatus(r);
    const dryOnly = r.dry_run_only || r.name === 'growth_nudges';
    const effMode: RobotMode = st.paused ? 'off' : r.mode;
    const tone = modeTone(r.mode, st.paused);
    const modes: RobotMode[] = ['off', 'dry_run', 'on'];

    const seg = el('div', { class: 'ap-seg', role: 'group', 'aria-label': `${r.title} mode` },
      ...modes.map((m) => {
        const blockedOn = dryOnly && m === 'on';
        const btn = el('button', {
          type: 'button',
          id: `apMode-${r.name}-${m}`,
          class: r.mode === m ? `on m-${m}` : '',
          disabled: blockedOn || st.fallback,
          title: blockedOn ? 'Growth nudges stay DRY-RUN until approved' : undefined,
        }, blockedOn ? 'ON (locked)' : modeLabel(m));
        btn.onclick = async () => {
          if (r.mode === m || blockedOn) return;
          btn.disabled = true;
          try {
            await rpc('kr8_admin_robot_set', { p_name: r.name, p_mode: m, p_daily_cap: r.daily_cap });
            toast(`${r.title} set to ${modeLabel(m)}`);
            await load();
          } catch (e) {
            btn.disabled = false;
            toast(`Could not update ${r.title}: ${(e as Error).message}`);
          }
        };
        return btn;
      }));

    const capInput = el('input', {
      type: 'number',
      id: `apCap-${r.name}`,
      class: 'ap-cap-in',
      min: '0',
      max: '10000',
      value: String(r.daily_cap),
      disabled: !!st.fallback,
      'aria-label': `${r.title} daily cap`,
    });
    const capSave = el('button', {
      type: 'button',
      id: `apCapSave-${r.name}`,
      class: 'ap-mini-btn',
      disabled: !!st.fallback,
    }, 'Save cap');
    capSave.onclick = async () => {
      const nextCap = Math.max(0, Math.min(10000, Math.round(Number(capInput.value) || 0)));
      capSave.disabled = true;
      try {
        await rpc('kr8_admin_robot_set', { p_name: r.name, p_mode: r.mode, p_daily_cap: nextCap });
        toast(`${r.title} daily cap set to ${nextCap}`);
        await load();
      } catch (e) {
        capSave.disabled = false;
        toast(`Could not save cap: ${(e as Error).message}`);
      }
    };

    const runBtn = el('button', {
      type: 'button',
      id: `apRun-${r.name}`,
      class: 'ap-mini-btn',
      disabled: st.paused || !!st.fallback,
    }, 'Run check');
    runBtn.onclick = async () => {
      runBtn.disabled = true;
      runBtn.textContent = 'Running…';
      try {
        await rpc('kr8_admin_robot_run_now', { p_name: r.name });
        toast(`${r.title} check finished`);
        await load();
      } catch (e) {
        runBtn.disabled = false;
        runBtn.textContent = 'Run check';
        toast(`Check failed: ${(e as Error).message}`);
      }
    };

    const lastLine = r.last_run
      ? `Last run ${ago(r.last_run)} (${clock(r.last_run)} IST) · ${r.last_ok === false ? 'error' : 'OK'}${r.last_note ? ` · ${r.last_note}` : ''}`
      : 'Never run yet';

    return el('article', { class: `v2card ap-robot ${st.paused ? 'paused' : ''}`, 'data-robot': r.name },
      el('div', { class: 'ap-robot-hd' },
        el('div', { class: 'grow' },
          el('div', { class: 'ap-title-row' },
            el('b', {}, r.title),
            chip(st.paused ? `PAUSED (${modeLabel(r.mode)})` : modeLabel(effMode), tone),
            chip(scheduleWords(r.schedule), '')),
          el('p', { class: 'ap-note' }, r.note)),
      ),
      seg,
      el('div', { class: 'ap-meta' },
        el('span', { class: `ap-cap-stat ${cap.atCap ? 'hot' : cap.nearCap ? 'warn' : ''}` }, cap.text),
        el('div', { class: 'ap-cap-edit' },
          el('label', { for: `apCap-${r.name}` }, 'Cap/day'),
          capInput,
          capSave,
          runBtn)),
      el('small', { class: `ap-last ${r.last_ok === false ? 'bad' : ''}` }, lastLine));
  };

  const renderLogRow = (l: RobotLogRow): HTMLElement => {
    const key = `aplog:${l.id}`;
    const undoBtn = l.can_undo && !l.undone_at
      ? el('button', { type: 'button', class: 'v2btn ok ap-undo', id: `apUndo-${l.id}` }, 'Undo')
      : null;
    if (undoBtn) {
      undoBtn.onclick = () => later(key, `Undoing ${l.robot}: ${l.action.replace(/_/g, ' ')}`, async () => {
        await rpc('kr8_admin_robot_undo', { p_log_id: l.id });
        await load();
      });
    }
    return tap(el('div', { class: 'v2li ap-log-row', 'data-log': String(l.id), style: hiddenKeys.has(key) ? 'opacity:.4' : undefined },
      ic('robot'),
      el('div', { class: 'grow' },
        el('div', { class: 'ap-log-top' },
          chip(l.dry_run ? 'DRY-RUN' : 'APPLIED', l.dry_run ? 'a' : 'g'),
          l.undone_at ? chip('undone', 'k') : null),
        el('b', {}, formatRobotLogLine(l)),
        el('small', {}, `${ago(l.at)} · ${both(l.at, true)}`)),
      undoBtn), () => openSheet({ kind: 'robotlog', id: String(l.id), title: l.dry_run ? 'Robot preview (nothing changed)' : 'What the robot did',
        why: formatRobotLogLine(l), evidence: [xrow(`${l.robot.replace(/_/g, ' ')} robot`, `${ago(l.at)} · ${both(l.at, true)}`), ...detailLines(l.detail || undefined).map((t) => el('small', { class: 'xs-line' }, t))],
        actions: [l.can_undo && !l.undone_at ? xbtn('Undo', 'ok', 'xLogUndo', closeThen(() => later(key, `Undoing ${l.robot}: ${l.action.replace(/_/g, ' ')}`, async () => { await rpc('kr8_admin_robot_undo', { p_log_id: l.id }); await load(); }))) : null,
          l.target && /^[0-9a-f-]{36}$/i.test(l.target) && personOf(l.target) ? xlink('Open member', `#m/${l.target}`, 'xLogMember') : null] }));
  };

  const paint = () => {
    const hb = heartbeatSummary(st);
    const killBtn = el('button', {
      type: 'button',
      id: 'apKillBtn',
      class: `v2btn ${st.paused ? 'ok' : 'bad'} ap-kill-btn`,
      disabled: !!st.fallback,
    }, st.paused ? 'Resume robots' : 'Pause all robots');
    killBtn.onclick = async () => {
      killBtn.disabled = true;
      const nextPaused = !st.paused;
      try {
        await rpc('kr8_admin_pause_all_robots', { p_pause: nextPaused });
        toast(nextPaused ? 'All robots paused immediately' : 'Robots resumed (each keeps its own ON / DRY-RUN / OFF mode)');
        await load();
      } catch (e) {
        killBtn.disabled = false;
        toast(`Kill switch failed: ${(e as Error).message}`);
      }
    };

    const killCard = el('section', { class: `ap-kill lt-kill ${st.paused ? 'is-paused' : ''}`, id: 'apKillSwitch' },
      el('div', { class: 'ap-kill-info' },
        el('b', {}, st.paused ? 'All robots are PAUSED' : 'Master kill switch'),
        info(st.paused
          ? 'Every scheduled check, self-fix, and automatic duplicate action is halted until you tap Resume.'
          : 'One tap halts every robot immediately. Money, bans, and claim refusals already require your tap.')),
      killBtn);

    const hbCard = el('section', { class: `v2card ap-hb ${hb.tone}`, id: 'apHeartbeat' },
      el('div', { class: 'v2row' },
        ic('shield'),
        el('div', { class: 'grow' },
          el('b', {}, hb.headline),
          el('div', { class: 'v2sub' }, st.heartbeats.length
            ? st.heartbeats.map((h) => `${h.job.replace(/^kr8_/, '')}: ${h.last_beat ? ago(h.last_beat) : 'waiting'}`).join(' · ')
            : 'No heartbeats registered yet'))));

    const passCount = hw.checks.filter((c) => c.ok).length;
    const hwRunBtn = el('button', {
      type: 'button',
      id: 'apHealthRunBtn',
      class: 'ap-mini-btn',
      disabled: st.paused,
    }, 'Run all 8 checks');
    hwRunBtn.onclick = async () => {
      hwRunBtn.disabled = true;
      hwRunBtn.textContent = 'Probing…';
      const t0 = Date.now();
      let authOk = true;
      let storageOk = true;
      try {
        const cli = await v5Client();
        const sess = await cli.auth.getSession();
        authOk = !sess.error;
        const stProbe = await cli.storage.from('kr8-ask').list('', { limit: 1 });
        storageOk = !stProbe.error;
      } catch {
        /* client probe optional in unit tests */
      }
      const rpcMs = Date.now() - t0;
      try {
        const res = await rpc<unknown>('kr8_admin_health_watch', {
          p_run: true,
          p_client_probe: { auth_ok: authOk, storage_ok: storageOk, rpc_ms: rpcMs },
        });
        if (isHealthWatchReport(res)) hw = res;
        toast(hw.all_ok ? 'All 8 health checks green' : 'Health check found broken item(s) — see red alerts');
        await load();
      } catch (e) {
        hwRunBtn.disabled = false;
        hwRunBtn.textContent = 'Run all 8 checks';
        toast(`Health check failed: ${(e as Error).message}`);
      }
    };

    const healthCard = el('section', { class: `v2card ap-health ${hw.all_ok ? 'ok' : 'bad'}`, id: 'apHealthCard' },
      el('div', { class: 'ap-health-hd' },
        ic('check'),
        el('div', { class: 'grow' },
          el('b', {}, `Health watch · ${passCount}/${hw.checks.length} green`),
          el('small', {}, `Every 15 min · red alert on failure · auto-clears when fixed · checked ${ago(hw.at)}`)),
        hwRunBtn),
      el('div', { class: 'ap-health-grid', id: 'apHealthGrid' },
        ...hw.checks.map((c) => el('div', { class: `ap-hitem ${c.ok ? 'ok' : 'bad'}`, 'data-hkey': c.key },
          el('div', { class: 'ap-hitem-top' },
            chip(c.ok ? 'OK' : 'FAIL', c.ok ? 'g' : 'r'),
            el('b', {}, c.title),
            c.ms != null ? el('small', { class: 'ap-hms' }, `${c.ms} ms`) : null),
          el('small', { class: 'ap-hsum' }, c.summary)))));

    const totalTrashQueued = sf.pdpa_queued + sf.other_trash_queued;
    const stuckTotal = sf.stuck_geo + sf.stuck_push;
    const lowStock = sf.available_vouchers <= sf.restock_warn_at;
    const buyUrl = sf.voucher_buy_url || DEFAULT_VOUCHER_BUY_URL;

    const flushBtn = el('button', {
      type: 'button',
      id: 'apFlushTrashBtn',
      class: `ap-mini-btn ${sf.pdpa_late > 0 ? 'bad' : ''}`,
      disabled: st.paused,
    }, totalTrashQueued > 0 ? `Flush queued deletions (${totalTrashQueued})` : 'Flush queued deletions');
    flushBtn.onclick = async () => {
      flushBtn.disabled = true;
      flushBtn.textContent = 'Flushing…';
      try {
        const { verifyRemoved, otherRemoved } = await flushQueuedStorageDeletions();
        await rpc('kr8_admin_robot_run_now', { p_name: 'self_fix' }).catch(() => null);
        toast(`Flushed ${verifyRemoved + otherRemoved} queued storage deletion(s)`);
        await load();
      } catch (e) {
        flushBtn.disabled = false;
        flushBtn.textContent = 'Flush queued deletions';
        toast(`Storage flush failed: ${(e as Error).message}`);
      }
    };

    const sfRunBtn = el('button', {
      type: 'button',
      id: 'apSelfFixRunBtn',
      class: 'ap-mini-btn',
      disabled: st.paused || !!st.fallback,
    }, sf.mode === 'on' ? 'Run self-fix now' : 'Preview self-fix (DRY-RUN)');
    sfRunBtn.onclick = async () => {
      sfRunBtn.disabled = true;
      sfRunBtn.textContent = 'Running…';
      try {
        await rpc('kr8_admin_robot_run_now', { p_name: 'self_fix' });
        toast(sf.mode === 'on' ? 'Self-fix applied safe tasks' : 'Self-fix DRY-RUN logged what it would fix');
        await load();
      } catch (e) {
        sfRunBtn.disabled = false;
        sfRunBtn.textContent = sf.mode === 'on' ? 'Run self-fix now' : 'Preview self-fix (DRY-RUN)';
        toast(`Self-fix check failed: ${(e as Error).message}`);
      }
    };

    const sfStat = (id: string, val: string, title: string, sub: string, tone: '' | 'hot' | 'warn' = '') =>
      el('div', { class: `ap-sf-stat ${tone}`, id },
        el('b', {}, val),
        el('span', {}, title),
        el('small', {}, sub));

    const selfFixCard = el('section', { class: `v2card ap-selffix ${sf.pdpa_late > 0 ? 'late' : ''}`, id: 'apSelfFixCard' },
      el('div', { class: 'ap-health-hd' },
        ic('robot'),
        el('div', { class: 'grow' },
          el('b', {}, `Self-fix & PDPA queue · ${modeLabel(sf.mode)}`),
          el('small', {}, `Every 30 min · safe fixes only · PDPA SLA ${sf.pdpa_sla_hours}h · restock alert <= ${sf.restock_warn_at} vouchers`)),
        chip(sf.pdpa_late > 0 ? `${sf.pdpa_late} PDPA LATE` : 'PDPA on time', sf.pdpa_late > 0 ? 'r' : 'g')),
      el('div', { class: 'ap-sf-grid' },
        sfStat(
          'sfPdpa',
          sf.pdpa_late > 0 ? `${sf.pdpa_late} late` : `${sf.pdpa_queued} due`,
          'PDPA deletions',
          sf.pdpa_late > 0 ? `Oldest ${sf.oldest_queued_hours}h (> ${sf.pdpa_sla_hours}h SLA)` : `0 overdue · ${sf.other_trash_queued} media trash`,
          sf.pdpa_late > 0 ? 'hot' : '',
        ),
        sfStat(
          'sfOrphans',
          String(sf.orphan_candidates),
          'Orphan files',
          'Uploads >24h with no DB row',
          sf.orphan_candidates > 0 ? 'warn' : '',
        ),
        sfStat(
          'sfThreads',
          String(sf.stale_threads),
          'Stale threads',
          `Pending >14d · ${sf.stale_holds} held >24h`,
          sf.stale_threads > 0 ? 'warn' : '',
        ),
        sfStat(
          'sfStuck',
          String(stuckTotal),
          'Stuck jobs',
          `${sf.stuck_geo} geocode · ${sf.stuck_push} push`,
          stuckTotal > 0 ? 'warn' : '',
        ),
        sfStat(
          'sfStock',
          String(sf.available_vouchers),
          'Vouchers left',
          lowStock ? `LOW (<= ${sf.restock_warn_at}) · restock now` : `Healthy (> ${sf.restock_warn_at})`,
          sf.available_vouchers <= 2 ? 'hot' : lowStock ? 'warn' : '',
        ),
        sfStat(
          'sfSafety',
          '0 auto-bans',
          'Money & bans',
          'Held claims stay founder-only',
        )),
      el('div', { class: 'ap-sf-acts' },
        sfRunBtn,
        flushBtn,
        el('a', {
          class: `ap-mini-btn ap-buy-link ${lowStock ? 'on' : ''}`,
          id: 'apBuyVouchersLink',
          href: buyUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
        }, lowStock ? `Restock vouchers (${sf.available_vouchers} left) ↗` : 'Buy vouchers link ↗'),
        el('a', { class: 'ap-mini-btn', href: '#codes' }, 'Paste codes →')));

    const prRunBtn = el('button', {
      type: 'button',
      id: 'apProtectRunBtn',
      class: 'ap-mini-btn',
      disabled: st.paused || !!st.fallback,
    }, pr.mode === 'on' ? 'Scan flags now' : 'Preview protect (DRY-RUN)');
    prRunBtn.onclick = async () => {
      prRunBtn.disabled = true;
      prRunBtn.textContent = 'Scanning…';
      try {
        await rpc('kr8_admin_robot_run_now', { p_name: 'protect' });
        toast('Protect scan complete (0 auto-bans — flags updated)');
        await load();
      } catch (e) {
        prRunBtn.disabled = false;
        prRunBtn.textContent = pr.mode === 'on' ? 'Scan flags now' : 'Preview protect (DRY-RUN)';
        toast(`Protect scan failed: ${(e as Error).message}`);
      }
    };

    const visibleFlags = pr.flags.filter((f) => !hiddenKeys.has(`pflag:${f.user_id}:${f.flag_key}`));
    const protectCard = el('section', { class: 'v2card ap-protect', id: 'apProtectCard' },
      el('div', { class: 'ap-health-hd' },
        ic('shield'),
        el('div', { class: 'grow' },
          el('b', {}, `Protect flags · ${modeLabel(pr.mode)}`),
          el('small', {}, 'Every 15 min · feeds trust score · auto-hides >= 3 reports (undoable) · NEVER auto-bans')),
        chip(`${visibleFlags.length} active`, visibleFlags.some((f) => f.severity === 'red') ? 'r' : visibleFlags.length > 0 ? 'a' : 'g')),
      el('div', { class: 'ap-sf-grid' },
        sfStat('pfScam', String(pr.counts.scam_chat), 'Scam / LINE chat', 'Money / crypto / LINE hunt', pr.counts.scam_chat > 0 ? 'hot' : ''),
        sfStat('pfLinks', String(pr.counts.link_tries), 'Blocked links', 'Repeated link attempts', pr.counts.link_tries > 0 ? 'warn' : ''),
        sfStat('pfFarm', String(pr.counts.ring_farming), 'Ring farming', 'Pairs liking only each other', pr.counts.ring_farming > 0 ? 'warn' : ''),
        sfStat('pfShared', String(pr.counts.shared_signals), 'Shared signals', 'Same face / phone / Wi-Fi', pr.counts.shared_signals > 0 ? 'warn' : ''),
        sfStat('pfReports', String(pr.counts.reported_posts_3plus), '>= 3 reports', 'Auto-hide + you decide', pr.counts.reported_posts_3plus > 0 ? 'warn' : ''),
        sfStat('pfPolicy', 'Founder taps', 'Ban policy', 'Robots never ban')),
      visibleFlags.length > 0
        ? el('div', { class: 'ap-protect-list', id: 'apProtectFlags' },
            ...visibleFlags.slice(0, 6).map((f) => {
              const pkey = `pflag:${f.user_id}:${f.flag_key}`;
              const dismissBtn = el('button', {
                type: 'button',
                class: 'ap-mini-btn',
                id: `pfDismiss-${f.user_id}-${f.flag_key}`,
              }, 'Dismiss');
              dismissBtn.onclick = () => later(pkey, `Dismissed ${flagKeyLabel(f.flag_key)} flag for #${f.member_no ?? '?'}`, async () => {
                await rpc('kr8_admin_protect_dismiss', { p_user: f.user_id, p_flag_key: f.flag_key });
                await load();
              });
              const whoText = `#${f.member_no ?? '?'} · ${flagKeyLabel(f.flag_key)}`;
              // 18 Nov: words first (the trust number and the robot's raw summary are faint detail)
              const tw = f.trust ? trustWords(f.trust) : null;
              const trustText = tw ? tw.text : '';
              return el('div', { class: `ap-pflag sev-${f.severity}`, 'data-flag': `${f.user_id}:${f.flag_key}` },
                el('div', { class: 'grow' },
                  el('div', { class: 'ac-tags' },
                    chip(f.severity === 'red' ? 'High risk' : f.severity === 'amber' ? 'Warning' : 'Signal', f.severity === 'red' ? 'r' : f.severity === 'amber' ? 'a' : 'k'),
                    trustText && tw ? chip(trustText, tw.tone) : null),
                  el('b', {}, whoText),
                  el('small', {}, flagSentence({ no: f.member_no, name: f.name, flag_key: f.flag_key, summary: f.summary, detail: f.detail, partner_name: personOf(String(f.detail?.partner_id || ''))?.name })),
                  el('small', { class: 'v2faint' }, `${f.summary}${tw ? ` · ${tw.detail}` : ''}`)),
                el('div', { class: 'ap-pflag-acts' },
                  el('a', { class: 'ap-mini-btn', href: `#m/${f.user_id}` }, 'Member →'),
                  dismissBtn));
            }))
        : el('div', { class: 'v2sub', style: 'margin-top:10px' }, 'No active scam-chat, Ring-farming, or repeated link-try flags.'),
      pr.reported_posts.length > 0
        ? el('div', { class: 'ap-protect-list', id: 'apProtectPosts' },
            ...pr.reported_posts.map((rp) =>
              el('div', { class: 'ap-pflag sev-amber' },
                el('div', { class: 'grow' },
                  el('b', {}, `${rp.kind.toUpperCase()} by #${rp.member_no ?? '?'} · ${rp.reporters} reports`),
                  el('small', {}, rp.hidden ? 'Auto-hidden temporarily (Undo in Robot action log below · decide in Needs you)' : 'DRY-RUN: would auto-hide at >= 3 reports')),
                el('a', { class: 'ap-mini-btn', href: '#inbox' }, 'Decide →'))))
        : null,
      el('div', { class: 'ap-sf-acts' },
        prRunBtn,
        el('a', { class: 'ap-mini-btn', href: '#inbox' }, 'Open Needs you →')));

    const totalWouldReach = gn.cohorts.reduce((n, c) => n + c.would_send_count, 0);
    const toggleCopyBtn = el('button', {
      type: 'button',
      id: 'apGrowthToggleCopyBtn',
      class: 'ap-mini-btn',
    }, apShowMemberCopy ? 'Hide TH + EN member copy' : 'Show TH + EN copy for approval');
    toggleCopyBtn.onclick = () => {
      apShowMemberCopy = !apShowMemberCopy;
      paint();
    };

    const gnRunBtn = el('button', {
      type: 'button',
      id: 'apGrowthRunBtn',
      class: 'ap-mini-btn',
      disabled: st.paused || !!st.fallback,
    }, 'Log DRY-RUN preview');
    gnRunBtn.onclick = async () => {
      gnRunBtn.disabled = true;
      gnRunBtn.textContent = 'Previewing…';
      try {
        await rpc('kr8_admin_robot_run_now', { p_name: 'growth_nudges' });
        toast('Growth nudges DRY-RUN logged (0 messages sent to members)');
        await load();
      } catch (e) {
        gnRunBtn.disabled = false;
        gnRunBtn.textContent = 'Log DRY-RUN preview';
        toast(`Preview failed: ${(e as Error).message}`);
      }
    };

    const growthCard = el('section', { class: 'v2card ap-growth', id: 'apGrowthCard' },
      el('div', { class: 'ap-health-hd' },
        ic('robot'),
        el('div', { class: 'grow' },
          el('b', {}, 'Growth nudges · DRY-RUN ONLY'),
          el('small', {}, `0 messages sent · would reach ${totalWouldReach} across 4 cohorts · locked until founder approves`)),
        chip('0 SENT (DRY-RUN)', 'a')),
      el('div', { class: 'ap-glist', id: 'apGrowthCohorts' },
        ...gn.cohorts.map((c) => {
          const sampleTxt = c.sample_nos.length > 0
            ? `Sample: ${c.sample_nos.map((n) => `#${n}`).join(', ')}`
            : '0 matching members right now';
          const approveBtn = el('button', {
            type: 'button',
            class: `ap-mini-btn ${c.approved_by_founder ? 'on' : ''}`,
            id: `gnApprove-${c.key}`,
            disabled: !!gn.fallback,
          }, c.approved_by_founder ? 'Copy approved ✓' : 'Approve copy');
          approveBtn.onclick = async () => {
            approveBtn.disabled = true;
            try {
              const nextVal = !c.approved_by_founder;
              await rpc('kr8_admin_growth_nudge_approve', { p_cohort_key: c.key, p_approved: nextVal });
              c.approved_by_founder = nextVal;
              toast(nextVal ? `Approved copy for "${c.label}" (still DRY-RUN)` : `Unmarked "${c.label}"`);
              paint();
            } catch (e) {
              approveBtn.disabled = false;
              toast(`Could not update copy approval: ${(e as Error).message}`);
            }
          };

          return el('div', { class: 'ap-gitem', 'data-cohort': c.key },
            el('div', { class: 'ap-gitem-hd' },
              el('div', { class: 'grow' },
                el('div', { class: 'ac-tags' },
                  chip(c.key === 'weekly_winners_post' ? '1 draft post' : `Would nudge ${c.would_send_count}`, c.would_send_count > 0 ? 'a' : 'k'),
                  c.approved_by_founder ? chip('Founder approved', 'g') : null),
                el('b', {}, c.label),
                el('small', {}, `${c.title_en} · ${sampleTxt}`)),
              approveBtn),
            apShowMemberCopy
              ? el('div', { class: 'ap-gcopy', 'data-member-copy': '1' },
                  el('div', { class: 'ap-gcopy-line' },
                    el('span', { class: 'ap-gcopy-tag' }, 'TH'),
                    el('strong', {}, `${c.title_th} — `),
                    c.body_th),
                  el('div', { class: 'ap-gcopy-line' },
                    el('span', { class: 'ap-gcopy-tag' }, 'EN'),
                    el('strong', {}, `${c.title_en} — `),
                    c.body_en))
              : null);
        })),
      el('div', { class: 'ap-sf-acts' },
        toggleCopyBtn,
        gnRunBtn));

    const aiTestBtn = el('button', {
      type: 'button',
      id: 'apAiTestFallbackBtn',
      class: 'ap-mini-btn',
    }, 'Test rules fallback');
    aiTestBtn.onclick = async () => {
      aiTestBtn.disabled = true;
      const safeAgg = guardAiPayload('morning_brief', {
        new_members_today: snap ? snap.counts.real_today : 0,
        held_count: snap ? money(snap).heldN : 0,
        held_thb: snap ? money(snap).heldThb : 0,
        available_vouchers: sf.available_vouchers,
        errors_24h: 0,
      });
      try {
        const res = await rpc<{ used_ai?: boolean; fallback_reason?: string; output?: { headline?: string } }>('kr8_ai_call', {
          p_task: 'morning_brief',
          p_input: safeAgg,
        });
        aiTestLine = res?.output?.headline
          ? `${res.used_ai ? 'OpenRouter Mimo v2' : `Rules fallback (${res.fallback_reason || 'robot_off'})`}: ${res.output.headline}`
          : `Rules fallback (robot_${ai.mode}): ${aiRulesFallback('morning_brief', safeAgg).headline}`;
      } catch {
        aiTestLine = `Rules fallback (robot_${ai.mode}): ${aiRulesFallback('morning_brief', safeAgg).headline}`;
      }
      paint();
    };

    const aiCard = el('section', { class: 'v2card ap-ai', id: 'apAiCard' },
      el('div', { class: 'ap-health-hd' },
        ic('robot'),
        el('div', { class: 'grow' },
          el('b', {}, `AI helper slot · ${modeLabel(ai.mode)}`),
          el('small', {}, `Model: ${ai.model} · Vault key "${ai.secret_name}": ${ai.secret_configured ? 'present' : 'not set (add tomorrow)'}`)),
        chip(ai.mode === 'on' && ai.secret_configured ? 'AI ON' : 'OFF · RULES FALLBACK', ai.mode === 'on' && ai.secret_configured ? 'g' : 'k')),
      el('div', { class: 'ap-sf-grid' },
        sfStat('aiMode', modeLabel(ai.mode), 'Slot status', ai.secret_configured ? 'Vault key ready' : 'No key in code / DB'),
        sfStat('aiTasks', '3 tasks', 'Allowlist only', 'Brief · errors · captions'),
        sfStat('aiPrivacy', 'Blocked', 'PII firewall', '0 names · chats · photos · faces')),
      aiTestLine ? el('div', { class: 'ap-ai-out', id: 'apAiOut' }, aiTestLine) : null,
      el('div', { class: 'ap-sf-acts' }, aiTestBtn));

    const filterOpts: [string, string][] = [
      ['all', `All (${st.logs.length})`],
      ['applied', `Applied (${st.logs.filter((l) => !l.dry_run).length})`],
      ['dry', `Dry-run (${st.logs.filter((l) => l.dry_run).length})`],
      ['undoable', `Undoable (${st.logs.filter((l) => l.can_undo && !l.undone_at).length})`],
    ];
    const filteredLogs = st.logs.filter((l) => {
      if (apLogFilter === 'applied') return !l.dry_run;
      if (apLogFilter === 'dry') return l.dry_run;
      if (apLogFilter === 'undoable') return l.can_undo && !l.undone_at;
      return true;
    });

    // 18 Nov declutter: 7 stacked dashboard cards → one status line + a list of rows that open (same cards inside, every button kept)
    const hbOk = hb.tone === 'g';
    const issues = (hw.checks.length - passCount) + (hbOk ? 0 : 1) + (sf.pdpa_late > 0 ? 1 : 0) + visibleFlags.filter((f) => f.severity === 'red').length;
    const statusTone = st.paused ? 'r' : issues ? 'a' : 'g';
    const undoable = st.logs.filter((l) => l.can_undo && !l.undone_at).length;
    body.replaceChildren(
      el('div', { class: `lt-statusline ${statusTone}`, id: 'apStatus' }, el('span', { class: `v2dot2 ${statusTone}` }),
        el('div', { class: 'grow' }, el('b', {}, st.paused ? 'All robots paused' : issues ? `${issues} thing${issues === 1 ? '' : 's'} to look at` : `All ${st.robots.length} robots OK · 0 alerts`),
          el('small', {}, `${passCount}/${hw.checks.length} checks green · checked ${ago(hw.at)}`))),
      killCard,
      el('div', { class: 'lt-list', id: 'apList' },
        fold('apHealthFold', foldHead('Health watch', `${passCount}/${hw.checks.length} green`, hw.all_ok ? 'g' : 'r'), [healthCard]),
        fold('apHbFold', foldHead('Heartbeats', hbOk ? 'on time' : 'late', hbOk ? 'g' : hb.tone === 'a' ? 'a' : 'r'), [hbCard]),
        fold('apSelfFixFold', foldHead('Self-fix & PDPA', sf.pdpa_late > 0 ? `${sf.pdpa_late} late` : 'on time', sf.pdpa_late > 0 ? 'r' : lowStock ? 'a' : 'g'), [selfFixCard]),
        fold('apProtectFold', foldHead('Protect flags', `${visibleFlags.length} active`, visibleFlags.some((f) => f.severity === 'red') ? 'r' : visibleFlags.length ? 'a' : 'g'), [protectCard]),
        fold('apGrowthFold', foldHead('Growth nudges', 'dry-run · 0 sent', 'k'), [growthCard]),
        fold('apAiFold', foldHead('AI helper', ai.mode === 'on' && ai.secret_configured ? 'on' : 'off · rules', 'k'), [aiCard]),
        fold('apRobotsFold', foldHead('Robots', `${st.robots.filter((r) => r.mode === 'on').length} on · ${st.robots.filter((r) => r.mode === 'dry_run').length} dry-run`, 'k'),
          [el('div', { id: 'apRobots' }, ...st.robots.map(renderRobot))]),
        fold('apLogFold', foldHead('Robot action log', `${st.logs.length}${undoable ? ` · ${undoable} undoable` : ''}`, 'k'), [
          el('div', { class: 'v2chips' }, ...filterOpts.map(([k, label]) => {
            const b = el('button', { type: 'button', class: apLogFilter === k ? 'on' : '', id: `aplf-${k}` }, label);
            b.onclick = () => { apLogFilter = k; paint(); };
            return b;
          })),
          filteredLogs.length
            ? el('div', { class: 'v2list', id: 'apLog' }, ...filteredLogs.map(renderLogRow))
            : el('div', { class: 'v2sub', id: 'apLogEmpty' }, 'No robot actions logged for this filter yet.')])));
    // keep the rows the founder opened open across repaints (mode taps, cap saves, Undo)
    for (const id of apOpen) { const d = document.getElementById(id) as HTMLDetailsElement | null; if (d) d.open = true; }
    body.querySelectorAll<HTMLDetailsElement>('#apList > details').forEach((d) => d.addEventListener('toggle', () => { if (d.open) apOpen.add(d.id); else apOpen.delete(d.id); }));
  };

  rerender = () => paint();
  await load();
}

/** Router hook: returns true when the hash is a v2 screen. 18 Nov: #x/<kind>/<id> is a who-and-why sheet over the page under it. */
export function v2Route(a: string, b?: string, c?: string): boolean {
  const sr = sheetRoute();
  if (sr?.act === 'stay') return true;   // back closed a sheet: the page under it is still there
  if (sr?.act === 'reopen') {             // back from a page the sheet linked to: the page under it, then the sheet again
    const [ba, bb, bc] = decodeURIComponent(sr.base.replace(/^#/, '')).split('/');
    if (v2RouteTo(ba || 'growth', bb, bc)) { sr.again(); return true; }
    location.replace(sr.base); return true;
  }
  if (sr?.act === 'missing') { try { history.replaceState(null, '', '#today'); } catch { /* ignore */ } return v2RouteTo('today'); }
  return v2RouteTo(a, b, c);
}
function v2RouteTo(a: string, b?: string, c?: string): boolean {
  viewAsLeave();
  helpPanelLeave();
  if (a === 'help') { stopV2(); helpPanelView((...kids) => screen('inbox', ...kids), b, setHelpWaiting); return true; }
  if (a === 'viewas') { stopV2(); viewAsView((...kids) => screen('more', ...kids)); return true; }
  if (a === 'growth' || a === '') { growthView(b); return true; }   // #growth/2026-11-17 = that day (0114)
  if (a === 'today') { todayView(); return true; }
  if (a === 'inbox') {
    // 18 Nov tap-all: #inbox/held = that filter; #inbox/case/<key> = scroll to that one case
    if (b && b !== 'case' && INBOX_FILTERS.some((f) => f.key === b)) { inboxFilter = b as typeof inboxFilter; LS('kr8-v2-if', b); }
    if (b === 'case' && c) { inboxFilter = 'all'; focusCase = c; }
    inboxView(); return true;
  }
  if (a === 'auto') { autoView(); return true; }
  if (a === 'people') {
    const pf: PeopleFilter[] = ['all', 'today', 'unverified', 'flagged', 'claims', 'nocard'];
    if (b && pf.includes(b as PeopleFilter)) { pFilter = b as PeopleFilter; LS('kr8-v2-pf', b); }
    peopleView(); return true;
  }
  if (a === 'money') { moneyView(); return true; }
  if (a === 'board') { boardView(); return true; }
  if (a === 'log') { void logView(); return true; }
  if (a === 'places') { void placesView(); return true; }
  if (a === 'faces') { void facesView(); return true; }
  if (a === 'autopilot') { void autopilotView(); return true; }
  if (a === 'm' && b) { void memberView(b); return true; }
  stopV2();
  return false;
}
/** Old screens keep working; their tab bar maps to the new five tabs. */
export function v2TabFor(old: 'todo' | 'members' | 'listings' | 'more'): V2Tab {
  return old === 'todo' ? 'inbox' : old === 'members' ? 'people' : 'more';
}
/** Called by the router on every hash change. Closing a who-and-why sheet (back to the page under it) or opening one keeps the 5 s Undo running. */
function routeFlush() {
  const o = sheetOpen();
  const h = (x: string) => { try { return decodeURIComponent(x); } catch { return x; } };
  if (location.hash.startsWith('#x/') || (o && h(location.hash) === h(o.base))) return;
  flush();
}
export { routeFlush as v2Flush, testToggle as v2TestToggle };
