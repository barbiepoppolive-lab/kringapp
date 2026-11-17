/**
 * Kring admin v2 (17 Nov): Today · Needs you · People · Money · More (Board, Activity log, all old tools).
 * One snapshot (0082 kr8_admin_v2_snapshot) feeds every screen, refreshed every 30 s ("updated 12s ago").
 * Real members only by default; "Show test rows" includes test / demo / Kring Team / ghost / admin sign-ins.
 * Reads only through 0082. Writes only through the existing admin RPCs, sent 5 s later so every tap has Undo.
 */
import { el, rpc, v5Client } from './shared';
import { signReelPaths } from '../v8/v5Reel';
import {
  ago, both, buildInbox, buildRobotReport, claimChip, clock, filterPeople, groupPeople, isSnapshot, lookalikeWords, money, noCard, peopleCounts, peopleHeadline,
  personFlags, personTrust, placeFlags, realPhoto, referrers, stepChip, summary, trustChip, who, withAdminLogins, faceChip, faceStatusWords, liveSteps,
  INBOX_FILTERS, waitShort, type Handled,
  type Claim, type DupAuto, type FaceCheck, type InboxItem, type PeopleExtra, type Person, type PeopleFilter, type PlaceAuto, type PlaceRow, type Snapshot, type Trust,
} from './adminV2Logic';
import {
  capStatus, computeVoucherRunway, fallbackAutopilotState, fallbackHealthWatch, formatRobotLogLine, heartbeatSummary,
  isAutopilotState, isHealthWatchReport, isMorningBriefData,
  modeLabel, modeTone, scheduleWords, severityMeta, sortRobotAlerts, synthesizeMorningBrief,
  type AutopilotState, type HealthWatchReport, type MorningBriefData, type RobotAlert, type RobotLogRow, type RobotMode, type RobotRow,
} from './autopilotLogic';
import './adminV2.css';

type Kid = Node | string | null | undefined | false;
const app = () => document.getElementById('app')!;
const LS = (k: string, v?: string): string | null => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* private mode */ } return null; };

// ───────── icons ─────────
const P: Record<string, string> = {
  today: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
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
export type V2Tab = 'today' | 'inbox' | 'people' | 'board' | 'money' | 'more';
export function v2Tabbar(active: V2Tab): HTMLElement {
  const n = snap ? buildInbox(snap).items.filter((i) => !hiddenKeys.has(i.key)).length : 0;
  const items: [V2Tab, string, string, string][] = [['today', 'today', 'Today', '#today'], ['inbox', 'inbox', 'Needs you', '#inbox'], ['people', 'people', 'People', '#people'],
    ['board', 'trophy', 'Board', '#board'], ['more', 'more', 'More', '#more']];
  const on = active === 'money' ? 'more' : active;
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
/** The four steps a member takes: photo → Reel → face → prize. */
function steps(p: Person, s: Snapshot): HTMLElement {
  const st: [string, boolean][] = [['Photo', realPhoto(p, s)], ['Reel', (p.reels?.live || 0) + (p.reels?.waiting || 0) > 0], ['Face', p.verified === true], ['Prize', (p.claims?.paid || 0) > 0]];
  return el('span', { class: 'v2steps' }, ...st.map(([t, ok]) => el('i', { class: ok ? 'ok' : '' }, (ok ? '✓ ' : '') + t)));
}
function renderMorningBrief(s: Snapshot, inboxItems: InboxItem[]): HTMLElement {
  const mb = morningCache || synthesizeMorningBrief(s, { items: inboxItems });
  const b = mb.brief;
  const runway = computeVoucherRunway(b.voucher_stock.available, b.voucher_stock.burn_7d);
  const daysStr = b.voucher_stock.days_left === null ? 'Steady' : `${b.voucher_stock.days_left}d left`;

  const stat = (id: string, val: string, label: string, sub: string, href: string, hot = false) =>
    el('a', { class: `mb-stat ${hot ? 'hot' : ''}`, href, id },
      el('b', {}, val),
      el('span', {}, label),
      el('small', {}, sub));

  const top3 = b.top3_needs_you.slice(0, 3);

  return el('section', { class: 'v2card mb-card', id: 'v2MorningBrief' },
    el('div', { class: 'mb-hd' },
      ic('robot'),
      el('div', { class: 'grow' },
        el('b', {}, 'Morning brief'),
        el('small', {}, 'Real counts · 7-day voucher burn · 24h health')),
      el('a', { class: 'v2robot-go', href: '#autopilot' }, 'Autopilot →')),
    el('div', { class: 'mb-grid' },
      stat('mbMembers', `+${b.new_members.today}`, 'New members', `${b.new_members.total} real total`, '#people'),
      stat('mbFaces', String(b.face_checks.today), 'Face checks', `${b.face_checks.pass} pass · ${b.face_checks.waiting} waiting`, '#faces', b.face_checks.waiting > 0),
      stat('mbPosts', String(b.posts.reels_today + b.posts.asks_today), 'Posts today', `${b.posts.reels_live} live · ${b.posts.reels_waiting} waiting`, '#inbox', b.posts.reels_waiting > 0),
      stat('mbHeld', `฿${b.held_payouts.thb.toLocaleString('en-US')}`, 'Held payouts', `${b.held_payouts.count} waiting for you`, '#inbox', b.held_payouts.count > 0),
      stat('mbStock', daysStr, 'Voucher stock', runway.sub, '#money', runway.hot),
      stat('mbErrors', String(b.errors.total), 'Errors (24h)', `${b.errors.client_24h} phone · ${b.errors.outbox_failed_24h + b.errors.robot_failed_24h} sys`, '#problems', b.errors.total > 0)),
    el('div', { class: 'mb-top3', id: 'v2BriefTop3' },
      el('div', { class: 'mb-top3-hd' }, top3.length ? `${top3.length} thing${top3.length === 1 ? '' : 's'} that need you` : '3 things that need you · all clear'),
      ...(top3.length
        ? top3.map((t, idx) => el('a', { class: `mb-need sev-${t.severity}`, href: t.href },
            el('span', { class: 'mb-num' }, String(idx + 1)),
            el('div', { class: 'grow' }, el('b', {}, t.title), t.sub ? el('small', {}, t.sub) : null),
            ic('chev')))
        : [el('div', { class: 'mb-clear' }, '0 urgent decisions — robots are watching everything.')])));
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
    return el('div', { class: `ac-row sev-${a.severity}`, 'data-alert': a.dedupe_key },
      el('span', { class: `ac-dot sev-${a.severity}` }),
      el('div', { class: 'grow' },
        el('div', { class: 'ac-tags' },
          chip(meta.label, meta.tone),
          chip(a.robot, ''),
          el('small', { class: 'dim' }, ago(a.at))),
        el('b', {}, a.title),
        a.body ? el('small', {}, a.body) : null),
      el('div', { class: 'ac-acts' },
        el('a', { class: 'ap-mini-btn', href: a.href }, 'Open →'),
        dismissBtn));
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
  const date = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'short' });
  void withSnap('today', (s) => {
    const inbox = buildInbox(s);
    const items = inbox.items.filter((i) => !hiddenKeys.has(i.key));
    const m = money(s);
    const d0 = Date.parse(s.day_start);
    const real = s.people.filter((p) => p.kind === 'real');
    let fresh = real.filter((p) => Date.parse(p.joined_at) >= d0);
    const freshLabel = fresh.length ? `New today · ${fresh.length}` : 'Newest members';
    if (!fresh.length) fresh = [...real].sort((x, y) => Date.parse(y.joined_at) - Date.parse(x.joined_at)).slice(0, 4);
    const pc = peopleCounts(s);
    const top = s.board.rows.slice(0, 3);
    void loadPhotos([...fresh.map((p) => p.user_id), ...top.map((r) => r.user_id), ...items.slice(0, 2).flatMap((i) => i.people.map((p) => p.user_id))]).then(paintPhotos);
    // funnel over every real member with a card
    const fun: [string, number][] = [['Joined', real.length], ['Photo', real.filter((p) => realPhoto(p, s)).length],
      ['Posted a Reel', real.filter((p) => (p.reels?.live || 0) + (p.reels?.waiting || 0) > 0).length], ['Face verified', real.filter((p) => p.verified).length],
      ['Got a prize', real.filter((p) => (p.claims?.paid || 0) > 0).length]];
    const kpi = (id: string, n: string, label: string, sub: string, href: string, tone = '') =>
      el('a', { class: `v2kpi ${tone}`, href, id }, el('b', {}, n), el('span', {}, label), el('small', {}, sub));
    const rr = buildRobotReport(s, { items, handled: inbox.handled });
    screen('today', header('Today', `${date} · India time`),
      renderMorningBrief(s, items),
      // 1. what needs a decision
      items.length ? el('div', { class: 'v2sec' }, `Needs you · ${items.length}`) : el('a', { class: 'v2card v2row v2allclear', href: '#auto', id: 'v2Clear' }, ic('check'),
        el('div', { class: 'grow' }, el('b', {}, 'Nothing needs you'), el('div', { class: 'v2sub' }, `${inbox.handled.length} things were handled automatically`)), ic('chev')),
      ...items.slice(0, 2).map((i) => inboxCard(i, items)),
      items.length > 2 ? el('a', { class: 'v2more', href: '#inbox' }, `See all ${items.length} →`) : null,
      // 1b. Robot report: what the robots did today, plain English, links to Needs you
      el('div', { class: 'v2sec' }, 'Robot report'),
      el('a', { class: 'v2card v2robot', href: '#inbox', id: 'v2RobotReport' },
        el('div', { class: 'v2robot-hd' }, ic('robot'), el('b', { class: 'grow' }, 'Robot report · today'),
          el('span', { class: 'v2robot-go' }, items.length ? `Needs you (${items.length}) →` : 'Needs you →')),
        el('ul', { class: 'v2robot-ul' }, ...rr.lines.map((ln) => el('li', {}, ln)))),
      // 2. who joined, and how far they got
      el('div', { class: 'v2sec' }, freshLabel),
      el('div', { class: 'v2card v2list', id: 'v2NewToday' }, ...fresh.map((p) => el('a', { class: 'v2li', href: personLink(p), 'data-uid': p.user_id },
        avatar(p, 44), el('div', { class: 'grow' }, el('b', {}, `${p.name || '—'} #${p.no ?? '–'}`),
          el('small', {}, `${ago(p.joined_at)} · ${p.ref ? `via ${p.ref}` : 'no referrer'}`), steps(p, s)), ic('chev')))),
      // 3. where members stop
      el('div', { class: 'v2sec' }, 'Where members stop'),
      el('a', { class: 'v2card v2funnel', href: '#people', id: 'v2Funnel' }, ...fun.map(([t, n], k) => el('div', { class: 'v2fun' },
        el('span', {}, t), el('i', {}, el('u', { style: `width:${Math.round((n / Math.max(1, fun[0][1])) * 100)}%` })), el('b', {}, String(n)),
        el('small', { class: k && n === Math.min(...fun.slice(1).map((f) => f[1])) ? 'low' : '' }, k ? `${Math.round((n / Math.max(1, fun[0][1])) * 100)}%` : '')))),
      // 4. the race this week
      el('div', { class: 'v2sec' }, `Board · ends ${weekLeft(s)}`),
      top.length ? el('a', { class: 'v2card v2list', href: '#board', id: 'v2Top3' }, ...top.map((r) => el('div', { class: 'v2li', 'data-uid': r.user_id },
        el('span', { class: 'v2rank top' }, String(r.rank)), avatar({ user_id: r.user_id, name: r.name }, 36),
        el('div', { class: 'grow' }, el('b', {}, `${r.name} #${r.no}`), el('small', {}, r.rings < s.board.floor ? `${s.board.floor - r.rings} more Rings to qualify` : r.prize ? `prize ฿${r.prize}` : '')),
        el('b', { class: 'v2rings' }, String(r.rings)))))
        : el('a', { class: 'v2card v2row', href: '#board' }, el('div', { class: 'grow' }, el('b', {}, 'Board is empty this week')), ic('chev')),
      // 5. numbers
      el('div', { class: 'v2kpis three' },
        kpi('kpiMembers', String(pc.members), 'Members', `+${pc.today} today`, '#people'),
        kpi('kpiCodes', String(m.available), 'Codes left', m.available < 5 ? 'Add more soon' : `${m.assigned} given out`, '#money', m.available < 5 ? 'hot' : ''),
        kpi('kpiPaid', `฿${m.paidWeekThb.toLocaleString('en-US')}`, 'Paid this week', m.heldN ? `฿${m.heldThb} held` : `${m.paidWeekN} claims`, '#money')),
      // 6. shortcuts he uses
      el('div', { class: 'v2links grid2' },
        el('a', { href: '#post', class: 'v2link', id: 'v2Post', style: 'grid-column:1 / -1' }, ic('reel'), 'Post a Reel · Instagram · YouTube · X'),
        el('a', { href: '#autopilot', class: 'v2link', id: 'todayAutopilot', style: 'grid-column:1 / -1' }, ic('robot'), 'Autopilot · switches, caps & Undo'),
        el('a', { href: '#faces', class: 'v2link' }, ic('face'), 'Face checks'), el('a', { href: '#recruiters', class: 'v2link' }, ic('link'), 'Recruiters'),
        el('a', { href: '#push', class: 'v2link' }, ic('send'), 'Send a ding'), el('a', { href: '#log', class: 'v2link' }, ic('log'), 'Activity log')),
      el('details', { class: 'v2brief', id: 'v2Brief' }, el('summary', { class: 'v2brief-k' }, ic('robot'), 'In plain words'),
        ...summary(s, { items, handled: inbox.handled }).map((t) => el('p', {}, t))),
      testToggle());
  }, header('Today', `${date} · India time`));
}
function paintPhotos() {
  document.querySelectorAll<HTMLElement>('[data-uid]').forEach((n) => {
    const src = photos.get(n.dataset.uid || ''); const ph = n.querySelector('.v2av.none, .v2pc-img.none');
    if (!src || !ph) return;
    if (ph.classList.contains('v2pc-img')) { (ph as HTMLElement).style.backgroundImage = `url("${src}")`; ph.classList.remove('none'); ph.textContent = ''; }
    else { const img = el('img', { class: 'v2av', src, alt: '', style: (ph as HTMLElement).getAttribute('style') || '' }); ph.replaceWith(img); }
  });
}

// ───────── Needs you: one case per card ─────────
let inboxFilter: 'all' | InboxItem['kind'] = (LS('kr8-v2-if') as 'all' | InboxItem['kind']) || 'all';
export function inboxView() {
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
    screen('inbox', header('Needs you', open.length ? `${open.length} decision${open.length === 1 ? '' : 's'}` : 'Inbox zero'),
      renderAlertCentre(s, open),
      open.length ? chips : null,
      open.length ? null : el('div', { class: 'v2zero', id: 'v2Zero' }, ic('check'), el('b', {}, 'Nothing needs you'), el('span', {}, 'Everything else was handled automatically.')),
      el('div', { id: 'v2Inbox' }, ...shown.map((i) => inboxCard(i, open))),
      handledBox(handled, preview),
      testToggle());
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
  card.append(el('div', { class: 'v2what' }, el('span', { class: 'k' }, 'What happened'), ...i.what.slice(0, 2).map((t) => el('div', {}, t))));
  if (i.verdict) {
    const v = i.verdict;
    const rest = v.reasons.slice(2);
    const more = rest.length ? el('button', { type: 'button', class: 'v2chip k v2more-r' }, `+${rest.length}`) : null;
    const restBox = el('div', { class: 'v2rest', hidden: true }, ...rest.map((r) => chip(r, '')));
    const pill = el('button', { type: 'button', class: `v2pill ${v.tone}`, 'data-call': v.call }, ic('robot'), `Robot: ${v.call} · trust ${v.score}`);
    const toggle = () => { restBox.hidden = !restBox.hidden; };
    pill.onclick = toggle; if (more) more.onclick = toggle;
    card.append(el('div', { class: 'v2verdict2' }, pill, el('div', { class: 'v2flags' }, ...v.reasons.slice(0, 2).map((r) => chip(r, r.startsWith('+') ? 'g' : 'a')), more), restBox));
  }
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
function act(label: string, cls: string, id: string, fn: () => void): HTMLButtonElement {
  const b = el('button', { type: 'button', class: `v2btn ${cls}`, id }, label); b.onclick = fn; return b;
}
function actions(i: InboxItem): HTMLElement {
  const box = el('div', { class: 'v2acts v2acts2' });
  if (i.kind === 'held' && i.claims.length) {
    const c = i.claims[0];
    box.append(act(`Pay ฿${c.amount}`, 'ok', 'v2Pay-' + c.id, () => later(i.key, `Paying ฿${c.amount} to ${who(c)}`, () => rpc('kr8_admin_release_claim', { p_claim: c.id }))),
      act('Refuse', 'bad', 'v2Refuse-' + c.id, () => later(i.key, 'Claim refused (member is not told why)', () => rpc('kr8_admin_refuse_claim', { p_claim: c.id, p_reason: 'One person, one account', p_return: false }))));
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
  return el('div', { class: 'v2li v2hl', style: hiddenKeys.has(h.key) ? 'opacity:.4' : undefined }, ic('robot'),
    el('div', { class: 'grow' }, el('b', {}, h.text), el('small', {}, ago(h.at))), tag ?? dupUndoButton(h));
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
      preview.length ? el('div', { class: 'v2card v2list', id: 'v2Preview' }, ...preview.map((h) => el('div', { class: 'v2li' }, ic('robot'),
        el('div', { class: 'grow' }, el('b', {}, h.text), el('small', {}, `${ago(h.at)} · ${both(h.at, true)}`)), chip('preview', 'a')))) : null,
      el('div', { class: 'v2card v2list' }, ...handled.map((h) => {
        const undoBtn = h.undoDup && !h.undone
          ? el('button', { type: 'button', class: 'v2btn ok', id: 'dupUndo-' + h.undoDup, style: 'flex:0 0 auto;min-height:36px;padding:0 12px' }, 'Undo')
          : null;
        if (undoBtn && h.undoDup) {
          const dupId = h.undoDup;
          undoBtn.onclick = () => later(h.key, 'Duplicate restored · ghost mode off', () => rpc('kr8_admin_dup_auto_undo', { p_dup: dupId, p_action: 'undo' }));
        }
        return el('div', { class: 'v2li', style: hiddenKeys.has(h.key) ? 'opacity:.4' : undefined },
          ic('robot'),
          el('div', { class: 'grow' }, el('b', {}, h.text), el('small', {}, `${ago(h.at)} · ${both(h.at, true)}`)),
          undoBtn || (h.undone ? chip('undone', 'k') : null));
      })));
  }, header('Handled automatically', undefined, '#inbox'));
}

// ───────── People (looks like the member app's People tab, plus admin overlays) ─────────
let pFilter: PeopleFilter = (LS('kr8-v2-pf') as PeopleFilter) || 'all';
let pQuery = ''; let pRef = '';
let showRemoved = false;
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
    screen('people', header('People', peopleHeadline(pc)),
      el('label', { class: 'v2search' }, ic('search'), q),
      el('div', { class: 'v2chips', role: 'tablist' }, fb('all', 'All'), fb('today', `New today · ${s.people.filter((p) => p.kind === 'real' && Date.parse(p.joined_at) >= d0).length}`),
        fb('unverified', 'Not verified'), fb('flagged', 'Flagged'), fb('claims', 'Has claims'), fb('nocard', 'No card')),
      el('div', { class: 'v2row2' }, refSel, el('label', { class: 'v2toggle' }, el('span', {}, `Removed (${pc.removed})`), rm, el('i', {}))),
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
  const tr = !noCard(p) ? trustChip(personTrust(p, s)) : null;
  return el('a', { class: `v2pc ${p.who === 'traveller' ? 'trav' : ''} ${flags.some((f) => f.tone === 'r') ? 'red' : ''}`, href: personLink(p), 'data-uid': p.user_id, 'data-who': p.who || 'local' },
    el('span', { class: `v2pc-img ${src ? '' : 'none'}`, style: src ? `background-image:url("${src}")` : '' }, src ? '' : (p.name || p.email_hint || '?').slice(0, 1)),
    el('span', { class: 'v2pc-scrim' }),
    el('span', { class: 'v2pc-tl' }, el('b', {}, p.no != null ? `#${p.no}` : 'no card'), kindChip),
    el('span', { class: 'v2pc-tr' }, tr ? chip(tr.text, tr.tone) : null, ((f) => (f ? chip(f.text, f.tone) : null))(faceChip(p))),
    el('span', { class: 'v2pc-info' },
      step ? el('span', { class: `v2step ${step.tone}`, 'data-step': step.key }, step.text) : null,
      el('b', { class: 'nm' }, p.name || p.email_hint || 'No name'),
      el('small', {}, p.kind === 'nocard' ? 'Signed in · no card yet' : `${p.who === 'traveller' ? 'Visiting' : 'Local'}${p.area ? ' · ' + p.area : ''}`),
      el('small', {}, `joined ${ago(p.joined_at)} · ${clock(p.joined_at, 'Asia/Kolkata', false)} IST`),
      el('small', {}, p.ref ? `via ${p.ref}` : p.src ? `no referrer · came from ${p.src}` : 'no referrer'),
      el('span', { class: 'v2pc-flags' },
        ...flags.filter((f) => ['lookalike', 'shared', 'board_off'].includes(f.key)).map((f) => chip(f.key === 'lookalike' ? '👥 ' + f.text.replace('Looks like ', '') : f.key === 'shared' ? '📶 shared' : '⛔ board off', f.tone)),
        p.claims?.n ? chip(`฿ ${p.claims.n} claim${p.claims.n === 1 ? '' : 's'}${p.claims.held ? ' · held' : ''}`, p.claims.held ? 'a' : 'g') : null)));
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
  let m: M360;
  try { m = await rpc<M360>('kr8_admin_v2_member', { p_user: uid }); } catch (e) { body.replaceChildren(errorCard(e)); return; }
  const c = m.card;
  const snapP = snap?.people.find((p) => p.user_id === uid);
  const flags = snapP && snap ? personFlags(snapP, snap.people, snap.claims) : [];
  const tr: Trust | null = m.trust || (snapP && snap ? personTrust(snapP, snap) : null);
  const trChip = tr ? trustChip(tr) : null;
  const [urls, faces] = await Promise.all([
    signReelPaths(m.reels.map((r) => r.poster_path || '').filter(Boolean)).catch(() => ({} as Record<string, string>)),
    rpc<FaceCheck[]>('kr8_admin_v2_face_checks', { p_user: uid, p_auto_only: false, p_limit: 10 }).catch(() => [] as FaceCheck[]),
  ]);
  const selfies = await signSelfies(faces);
  const sec = (title: string, n: number | string, ...kids: Kid[]) => el('section', { class: 'v2card v2m' }, el('h2', {}, title, el('small', {}, String(n))), ...kids);
  const kv = (k: string, v: Kid) => el('div', { class: 'v2kv' }, el('span', {}, k), el('b', {}, v ?? '–'));
  const yes = (b: boolean | null | undefined) => (b ? 'Yes' : b === false ? 'No' : '–');
  const timeline = [
    ...(c ? [{ at: c.joined_at, t: 'Joined' + (c.ref ? ` via ${c.ref}` : '') }] : []),
    ...m.reels.map((r) => ({ at: r.at, t: `Posted a Reel (${r.hidden ? 'hidden' : r.status})` })),
    ...m.checks.map((v) => ({ at: v.at, t: `Face check ${v.status}${v.auto ? ` · robot said ${v.auto}` : ''}` })),
    ...m.claims.map((x) => ({ at: x.created_at, t: `Claimed ฿${x.amount} ${x.brand} · ${claimChip({ ...x, user_id: uid } as unknown as Claim).text}` })),
    ...m.links.map((l) => ({ at: l.at, t: `Linked to #${l.no} (${lookalikeWords(l.dist, l.reason).text})${l.dismissed ? ' · you said different people' : ''}` })),
    ...m.admin_log.map((a) => ({ at: a.at, t: `Admin: ${a.action.replace(/_/g, ' ')}` })),
    ...m.claims.filter((x) => x.decided_at).map((x) => ({ at: x.decided_at!, t: `You decided the held claim: ${x.decided}` })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  body.replaceChildren(
    el('section', { class: 'v2hero' },
      c?.photo ? el('img', { class: 'v2hero-img', src: c.photo, alt: '' }) : el('div', { class: 'v2hero-img none' }, (c?.name || '?').slice(0, 1)),
      el('div', { class: 'v2hero-info' },
        el('div', { class: 'v2flags' }, chip(c ? `#${c.no}` : 'no card', 'k'), m.kind !== 'real' ? chip(m.kind, 'a') : null,
          c?.verified ? chip('✓ verified', 'g') : chip('not verified', ''), trChip ? chip(trChip.text, trChip.tone) : null),
        el('h2', {}, c?.name || m.email_hint || 'Account without a card'),
        el('div', { class: 'v2sub' }, c ? `${c.who === 'traveller' ? 'Visiting' : 'Local'} · ${c.area || '–'}` : `Signed up ${ago(m.signed_up_at)}`),
        el('div', { class: 'v2sub' }, `Joined ${both(c?.joined_at || m.signed_up_at, true)}`),
        c?.ig ? el('a', { class: 'v2sub', href: `https://instagram.com/${c.ig}`, target: '_blank', rel: 'noopener' }, `IG @${c.ig}`) : null)),
    flags.length ? el('div', { class: 'v2flags v2m-flags' }, ...flags.map((f) => chip(f.text, f.tone))) : "",
    el('div', { class: 'v2stats' },
      el('div', {}, el('b', {}, String(m.reels.filter((r) => r.status === 'approved' && !r.hidden).length)), el('span', {}, 'live Reels')),
      el('div', {}, el('b', {}, m.board ? `#${m.board.rank}` : '–'), el('span', {}, `board · ${m.board?.rings ?? 0} Rings`)),
      el('div', {}, el('b', {}, `฿${m.claims.filter((x) => x.status === 'assigned').reduce((n, x) => n + x.amount, 0)}`), el('span', {}, `${m.claims.length} claims`)),
      el('div', {}, el('b', {}, String(m.referrals.length)), el('span', {}, 'brought in'))),
    tr ? sec('Trust score', `${tr.score} / 100`,
      tr.reasons.length
        ? el('div', { class: 'v2kvs', id: 'v2MemberTrust' }, ...tr.reasons.map((r) => el('div', { class: 'v2kv' }, el('b', { style: 'text-align:left' }, r))))
        : el('div', { class: 'v2sub', id: 'v2MemberTrust' }, 'Neutral baseline (50) — no positive or negative signals yet.')) : '',
    sec('Reels', m.reels.length, m.reels.length ? el('div', { class: 'v2reels' }, ...m.reels.map((r) => el('div', { class: 'v2reel' },
      r.poster_path && urls[r.poster_path] ? el('img', { src: urls[r.poster_path], alt: '' }) : el('span', { class: 'none' }),
      el('small', {}, r.hidden || r.status === 'hidden' ? '🙈 hidden' : r.status === 'pending' ? '⏳ waiting' : r.board_off ? '⛔ off board' : '✓ live'),
      el('small', {}, `♥${r.likes} 🔖${r.saves} ↗${r.shares} 👁${r.views}`)))) : el('div', { class: 'v2sub' }, 'No Reels yet.')),
    sec('Rings this week', m.rings_week?.score ?? 0, el('div', { class: 'v2kvs' }, kv('Likes', String(m.rings_week?.likes ?? 0)), kv('Saves', String(m.rings_week?.saves ?? 0)),
      kv('Link opens', String(m.rings_week?.opens ?? 0)), kv('Past weeks', m.results.map((r) => `#${r.rank}`).join(', ') || '–'))),
    sec('Claims', m.claims.length, ...m.claims.map((x) => { const ch = claimChip({ ...x, user_id: uid } as unknown as Claim); return el('div', { class: 'v2li' },
      el('div', { class: 'grow' }, el('b', {}, `฿${x.amount} ${x.brand}`), el('small', {}, `${both(x.created_at, true)}${c ? ` · ${Math.round((Date.parse(x.created_at) - Date.parse(c.joined_at)) / 60000)} min after joining` : ''}`)), chip(ch.text, ch.tone)); })),
    sec('Look-alikes & links', m.links.length, ...m.links.map((l) => { const w = lookalikeWords(l.dist, l.reason); return el('a', { class: 'v2li', href: `#m/${l.user_id}` },
      el('div', { class: 'grow' }, el('b', {}, `#${l.no} ${l.name || ''}`), el('small', {}, `${w.text}${l.dismissed ? ' · you said different people' : ''}`)), chip(l.dismissed ? 'settled' : 'open', l.dismissed ? '' : w.tone)); })),
    sec('Brought in', m.referrals.length, ...m.referrals.map((r) => el('a', { class: 'v2li', href: `#m/${r.user_id}` }, el('div', { class: 'grow' }, el('b', {}, `#${r.no} ${r.name}`), el('small', {}, ago(r.joined_at)))))),
    sec('Consents', m.consents.terms_version || '–', el('div', { class: 'v2kvs' },
      kv('Terms', m.consents.terms_version ? `${m.consents.terms_version} · ${clock(m.consents.terms_at)}` : 'Not accepted'),
      kv('Promo use of content', yes(m.consents.promo_ok)), kv('Reels on the website', yes(m.consents.web_reels)), kv('20+ confirmed', c?.age_ok_at ? clock(c.age_ok_at) : '–'))),
    faces.length ? sec('Face check', faceStatusWords(faces[0]), ...faces.map((f, i) => facePair(f, c?.photo || null, selfies, i === 0))) : "",
    sec('Verification', m.checks.length ? m.checks[0].status : 'none', ...m.checks.map((v) => el('div', { class: 'v2li' },
      el('div', { class: 'grow' }, el('b', {}, `${v.status}${v.auto ? ` · robot: ${v.auto}` : ''}`), el('small', {}, `${both(v.at, true)}${v.reason ? ' · ' + v.reason.split('\n').pop() : ''}`)),
      chip(v.by_admin ? 'by you' : v.reviewed_at ? 'auto' : 'waiting', '')))),
    sec('Timeline', timeline.length, ...timeline.slice(0, 40).map((t) => el('div', { class: 'v2li tl' }, el('i', {}), el('div', { class: 'grow' }, el('b', {}, t.t), el('small', {}, `${ago(t.at)} · ${both(t.at, true)}`))))),
    el('div', { class: 'v2sub', style: 'margin:12px 4px' }, `Account: ${m.email_hint || '–'} · LINE ${m.line ? 'linked' : 'no'} · last sign-in ${ago(m.last_sign_in_at)}`));
}

// ───────── Money ─────────
export function moneyView() {
  void withSnap('money', (s) => {
    const m = money(s);
    const claims = s.claims.filter((c) => includeTest || !c.is_test);
    screen('money', header('Money', 'TrueMoney / Grab codes and every claim', '#more'),
      el('div', { class: 'v2kpis' },
        el('div', { class: `v2kpi ${m.available < 5 ? 'hot' : ''}`, id: 'mAvail' }, el('b', {}, String(m.available)), el('span', {}, 'Codes left'), el('small', {}, `${m.assigned} given out`)),
        el('div', { class: 'v2kpi', id: 'mWeek' }, el('b', {}, `฿${m.paidWeekThb}`), el('span', {}, 'Paid this week'), el('small', {}, `${m.paidWeekN} claims · since Mon (BKK)`)),
        el('div', { class: `v2kpi ${m.heldN ? 'hot' : ''}`, id: 'mHeld' }, el('b', {}, `฿${m.heldThb}`), el('span', {}, 'Held'), el('small', {}, `${m.heldN} waiting for you`)),
        el('div', { class: 'v2kpi', id: 'mAll' }, el('b', {}, `฿${m.paidAllThb}`), el('span', {}, 'Paid in all'), el('small', {}, `${claims.filter((c) => c.status === 'assigned').length} claims`))),
      el('div', { class: 'v2sec' }, 'Code stock'),
      el('div', { class: 'v2card v2list', id: 'mStock' }, ...s.codes.map((k) => el('div', { class: 'v2li' }, el('div', { class: 'grow' }, el('b', {}, `${k.brand === 'truemoney' ? 'TrueMoney' : k.brand} ฿${k.amount}`),
        el('small', {}, `${k.assigned} given out${k.used ? ` · ${k.used} other` : ''}`)), el('span', { class: 'v2meter' }, el('i', { style: `width:${Math.round((k.available / Math.max(1, k.available + k.assigned)) * 100)}%` })), el('b', {}, `${k.available} left`))),
        el('a', { class: 'v2li', href: '#codes' }, el('div', { class: 'grow' }, el('b', {}, 'Add codes')), ic('chev'))),
      el('div', { class: 'v2sec' }, `Per member · ${m.byMember.length}`),
      el('div', { class: 'v2card v2list', id: 'mPer' }, ...m.byMember.map((r) => el('a', { class: 'v2li', href: r.p.user_id ? `#m/${r.p.user_id}` : '#money' },
        el('div', { class: 'grow' }, el('b', {}, who(r.p)), el('small', {}, `${r.n} claim${r.n === 1 ? '' : 's'}`)), el('b', {}, `฿${r.thb}`)))),
      el('div', { class: 'v2sec' }, `Every claim · ${claims.length}`),
      el('div', { class: 'v2card v2list', id: 'mClaims' }, ...claims.map((c) => { const ch = claimChip(c); const mins = c.joined_at ? Math.round((Date.parse(c.created_at) - Date.parse(c.joined_at)) / 60000) : null;
        return el('a', { class: 'v2li', href: c.user_id ? `#m/${c.user_id}` : '#money', 'data-claim': c.id },
          el('div', { class: 'grow' }, el('b', {}, `${who(c)} · ฿${c.amount}`), el('small', {}, `${clock(c.created_at)} IST${mins != null ? ` · ${mins} min after joining` : ''}${c.prize?.kind ? ` · ${c.prize.kind}` : ''}`)), chip(ch.text, ch.tone)); })),
      testToggle());
  }, header('Money', undefined, '#more'));
}

// ───────── Board ─────────
export function boardView() {
  void withSnap('board', (s) => {
    const byId = new Map(s.people.map((p) => [p.user_id, p]));
    void loadPhotos(s.board.rows.map((r) => r.user_id)).then(paintPhotos);
    const wk = new Date(s.board.week_start).toLocaleDateString('en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' });
    screen('board', header('Board', `Week from Mon ${wk} (BKK) · ends ${weekLeft(s)} · top ${s.board.paid_ranks} win · ${s.board.floor} Rings to qualify`),
      el('div', { class: 'v2card v2list', id: 'v2Board' }, ...s.board.rows.map((r) => {
        const p = byId.get(r.user_id);
        const fl = [r.is_new ? chip('new this week', '') : null, r.opens && !(r.likes || 0) && !(r.saves || 0) ? chip('opens only', 'a') : null,
          p?.reels?.board_off ? chip('board off', 'a') : null, p && p.links.length ? chip('look-alike', 'r') : null,
          r.rings < s.board.floor && r.rank <= s.board.paid_ranks ? chip(`${s.board.floor - r.rings} to qualify`, '') : null];
        return el('a', { class: 'v2li v2brow', href: `#m/${r.user_id}`, 'data-uid': r.user_id }, el('span', { class: `v2rank ${r.rank <= 3 ? 'top' : ''}` }, String(r.rank)), avatar({ user_id: r.user_id, name: r.name }, 40),
          el('div', { class: 'grow' }, el('b', {}, `${r.name} #${r.no}`), el('small', {}, `♥${r.likes ?? 0} · 🔖${r.saves ?? 0} · opens ${r.opens ?? 0}${r.prize ? ` · prize ฿${r.prize}` : ''}`), el('span', { class: 'v2flags' }, ...fl)),
          el('b', { class: 'v2rings' }, String(r.rings)));
      })),
      el('a', { class: 'v2card v2row', href: '#week' }, el('div', { class: 'grow' }, el('b', {}, 'Approve last week'), el('div', { class: 'v2sub' }, 'Top 8 with flags · opens the weekly prizes')), ic('chev')));
  }, header('Board'));
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
      rows.push(el(e.user_id ? 'a' : 'div', { class: `v2li ev k-${e.kind}`, href: e.user_id ? `#m/${e.user_id}` : undefined },
        el('span', { class: `v2evdot ${e.auto ? 'auto' : 'you'}` }), el('div', { class: 'grow' }, el('b', {}, `${e.no != null ? `#${e.no} ${e.name || ''}` : 'Admin'} · ${e.text}${e.other_no ? ` #${e.other_no}` : ''}`),
          el('small', {}, `${clock(e.at, 'Asia/Kolkata', false)} IST · ${clock(e.at, 'Asia/Bangkok', false)} BKK · ${e.auto ? 'automatic' : 'by a person'}`))));
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
    return el('div', { class: 'v2li', 'data-place': p.id, style: hiddenKeys.has(key) ? 'opacity:.4' : undefined },
      el('div', { class: 'grow' }, el('b', {}, p.name_en), p.name_th && p.name_th !== p.name_en ? el('div', { class: 'v2sub' }, p.name_th) : null,
        el('small', {}, `${p.area} · ${p.by_no != null ? `#${p.by_no} ${p.by_name || ''} · ` : ''}${ago(p.created_at)} · on ${p.reels} Reel${p.reels === 1 ? '' : 's'} · `, map),
        el('span', { class: 'v2flags' }, ...placeFlags(p).map(([t, tone]) => chip(t, tone)))),
      btn);
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
      f.live?.match != null ? chip(`match ${f.live.match.toFixed(2)}`, '') : null),
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
let apLogFilter = 'all';
export async function autopilotView() {
  const body = el('div', {}, loadingCard());
  screen('more', header('Autopilot', 'Robots watch & fix safe tasks · you decide money & bans', '#more'), body);
  stopV2();
  let st: AutopilotState = fallbackAutopilotState(snap);
  let hw: HealthWatchReport = fallbackHealthWatch(snap, st);

  const load = async () => {
    const t0 = Date.now();
    try {
      const [raw, rawHw] = await Promise.all([
        rpc<unknown>('kr8_admin_autopilot_state', { p_limit: 120 }),
        rpc<unknown>('kr8_admin_health_watch', { p_run: false }).catch(() => null),
      ]);
      const elapsed = Date.now() - t0;
      st = isAutopilotState(raw) ? raw : fallbackAutopilotState(snap);
      hw = isHealthWatchReport(rawHw) ? rawHw : fallbackHealthWatch(snap, st, elapsed);
    } catch {
      st = fallbackAutopilotState(snap);
      hw = fallbackHealthWatch(snap, st);
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
    return el('div', { class: 'v2li ap-log-row', 'data-log': String(l.id), style: hiddenKeys.has(key) ? 'opacity:.4' : undefined },
      ic('robot'),
      el('div', { class: 'grow' },
        el('div', { class: 'ap-log-top' },
          chip(l.dry_run ? 'DRY-RUN' : 'APPLIED', l.dry_run ? 'a' : 'g'),
          l.undone_at ? chip('undone', 'k') : null),
        el('b', {}, formatRobotLogLine(l)),
        el('small', {}, `${ago(l.at)} · ${both(l.at, true)}`)),
      undoBtn);
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

    const killCard = el('section', { class: `v2card ap-kill ${st.paused ? 'is-paused' : ''}`, id: 'apKillSwitch' },
      el('div', { class: 'ap-kill-info' },
        el('b', {}, st.paused ? 'All robots are PAUSED' : 'Master kill switch'),
        el('div', { class: 'v2sub' }, st.paused
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

    body.replaceChildren(
      killCard,
      hbCard,
      healthCard,
      el('div', { class: 'v2sec' }, `Robots · ${st.robots.length}`),
      el('div', { id: 'apRobots' }, ...st.robots.map(renderRobot)),
      el('div', { class: 'v2sec' }, 'Robot action log'),
      el('div', { class: 'v2chips' }, ...filterOpts.map(([k, label]) => {
        const b = el('button', { type: 'button', class: apLogFilter === k ? 'on' : '', id: `aplf-${k}` }, label);
        b.onclick = () => { apLogFilter = k; paint(); };
        return b;
      })),
      filteredLogs.length
        ? el('div', { class: 'v2card v2list', id: 'apLog' }, ...filteredLogs.map(renderLogRow))
        : el('div', { class: 'v2card v2sub', id: 'apLogEmpty' }, 'No robot actions logged for this filter yet.'));
  };

  rerender = () => paint();
  await load();
}

/** Router hook: returns true when the hash is a v2 screen. */
export function v2Route(a: string, b?: string): boolean {
  if (a === 'today' || a === '') { todayView(); return true; }
  if (a === 'inbox') { inboxView(); return true; }
  if (a === 'auto') { autoView(); return true; }
  if (a === 'people') { peopleView(); return true; }
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
export { flush as v2Flush };
