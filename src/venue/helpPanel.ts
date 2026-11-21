/**
 * Admin "Help" panel (0120, 18 Nov 2026 · founder: "a bigger and better panel for monitoring help chats").
 *   #help         every member <-> Kring Team conversation: English preview, time ago (IST), status chip, Waiting · All · Today
 *   #help/<uid>   the whole chat in big bubbles (member left, Kring Team right), English under EVERY Thai line, a member strip
 *                 (verified, joined, live Reels, board, open flags → member page), and an English composer with Sonnet's
 *                 draft + one-tap quick replies. Sending uses the same path as the Needs you cards (sendTeamReply).
 * Refreshes every 20 s without touching what the founder is typing. English-only chrome; Thai only reaches the member.
 */
import { el, rpc } from './shared';
import { closeHelpNoReply, sendFailReason, sendTeamReply } from './adminHelp';
import { hasThaiText, helpQuestion, sortHelpCases, type HelpCase } from './adminHelpLogic';
import { flagKeyLabel, type ProtectFlagKey } from './autopilotLogic';
import {
  HELP_FILTERS, HELP_POLL_MS, agoIst, clockIst, dayLabel, englishOf, filterCounts, filterThreads, helpStatus, isHelpThread, isHelpThreadDetail,
  istDay, latestDraft, memberWritesThai, previewLine, quickReplies, sortThreads, statusChip, threadWaitMin, threadsFromCases, detailFromCase,
  type HelpFilter, type HelpThread, type HelpThreadDetail, type HelpThreadMsg,
} from './helpPanelLogic';
import { HELP_RISK_MIN } from './adminHelpLogic';
import './helpPanel.css';

type Kid = Node | string | null | undefined | false;
type Screen = (...kids: Kid[]) => HTMLElement;

interface MemberLite {
  card: null | { no: number; name: string; photo: string | null; verified: boolean; joined_at: string; who?: string; area?: string };
  reels: { status: string; hidden: boolean }[];
  board: { rank: number; rings: number } | null;
  rings_week: { score: number | null } | null;
  links: { user_id: string; no: number | null; reason: string; dismissed: boolean }[];
  kind?: string;
}

// ───────── state (survives the 20 s refresh and going list ↔ chat) ─────────
let timer = 0;
let threads: HelpThread[] | null = null;
let threadsAt = 0;
let fallbackNote = '';
let filter: HelpFilter = (() => { try { return (localStorage.getItem('kr8-help-f') as HelpFilter) || 'waiting'; } catch { return 'waiting'; } })();
/** what the founder typed per member, kept until sent */
const typed = new Map<string, string>();
const memberCache = new Map<string, { at: number; m: MemberLite | null }>();
const photoMap: Record<string, string> = {};
/** live prize / Rings rules for the quick replies (null = app defaults) */
let rules: Record<string, number> | null = null;
/** messages just sent, shown at once until the next load includes them */
const pendingSent = new Map<string, HelpThreadMsg[]>();

export function helpPanelLeave() { clearInterval(timer); timer = 0; }

async function loadThreads(): Promise<HelpThread[]> {
  try {
    const r = await rpc<unknown>('kr8_admin_help_threads');
    fallbackNote = '';
    threads = sortThreads(Array.isArray(r) ? r.filter(isHelpThread) : []);
  } catch (e) {
    // before 0120 is applied: the waiting chats still show (from the Needs you cases)
    if ((e as Error).message === 'KR8_ADMIN_ONLY') throw e;
    const cases = sortHelpCases(await rpc<unknown>('kr8_admin_help_cases').then((r) => (Array.isArray(r) ? (r as HelpCase[]) : [])));
    fallbackNote = 'Showing waiting chats only until database update 0120 is applied.';
    threads = sortThreads(threadsFromCases(cases));
  }
  threadsAt = Date.now();
  void loadPhotos(threads);
  return threads;
}
async function loadPhotos(list: HelpThread[]) {
  const need = list.filter((t) => !(t.photo && /^https?:/.test(t.photo)) && !(t.member in photoMap)).map((t) => t.member).slice(0, 80);
  if (!need.length) return;
  const got = await rpc<Record<string, string>>('kr8_admin_v2_photos', { p_users: need }).catch(() => ({} as Record<string, string>));
  for (const id of need) photoMap[id] = got?.[id] || '';
  document.querySelectorAll<HTMLElement>('[data-hp-av]').forEach((n) => {
    const src = photoMap[n.dataset.hpAv || ''];
    if (src && n.tagName !== 'IMG') n.replaceWith(el('img', { class: n.className, src, alt: '', 'data-hp-av': n.dataset.hpAv }));
  });
}
async function loadThread(member: string): Promise<HelpThreadDetail> {
  try {
    const r = await rpc<unknown>('kr8_admin_help_thread', { p_member: member });
    if (!isHelpThreadDetail(r)) throw new Error('bad');
    return { member, unanswered: Number(r.unanswered) || 0, flags: Array.isArray(r.flags) ? r.flags : [], messages: r.messages };
  } catch (e) {
    if ((e as Error).message === 'KR8_ADMIN_ONLY') throw e;
    const cases = await rpc<unknown>('kr8_admin_help_cases').then((r) => (Array.isArray(r) ? (r as HelpCase[]) : []));
    const c = cases.find((x) => x.member === member);
    if (!c) return { member, unanswered: 0, flags: [], messages: [] };
    return detailFromCase(c);
  }
}
async function loadMember(member: string): Promise<MemberLite | null> {
  const hit = memberCache.get(member);
  if (hit && Date.now() - hit.at < 60_000) return hit.m;
  const m = await rpc<MemberLite>('kr8_admin_v2_member', { p_user: member }).catch(() => null);
  memberCache.set(member, { at: Date.now(), m });
  return m;
}

// ───────── bits ─────────
function avatar(member: string, name: string | null, photo: string | null, size: number): HTMLElement {
  const src = photo && /^https?:/.test(photo) ? photo : photoMap[member] || '';
  const style = `width:${size}px;height:${size}px`;
  return src ? el('img', { class: 'hp-av', src, alt: '', style, 'data-hp-av': member })
    : el('span', { class: 'hp-av none', style, 'data-hp-av': member }, (name || '?').slice(0, 1).toUpperCase());
}
const who = (t: { name: string | null; member_no: number | null }) => `${t.name || 'Member'}${t.member_no ? ` #${t.member_no}` : ''}`;
function head(title: string, sub: Kid, back: string, onRefresh: () => void): HTMLElement {
  const fresh = el('button', { type: 'button', class: 'v2fresh', id: 'hpFresh', title: 'Tap to refresh now' }, 'Live · 20 s');
  fresh.onclick = () => { fresh.textContent = 'Refreshing…'; onRefresh(); };
  return el('header', { class: 'v2hd hp-hd' },
    el('a', { class: 'v2back', href: back, 'aria-label': 'Back' }, backIcon()),
    el('div', { class: 'grow' }, el('h1', {}, title), sub ? el('div', { class: 'v2sub', id: 'hpSub' }, sub) : null), fresh);
}
function backIcon(): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = '<path d="M15 5l-7 7 7 7"/>'; return s;
}
function startPoll(tick: () => void) {
  clearInterval(timer);
  timer = window.setInterval(() => { if (document.visibilityState === 'visible') tick(); }, HELP_POLL_MS);
}

// ───────── #help: every conversation ─────────
export function helpPanelView(screen: Screen, member?: string, onCount?: (waiting: number) => void) {
  if (member) { void chatView(screen, member, onCount); return; }
  const sub = el('span', {}, 'Loading…');
  const chips = el('div', { class: 'v2chips hp-chips', id: 'hpFilters', role: 'tablist' });
  const note = el('p', { class: 'hp-note', id: 'hpNote' });
  const list = el('div', { class: 'hp-list', id: 'hpList' }, el('div', { class: 'v2card v2load' }, 'Loading…'));
  const paint = () => {
    if (!threads) return;
    const now = Date.now();
    const counts = filterCounts(threads, now);
    const late = threads.filter((t) => helpStatus(t) !== 'answered' && threadWaitMin(t, now) > HELP_RISK_MIN).length;
    sub.textContent = `${counts.waiting} waiting${late ? ` · ${late} past 45 min` : ''} · ${threads.length} chat${threads.length === 1 ? '' : 's'}`;
    chips.replaceChildren(...HELP_FILTERS.map((f) => {
      const b = el('button', { type: 'button', class: filter === f.key ? 'on' : '', 'data-f': f.key, role: 'tab', 'aria-selected': String(filter === f.key) },
        f.label, el('span', { class: 'n' }, String(counts[f.key])));
      b.onclick = () => { filter = f.key; try { localStorage.setItem('kr8-help-f', f.key); } catch { /* private mode */ } paint(); };
      return b;
    }));
    note.textContent = fallbackNote;
    const shown = filterThreads(threads, filter, now);
    list.replaceChildren(...(shown.length ? shown.map((t) => row(t, now)) : [el('div', { class: 'hp-empty', id: 'hpEmpty' },
      el('b', {}, filter === 'waiting' ? 'Nobody is waiting' : filter === 'today' ? 'No Help chats today' : 'No Help chats yet'),
      el('span', {}, filter === 'waiting' ? 'Every member has an answer.' : 'New chats show here by themselves.'))]));
    onCount?.(threads.filter((t) => t.unanswered > 0).length);
  };
  const refresh = () => loadThreads().then(paint).then(() => { const f = document.getElementById('hpFresh'); if (f) f.textContent = 'Live · 20 s'; })
    .catch((e) => list.replaceChildren(el('div', { class: 'v2card v2err' }, el('b', {}, 'Help chats could not load'), el('div', { class: 'v2sub' }, String((e as Error).message)))));
  screen(head('Help', sub, '#inbox', () => void refresh()), chips, note, list);
  if (threads && Date.now() - threadsAt < HELP_POLL_MS) paint();
  void refresh();
  startPoll(() => void refresh());
}

function row(t: HelpThread, now: number): HTMLElement {
  const st = statusChip(t, now);
  return el('a', { class: `hp-row s-${helpStatus(t)}${st.tone === 'r' ? ' late' : ''}`, href: `#help/${t.member}`, 'data-member': t.member },
    avatar(t.member, t.name, t.photo, 48),
    el('div', { class: 'hp-row-mid' },
      el('div', { class: 'hp-row-top' }, el('b', {}, who(t)), t.test ? el('span', { class: 'v2chip k' }, 'test') : null,
        el('small', { class: 'hp-ago' }, agoIst(t.last_at, now))),
      el('p', { class: 'hp-prev' }, previewLine(t)),
      el('span', { class: `v2chip ${st.tone} hp-st` }, st.text, t.unanswered > 1 ? ` · ${t.unanswered} messages` : '')));
}

// ───────── #help/<uid>: one chat ─────────
async function chatView(screen: Screen, member: string, onCount?: (waiting: number) => void) {
  const t0 = threads?.find((t) => t.member === member);
  const title = el('span', {}, t0 ? who(t0) : 'Help chat');
  const strip = el('a', { class: 'hp-strip', href: `#m/${member}`, id: 'hpStrip' }, avatar(member, t0?.name || null, t0?.photo || null, 56),
    el('div', { class: 'grow' }, el('b', {}, t0 ? who(t0) : 'Member'), el('small', {}, 'Loading member…')));
  const flagsRow = el('div', { class: 'hp-flags', id: 'hpFlags' });
  const msgs = el('div', { class: 'hp-msgs', id: 'hpMsgs', 'aria-live': 'polite' }, el('div', { class: 'v2card v2load' }, 'Loading chat…'));
  const state = el('p', { class: 'hp-state', id: 'hpState' });

  const ta = el('textarea', { class: 'hp-ta', id: 'hpText', rows: '3', maxlength: '2000', placeholder: 'Write your reply in English…' }) as HTMLTextAreaElement;
  ta.value = typed.get(member) || '';
  let touched = !!ta.value;
  ta.oninput = () => { touched = true; if (ta.value) typed.set(member, ta.value); else typed.delete(member); };
  const hint = el('small', { class: 'hp-hint', id: 'hpHint' }, 'Edit, then tap Send · never automatic');
  if (!rules) void rpc<Record<string, number>>('kr8_rings_rules').then((r) => { if (r && typeof r === 'object') rules = r; }).catch(() => undefined);
  const qr = el('div', { class: 'hp-quick', id: 'hpQuick' }, ...quickReplies().map((q) => {
    const b = el('button', { type: 'button', 'data-q': q.id }, q.label);
    b.onclick = () => { const text = quickReplies(rules).find((x) => x.id === q.id)?.text || q.text; ta.value = text; touched = true; typed.set(member, text); ta.focus(); };
    return b;
  }));
  const send = el('button', { type: 'button', class: 'v2btn ok hp-send', id: 'hpSend' }, 'Send as Kring Team');
  const status = el('small', { class: 'hp-status', id: 'hpStatus', role: 'status' });
  // 0122: close the case without sending anything (shown only while the member is waiting)
  const noReply = el('button', { type: 'button', class: 'v2btn hp-noreply', id: 'hpNoReply', title: 'Close this case without sending a message', hidden: true }, 'No reply needed') as HTMLButtonElement;
  const composer = el('div', { class: 'hp-comp', id: 'hpComp' }, qr, ta, el('div', { class: 'hp-comp-row' }, hint, noReply, send), status);

  let detail: HelpThreadDetail | null = null;
  let draft: { en: string; th: string } | null = null;
  const paint = (scroll: boolean) => {
    if (!detail) return;
    const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 160;
    const sent = (pendingSent.get(member) || []).filter((p) => !detail!.messages.some((m) => m.from === 'team' && m.body === p.body && Date.parse(m.at) >= Date.parse(p.at) - 120_000));
    if (sent.length) pendingSent.set(member, sent); else pendingSent.delete(member);
    msgs.replaceChildren(...bubbles([...detail.messages, ...sent], t0?.name || null));
    const thai = memberWritesThai(detail);
    draft = latestDraft(detail);
    hint.textContent = thai ? 'English · member gets Thai · never automatic' : 'Edit, then tap Send · never automatic';
    ta.placeholder = thai ? 'Write your reply in English. It is sent to the member in Thai.' : 'Write your reply…';
    if (!touched && !ta.value && draft) { ta.value = draft.en; hint.textContent = `Suggested reply · ${hint.textContent}`; }
    const t = threads?.find((x) => x.member === member);
    const waiting = detail.unanswered > 0;
    const firstWait = waiting ? lastRunStart(detail.messages) : null;
    const min = firstWait ? Math.floor((Date.now() - Date.parse(firstWait)) / 60_000) : 0;
    const chip = statusChip({ unanswered: detail.unanswered, team_replied: detail.messages.some((m) => m.from === 'team'), waiting_since: firstWait }, Date.now());
    noReply.hidden = !waiting;
    state.className = `hp-state ${chip.tone}`;
    state.textContent = waiting ? `${chip.text}${min > HELP_RISK_MIN ? (min >= 60 ? ' · 1-hour promise missed' : ' · 1-hour promise at risk') : ''}` : `Answered${t ? ` · last message ${agoIst(t.last_at)}` : ''}`;
    flagsRow.replaceChildren(...flagChips(member, detail));
    if (scroll || nearBottom) requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
  };
  let memberLite: MemberLite | null = null;
  const paintStrip = () => {
    const m = memberLite; const c = m?.card; const t = threads?.find((x) => x.member === member);
    const name = c ? `${c.name} #${c.no}` : t ? who(t) : 'Member';
    title.textContent = name;
    const live = m ? m.reels.filter((r) => r.status === 'approved' && !r.hidden).length : null;
    strip.replaceChildren(avatar(member, c?.name || t?.name || null, c?.photo || t?.photo || null, 56),
      el('div', { class: 'grow' },
        el('b', {}, name),
        el('small', {}, [c?.verified ?? t?.verified ? '✓ verified' : 'not verified yet', c ? `joined ${agoIst(c.joined_at)}` : '', t?.test ? 'test account' : ''].filter(Boolean).join(' · ')),
        el('div', { class: 'hp-stats' },
          el('span', {}, el('b', {}, live == null ? '–' : String(live)), ` live Reel${live === 1 ? '' : 's'}`),
          el('span', {}, el('b', {}, m?.board ? `#${m.board.rank}` : '–'), ' on board'),
          el('span', {}, el('b', {}, String(m?.rings_week?.score ?? m?.board?.rings ?? 0)), ' Rings this week'))),
      el('span', { class: 'hp-go', 'aria-hidden': 'true' }, '›'));
    if (detail) flagsRow.replaceChildren(...flagChips(member, detail));
  };
  const flagChips = (uid: string, d: HelpThreadDetail): HTMLElement[] => {
    const out: HTMLElement[] = [];
    for (const l of memberLite?.links || []) {
      if (l.dismissed) continue;
      const face = l.reason.startsWith('face');
      out.push(el('a', { class: `v2chip ${face ? 'r' : 'a'}`, href: `#m/${uid}`, 'data-flag': face ? 'lookalike' : 'shared' }, face ? `Look-alike #${l.no ?? '?'}` : `Same phone/Wi-Fi #${l.no ?? '?'}`));
    }
    for (const f of d.flags) out.push(el('a', { class: `v2chip ${f.severity === 'red' ? 'r' : 'a'}`, href: `#m/${uid}`, 'data-flag': f.key }, flagKeyLabel(f.key as ProtectFlagKey)));
    return out;
  };

  const refresh = (scroll = false) => Promise.all([
    loadThread(member).then((d) => { detail = d; paint(scroll); }),
    loadMember(member).then((m) => { memberLite = m; paintStrip(); }),
  ]).then(() => { const f = document.getElementById('hpFresh'); if (f) f.textContent = 'Live · 20 s'; })
    .catch((e) => msgs.replaceChildren(el('div', { class: 'v2card v2err' }, el('b', {}, 'Chat could not load'), el('div', { class: 'v2sub' }, String((e as Error).message)))));

  send.onclick = async () => {
    const en = ta.value.trim();
    if (!en) { ta.focus(); return; }
    const thai = detail ? memberWritesThai(detail) : hasThaiText(t0?.last_body || '');
    if (send.hasAttribute('disabled')) return;
    send.setAttribute('disabled', ''); ta.setAttribute('disabled', ''); send.textContent = 'Sending…';
    status.className = 'hp-status busy'; status.textContent = thai ? 'Translating to Thai…' : 'Sending…';
    try {
      const r = await sendTeamReply({ member, en, memberThai: thai, draftTh: draft?.th, draftEn: draft?.en, onStep: (s) => { status.textContent = s; } });
      // show it at once; the next load brings the real row
      pendingSent.set(member, [...(pendingSent.get(member) || []), { from: 'team', body: r.body, translation_en: r.en, at: new Date().toISOString(), pending: true }]);
      if (detail) detail = { ...detail, unanswered: 0 };
      typed.delete(member); ta.value = ''; touched = true;
      status.className = 'hp-status ok'; status.textContent = `Sent as Kring Team ✓${r.id ? ` · message #${r.id}` : ''}`;
      if (threads) { threads = sortThreads(threads.map((x) => (x.member === member ? { ...x, unanswered: 0, waiting_since: null, team_replied: true, last_from: 'team' as const, last_body: r.body, last_en: r.en, last_at: new Date().toISOString() } : x))); onCount?.(threads.filter((x) => x.unanswered > 0).length); }
      paint(true);
      void refresh();
    } catch (e) {
      status.className = 'hp-status bad'; status.textContent = `Not sent — ${sendFailReason(e)}`;
      status.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    } finally {
      send.removeAttribute('disabled'); ta.removeAttribute('disabled'); send.textContent = 'Send as Kring Team';
    }
  };

  noReply.onclick = async () => {
    noReply.disabled = true; send.setAttribute('disabled', '');
    status.className = 'hp-status'; status.textContent = 'Closing…';
    try {
      await closeHelpNoReply(member);
      if (detail) detail = { ...detail, unanswered: 0 };
      status.className = 'hp-status ok'; status.textContent = 'Closed · no message sent ✓';
      if (threads) { threads = sortThreads(threads.map((x) => (x.member === member ? { ...x, unanswered: 0, waiting_since: null } : x))); onCount?.(threads.filter((x) => x.unanswered > 0).length); }
      paint(false);
      void refresh();
    } catch (e) {
      status.className = 'hp-status bad'; status.textContent = `Not closed: ${(e as Error).message}`;
    } finally {
      noReply.disabled = false; send.removeAttribute('disabled');
    }
  };

  screen(head('Help chat', title, '#help', () => void refresh()), strip, flagsRow, msgs, state, composer);
  paintStrip();
  await refresh(true);
  if (!threads) void loadThreads().then(() => paintStrip()).catch(() => undefined);
  startPoll(() => void refresh());
}

/** when the member's current unanswered run started */
function lastRunStart(list: HelpThreadMsg[]): string | null {
  let start: string | null = null;
  for (const m of list) start = m.from === 'team' ? null : start || m.at;
  return start;
}

function bubbles(list: HelpThreadMsg[], memberName: string | null): HTMLElement[] {
  const out: HTMLElement[] = [];
  let day = '';
  for (const m of list) {
    const d = istDay(m.at);
    if (d !== day) { day = d; out.push(el('div', { class: 'hp-day' }, el('span', {}, dayLabel(m.at)))); }
    const text = m.from === 'member' ? helpQuestion(m.body) : m.body;
    const thai = hasThaiText(text);
    const tr = (m.translation_en || '').trim();
    out.push(el('div', { class: `hp-b ${m.from}${m.pending ? ' pending' : ''}`, 'data-msg': m.id != null ? String(m.id) : undefined },
      el('div', { class: 'hp-b-body' },
        el('p', { class: 'hp-b-text' }, text),
        thai ? el('p', { class: `hp-b-en${tr ? '' : ' none'}` }, tr ? `EN: ${tr}` : `EN: ${englishOf(text, null)}`) : null),
      el('small', { class: 'hp-b-meta' }, `${m.from === 'team' ? 'Kring Team' : memberName || 'Member'} · ${clockIst(m.at)} IST${m.pending ? ' · sending' : ''}`)));
  }
  if (!list.length) out.push(el('div', { class: 'hp-empty' }, el('b', {}, 'No messages yet'), el('span', {}, 'Write the first message below.')));
  return out;
}
