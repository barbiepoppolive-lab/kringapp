/**
 * 19 Nov Ring-farming check (0123). SELF-CONTAINED so adminV2 only needs three one-line hooks:
 *   farmSection()          → the red / amber cards at the top of Needs you (one case per card); fills itself
 *   farmBoardMark(root)    → a "Ring-farming?" chip on the board row of each beneficiary
 *   farmAlertList(box)     → the cases inside the protect "Ring-farming" alert sheet
 * Tapping a card / chip / row opens the full case sheet (#x/farm/<uid>): who, the plain-English lines, Rings now vs if counted once
 * vs if not counted, every account with photo (tap → member page), and the 4 decisions (logged, reversible, scoring only).
 */
import { el, rpc } from './shared';
import { openSheet, sheetOpen, xbtn, xrow, xsec } from './adminSheet';
import {
  decisionWords, farmCompare, farmHeadline, farmSignals, farmVerdict, giverLines, isFarmData, nameTag, savedWords, tag,
  type FarmAction, type FarmCase, type FarmData, type FarmGiver,
} from './farmLogic';
import './farmCheck.css';

let cache: { at: number; data: FarmData | null } | null = null;
let inflight: Promise<FarmData | null> | null = null;
const photos = new Map<string, string>();

/** null when the database has no 0123 yet (nothing shows, nothing breaks) */
export function loadFarm(force = false): Promise<FarmData | null> {
  if (!force && cache && Date.now() - cache.at < 25_000) return Promise.resolve(cache.data);
  if (inflight) return inflight;
  inflight = rpc<unknown>('kr8_admin_farming_cases').then((r) => (isFarmData(r) ? r : null)).catch(() => null)
    .then((data) => { cache = { at: Date.now(), data }; return data; }).finally(() => { inflight = null; });
  return inflight;
}
/** true when new photos were fetched */
async function loadPhotos(ids: string[]): Promise<boolean> {
  const need = [...new Set(ids)].filter((id) => id && !photos.has(id)).slice(0, 80);
  if (!need.length) return false;
  const got = await rpc<Record<string, string>>('kr8_admin_v2_photos', { p_users: need }).catch(() => ({} as Record<string, string>));
  for (const id of need) photos.set(id, (got && got[id]) || '');
  return true;
}
const face = (p: { user_id: string; name: string | null }, cls = 'fc-av') => {
  const src = photos.get(p.user_id);
  return src ? el('img', { class: cls, src, alt: '' }) : el('span', { class: `${cls} none` }, (p.name || '?').slice(0, 1));
};
const caseTone = (d: FarmData, c: FarmCase) => {
  const v = farmVerdict(c, d.week_start);
  return v.kind === 'fake' || (c.beneficiary.rank != null && c.beneficiary.rank <= d.paid_ranks && v.kind !== 'organic') ? 'r' : v.kind === 'organic' ? 'f' : 'a';
};

// ───────── Needs you: one card per case ─────────
function farmCard(d: FarmData, c: FarmCase): HTMLElement {
  const b = c.beneficiary; const v = farmVerdict(c, d.week_start); const sig = farmSignals(c, d.week_start); const cmp = farmCompare(d, c);
  const shown = c.givers.slice(0, 7);
  const dec = decisionWords(c.decision);
  const card = el('article', { class: `v2card v2item v2case fc-card t-${caseTone(d, c)}`, 'data-item': `farm:${b.user_id}`, id: `fcCase-${b.user_id}`, role: 'button', tabindex: '0' },
    el('div', { class: 'v2item-top' }, el('span', { class: 'v2chip r fc-k' }, 'Ring-farming check'),
      el('small', { class: 'v2wait' }, b.rank != null ? `${tag(b.no)} is #${b.rank} · ${b.rings} Rings` : `${b.rings} Rings`)),
    el('h3', { class: 'v2q' }, farmHeadline(c, d.week_start)),
    el('div', { class: 'fc-faces' }, face(b, 'fc-av big'), el('span', { class: 'fc-arrow', 'aria-hidden': 'true' }, '←'),
      ...shown.map((g) => face(g)), c.givers.length > shown.length ? el('span', { class: 'fc-av more' }, `+${c.givers.length - shown.length}`) : null),
    el('b', { class: `fc-verdict ${v.tone}` }, v.title),
    el('ul', { class: 'fc-sig' }, ...sig.filter((s) => s.tone === 'r').concat(sig.filter((s) => s.tone === 'a')).slice(0, 2).concat(sig.filter((s) => s.tone === 'g').slice(0, 1))
      .map((s) => el('li', { class: s.tone }, s.text))),
    el('div', { class: 'fc-cmp-line' }, el('span', {}, el('b', {}, String(cmp.now)), ' now'), el('span', {}, el('b', {}, String(cmp.once)), ' if each counts once'),
      el('span', {}, el('b', {}, String(cmp.none)), ' if not counted')),
    dec ? el('small', { class: 'fc-dec' }, dec) : null,
    el('div', { class: 'v2acts' }, el('button', { type: 'button', class: 'v2btn ok', id: `fcOpen-${b.user_id}` }, 'See the case & decide')));
  card.onclick = (e) => { if ((e.target as HTMLElement).closest('a')) return; openFarmSheet(b.user_id); };
  return card;
}

/** the block at the top of Needs you; empty (and hidden) when there is no case or no 0123 */
export function farmSection(): HTMLElement {
  const box = el('section', { id: 'v2Farm', class: 'fc-sec', hidden: true });
  const paint = (d: FarmData | null) => {
    const cases = d?.cases || [];
    box.hidden = !cases.length;
    if (!d || !cases.length) { box.replaceChildren(); return; }
    box.replaceChildren(...cases.map((c) => farmCard(d, c)));
  };
  void loadFarm().then(async (d) => { await loadPhotos((d?.cases || []).flatMap((c) => [c.beneficiary.user_id, ...c.givers.slice(0, 7).map((g) => g.user_id)])); paint(d); });
  return box;
}

// ───────── the case sheet ─────────
function compareBox(d: FarmData, c: FarmCase): HTMLElement {
  const cmp = farmCompare(d, c); const max = Math.max(cmp.full, 1);
  const bar = (label: string, n: number, rank: number, on: boolean, id: string) => el('div', { class: `fc-bar${on ? ' on' : ''}`, id },
    el('div', { class: 'fc-bar-t' }, el('span', {}, label, on ? el('em', {}, ' · now') : null), el('b', {}, `${n} Rings · #${rank}`)),
    el('div', { class: 'fc-bar-b' }, el('i', { style: `width:${Math.max(3, Math.round((n / max) * 100))}%` })));
  return el('div', { class: 'fc-cmp' },
    bar('Count fully', cmp.full, cmp.rankFull, cmp.mode === 'full', 'fcBarFull'),
    bar('Count each friend once', cmp.once, cmp.rankOnce, cmp.mode === 'once', 'fcBarOnce'),
    bar('Don’t count these', cmp.none, cmp.rankNone, cmp.mode === 'none', 'fcBarNone'));
}
function giverRow(g: FarmGiver, me: number | null): HTMLElement {
  const L = giverLines(g, me);
  return el('a', { class: 'fc-g', href: `#m/${g.user_id}`, 'data-uid': g.user_id },
    face(g),
    el('span', { class: 'grow' }, el('b', {}, nameTag(g)), el('small', {}, L.joined),
      el('span', { class: 'fc-chips' }, ...L.chips.map((ch) => el('span', { class: `fc-chip ${ch.tone}` }, ch.text)))),
    el('span', { class: 'fc-gave' }, el('b', {}, L.gave), el('small', { class: L.share >= 80 ? 'r' : '' }, `${L.share}% to ${tag(me)}`)));
}
function sheetSpec(d: FarmData, c: FarmCase, status?: string, undo?: () => void) {
  const b = c.beneficiary; const v = farmVerdict(c, d.week_start); const sig = farmSignals(c, d.week_start);
  const ids = c.givers.map((g) => g.user_id);
  const mode = c.decision?.score_mode || 'full'; const hold = !!c.decision?.hold;
  const act = (a: FarmAction) => () => void decide(b.user_id, a, ids);
  const btn = (label: string, tone: '' | 'ok' | 'bad' | 'pri', id: string, a: FarmAction, on: boolean) => {
    const x = xbtn(on ? `✓ ${label}` : label, tone, id, act(a)); if (on) x.classList.add('fc-on'); x.setAttribute('aria-pressed', String(on)); return x;
  };
  return {
    kind: 'farm', id: b.user_id, title: `Ring-farming check · ${nameTag(b)}`,
    who: [{ user_id: b.user_id, no: b.no, name: b.name, photo: photos.get(b.user_id) || null,
      sub: `${b.rank != null ? `#${b.rank} on the board · ` : ''}${b.rings} Rings now · ${b.verified ? 'face-verified' : 'not face-verified'}` }],
    why: `${v.title}. ${v.reason}`,
    evidence: [
      status ? el('div', { class: 'fc-status', id: 'fcStatus', role: 'status' }, status, undo ? undoBtn(undo) : null) : null,
      xsec('What we see'),
      ...sig.map((s) => xrow(s.text, null, { tone: s.tone })),
      xsec('Rings this week'),
      compareBox(d, c),
      xsec(`The ${c.givers.length} account${c.givers.length === 1 ? '' : 's'} · tap one to open`),
      el('div', { class: 'fc-gs', id: 'fcGivers' }, ...c.givers.map((g) => giverRow(g, b.no))),
    ],
    faint: 'Only likes the board counts make Rings (face-verified accounts, or accounts older than 3 days). "Each friend once" = each account adds at most one like (1 Ring) this week. Nothing is deleted; you can change this any time this week.',
    actions: [
      btn('Count fully', '', 'fcFull', 'full', mode === 'full' && !!c.decision),
      btn('Count each friend once', 'pri', 'fcOnce', 'once', mode === 'once'),
      btn('Don’t count these', 'bad', 'fcNone', 'none', mode === 'none'),
      hold ? btn('Prize on hold · release', '', 'fcHold', 'unhold', true) : btn('Hold prize', '', 'fcHold', 'hold', false),
    ],
  };
}
function undoBtn(fn: () => void): HTMLElement {
  const u = el('button', { type: 'button', class: 'fc-undo', id: 'fcUndo' }, 'Undo'); u.onclick = fn; return u;
}
/** opens the case sheet for this beneficiary (loads the cases first when needed) */
export function openFarmSheet(uid: string, status?: string, undo?: () => void): void {
  const show = (d: FarmData | null) => {
    const c = d?.cases.find((x) => x.beneficiary.user_id === uid);
    if (!d || !c) { openSheet({ kind: 'farm', id: uid, title: 'Ring-farming check', why: 'No Ring-farming case for this member this week.' }); return; }
    openSheet(sheetSpec(d, c, status, undo));
  };
  if (cache?.data) {
    show(cache.data);
    const c = cache.data.cases.find((x) => x.beneficiary.user_id === uid);
    void loadPhotos([uid, ...(c?.givers || []).map((g) => g.user_id)]).then((got) => { const o = sheetOpen(); if (got && o?.spec.kind === 'farm' && o.spec.id === uid) show(cache!.data); });
    return;
  }
  void loadFarm().then(async (d) => { await loadPhotos((d?.cases.find((x) => x.beneficiary.user_id === uid)?.givers || []).map((g) => g.user_id).concat(uid)); show(d); });
}
/** writes the decision, reloads the case, and reopens the sheet with a "Saved — …" line (and Undo) */
export async function decide(uid: string, a: FarmAction, givers: string[]): Promise<void> {
  const before = cache?.data?.cases.find((x) => x.beneficiary.user_id === uid);
  const prev: FarmAction | null = !before ? null : a === 'hold' || a === 'unhold' ? (before.decision?.hold ? 'hold' : 'unhold') : (before.decision?.score_mode || 'full');
  try {
    const r = await rpc<{ rings?: number | null }>('kr8_admin_farming_decide', { p_beneficiary: uid, p_action: a, p_givers: givers, p_note: null });
    await loadFarm(true);
    const who = before ? tag(before.beneficiary.no) : 'This member';
    openFarmSheet(uid, savedWords(a, r?.rings, who), prev && prev !== a ? () => void decide(uid, prev, givers) : undefined);
    const sec = document.getElementById('v2Farm');
    if (sec && cache?.data) { const c = cache.data.cases.find((x) => x.beneficiary.user_id === uid); const old = document.getElementById(`fcCase-${uid}`); if (c && old) old.replaceWith(farmCard(cache.data, c)); }
  } catch (e) {
    openFarmSheet(uid, `Did not save: ${(e as Error).message}`);
  }
}

// ───────── board and alert hooks ─────────
/** a "Ring-farming?" chip on each beneficiary's board row (tap → the case) */
export function farmBoardMark(root: HTMLElement | null): void {
  if (!root) return;
  void loadFarm().then((d) => {
    for (const c of d?.cases || []) {
      const row = root.querySelector<HTMLElement>(`.v2brow[data-uid="${CSS.escape(c.beneficiary.user_id)}"]`);
      if (!row || row.querySelector('.fc-board')) continue;
      const v = farmVerdict(c, d!.week_start);
      const chip = el('span', { class: `v2chip ${v.tone === 'g' ? 'a' : v.tone} fc-board v2tap`, role: 'button', id: `fcBoard-${c.beneficiary.user_id}` }, 'Ring-farming?');
      chip.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openFarmSheet(c.beneficiary.user_id); };
      (row.querySelector('.grow') || row).append(chip);
    }
  });
}
/** inside the protect "Ring-farming" alert sheet: one row per case */
export async function farmAlertList(box: HTMLElement): Promise<void> {
  const d = await loadFarm();
  if (!d?.cases.length) return;
  box.append(xsec(`Ring-farming check · ${d.cases.length}`), ...d.cases.map((c) => {
    const v = farmVerdict(c, d.week_start);
    return xrow(`${nameTag(c.beneficiary)} · ${c.givers.length} account${c.givers.length === 1 ? '' : 's'}`, v.title,
      { tone: v.tone, id: `fcAlert-${c.beneficiary.user_id}`, onTap: () => openFarmSheet(c.beneficiary.user_id), right: el('span', { class: 'xs-go' }, '›') });
  }));
}
/** test hook */
export function _resetFarm() { cache = null; inflight = null; photos.clear(); }
