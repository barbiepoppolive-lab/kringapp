/**
 * 18 Nov (founder: "Everything inside admin must be tappable further so I can see things and take decisions"):
 * ONE bottom sheet for every "who and why" in admin. Each sheet shows WHO (faces, tap → member page), WHY (one plain sentence),
 * EVIDENCE (rows, photos, a clip) and the decision buttons that already exist for that item.
 * It has its own hash (#x/<kind>/<id>), pushed with history.pushState, so the phone's back button closes it and leaves the page under it as it was.
 */
import { el } from './shared';

type Kid = Node | string | null | undefined | false;
export interface SheetWho { user_id: string | null; no: number | null; name: string | null; photo?: string | null; sub?: string | null }
export interface SheetSpec {
  /** hash parts: #x/<kind>/<id> */
  kind: string; id: string;
  title: string;
  who?: SheetWho[];
  /** ONE plain English sentence: why this is here / what it means */
  why: string;
  /** rows, photos, a clip; strings become small lines */
  evidence?: (HTMLElement | string | null | undefined | false)[];
  /** the decision buttons that already exist for this item */
  actions?: (HTMLElement | null | undefined | false)[];
  /** small faint technical detail (raw numbers live here, never in the sentence) */
  faint?: string | null;
  /** a sheet that fills itself later (rows from the database): called with the body box once mounted */
  load?: (box: HTMLElement) => void | Promise<void>;
}
interface Open { spec: SheetSpec; base: string; hash: string; node: HTMLElement }
let cur: Open | null = null;
/** recently opened sheets, so going back to #x/... from a page the sheet linked to opens it again */
const recent = new Map<string, { spec: SheetSpec; base: string }>();

export const sheetHash = (kind: string, id: string) => `#x/${kind}/${encodeURIComponent(id)}`;
const same = (a: string, b: string) => { try { return decodeURIComponent(a) === decodeURIComponent(b); } catch { return a === b; } };
export const sheetOpen = () => cur;

function whoRow(w: SheetWho): HTMLElement {
  const label = `${w.name || 'Member'}${w.no != null ? ` #${w.no}` : ''}`;
  const face = w.photo ? el('img', { class: 'xs-av', src: w.photo, alt: '' }) : el('span', { class: 'xs-av none' }, (w.name || '?').slice(0, 1));
  const kids: Kid[] = [face, el('span', { class: 'grow' }, el('b', {}, label), w.sub ? el('small', {}, w.sub) : null)];
  return w.user_id ? el('a', { class: 'xs-who', href: `#m/${w.user_id}`, 'data-uid': w.user_id }, ...kids, el('span', { class: 'xs-go', 'aria-hidden': 'true' }, '›'))
    : el('div', { class: 'xs-who' }, ...kids);
}

function mount(spec: SheetSpec): HTMLElement {
  document.getElementById('xSheet')?.remove();
  const close = el('button', { type: 'button', class: 'xs-x', 'aria-label': 'Close', id: 'xSheetClose' }, '×');
  const body = el('div', { class: 'xs-body' },
    spec.who?.length ? el('div', { class: 'xs-whos' }, ...spec.who.map(whoRow)) : null,
    el('p', { class: 'xs-why', id: 'xSheetWhy' }, spec.why),
    ...(spec.evidence || []).filter(Boolean).map((e) => (typeof e === 'string' ? el('small', { class: 'xs-line' }, e) : e as HTMLElement)),
    spec.faint ? el('small', { class: 'xs-faint' }, spec.faint) : null);
  const acts = (spec.actions || []).filter(Boolean) as HTMLElement[];
  const box = el('div', { class: 'xs-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': spec.title },
    el('div', { class: 'xs-grab' }),
    el('div', { class: 'xs-hd' }, el('h3', { class: 'grow' }, spec.title), close),
    body,
    acts.length ? el('div', { class: 'xs-acts', id: 'xSheetActs' }, ...acts) : null);
  const scrim = el('div', { class: 'xs-scrim v2sheet', id: 'xSheet', 'data-kind': spec.kind }, box);
  scrim.onclick = (e) => { if (e.target === scrim) closeSheet(); };
  close.onclick = () => closeSheet();
  document.body.append(scrim);
  if (spec.load) { try { void Promise.resolve(spec.load(body)).catch(() => body.append(el('small', { class: 'xs-line' }, 'Could not load the detail.'))); } catch { /* keep the sheet */ } }
  return scrim;
}

/** Opens (or replaces) the sheet. The back button closes it. */
export function openSheet(spec: SheetSpec): HTMLElement {
  const hash = sheetHash(spec.kind, spec.id);
  const base = cur ? cur.base : (location.hash || '#growth');
  const node = mount(spec);
  try {
    if (cur) history.replaceState({ x: 1 }, '', hash);
    else history.pushState({ x: 1 }, '', hash);
  } catch { /* old browsers: the sheet still works, back just leaves the page */ }
  cur = { spec, base, hash, node };
  recent.set(hash, { spec, base });
  if (recent.size > 20) recent.delete(recent.keys().next().value as string);
  return node;
}
/** Close by going back (so the history stays clean); falls back to removing the sheet. */
export function closeSheet(): void {
  if (!cur) { document.getElementById('xSheet')?.remove(); return; }
  if (same(location.hash, cur.hash)) { try { history.back(); return; } catch { /* fall through */ } }
  unmount();
}
function unmount() { cur?.node.remove(); document.getElementById('xSheet')?.remove(); cur = null; }

/**
 * Router hook, called first on every hash change.
 *  - 'stay'    : the page under the sheet is still on screen (the sheet was just closed with back) → do not re-render
 *  - 'reopen'  : #x/... again (back from a page the sheet linked to) → render `base`, then the sheet is mounted again
 *  - 'missing' : #x/... with nothing to show (a reload) → go to `base`
 *  - null      : not about a sheet → normal routing
 */
export function sheetRoute(): { act: 'stay' } | { act: 'reopen'; base: string; again: () => void } | { act: 'missing' } | null {
  const h = location.hash;
  if (h.startsWith('#x/')) {
    if (cur && same(h, cur.hash)) return { act: 'stay' };
    const hit = [...recent.entries()].find(([k]) => same(k, h));
    if (!hit) return { act: 'missing' };
    const [hash, r] = hit;
    return { act: 'reopen', base: r.base, again: () => { const node = mount(r.spec); cur = { spec: r.spec, base: r.base, hash, node }; } };
  }
  if (cur) {
    const wasBase = same(h, cur.base) && !!document.querySelector('#app .scr');
    unmount();
    if (wasBase) return { act: 'stay' };
  }
  return null;
}

// ───────── small building blocks used inside sheets ─────────
/** one evidence row: a dot, a bold line, a small line; tappable when href / onTap is given */
export function xrow(title: Kid, sub?: Kid, opt: { href?: string; onTap?: () => void; tone?: '' | 'g' | 'a' | 'r'; id?: string; right?: Kid } = {}): HTMLElement {
  const kids: Kid[] = [el('span', { class: `xs-dot ${opt.tone || ''}` }), el('span', { class: 'grow' }, el('b', {}, title), sub ? el('small', {}, sub) : null), opt.right ?? null];
  if (opt.href) return el('a', { class: 'xs-row', href: opt.href, id: opt.id }, ...kids);
  const r = el('div', { class: 'xs-row', id: opt.id }, ...kids);
  if (opt.onTap) { r.onclick = opt.onTap; r.setAttribute('role', 'button'); r.tabIndex = 0; r.classList.add('tap'); }
  return r;
}
export const xsec = (t: string) => el('div', { class: 'xs-sec' }, t);
export function xbtn(label: string, tone: '' | 'ok' | 'bad' | 'pri', id: string, fn: () => void): HTMLButtonElement {
  const b = el('button', { type: 'button', class: `v2btn ${tone}`, id }, label); b.onclick = fn; return b;
}
export const xlink = (label: string, href: string, id?: string, tone = '') =>
  el('a', { class: `v2btn ${tone}`, href, id, ...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {}) }, label);
/** test hook */
export function _resetSheets() { unmount(); recent.clear(); }
