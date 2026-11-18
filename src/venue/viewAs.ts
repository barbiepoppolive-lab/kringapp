/**
 * Admin → More → "View as member" (18 Nov, founder): the REAL member app in a phone frame, as a Visitor, a New member or a Member,
 * in Thai or English, iPhone or Android size. "Spot a bug": tap the problem, type one line → a case in Needs you.
 *
 * Safety: the signed-in personas use hidden mirror sign-ins (0110). kr8_admin_mirror_signin (admins only) hands over a fresh
 * one-time password; this page signs in with a throwaway client and gives the session ONLY to the frame's in-memory storage
 * (index.html), so neither this browser's real Kring sign-in nor the admin's own is touched. Every write from the frame is stopped
 * in the app (adminView.ts guard) and again on the server (0110 triggers).
 */
import { el, rpc } from './shared';
import { MIRROR_AUTH_KEY, v5MirrorSession } from '../v8/v5Live';
import { bugMeta, fitScale, frameSrc, isBugSpots, LANGS, mirrorSeed, PERSONAS, sizeOf, SIZES, tapPoint, type BugSpot, type Lang, type Persona, type Size } from './viewAsLogic';
import './viewAs.css';

type Kid = Node | string | null | undefined | false;
const LS = (k: string, v?: string): string | null => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* private mode */ } return null; };
const pick = <T extends string>(k: string, ok: readonly T[], d: T): T => { const v = LS(k) as T | null; return v && ok.includes(v) ? v : d; };

let persona: Persona = pick('kr8-va-p', ['visitor', 'newmember', 'member'] as const, 'member');
let lang: Lang = pick('kr8-va-l', ['th', 'en'] as const, 'en');
let size: Size = pick('kr8-va-s', ['390x844', '360x780'] as const, '390x844');
let cleanup: (() => void) | null = null;

const appBase = () => location.pathname.replace(/[^/]*$/, '');   // /app/ (admin.html lives next to the app)
type W = Window & { __kr8MirrorSeed?: unknown };

function seg<T extends string>(id: string, items: { key: T; label: string }[], on: T, set: (k: T) => void): HTMLElement {
  return el('div', { class: 'va-seg', id, role: 'tablist' }, ...items.map((it) => {
    const b = el('button', { type: 'button', role: 'tab', class: it.key === on ? 'on' : '', 'aria-selected': String(it.key === on), 'data-k': it.key }, it.label);
    b.onclick = () => { if (it.key !== on) set(it.key); };
    return b;
  }));
}

function toast(text: string, href?: string) {
  document.getElementById('vaToast')?.remove();
  const t = el('div', { class: 'v2toast', id: 'vaToast', role: 'status' }, el('span', {}, text), href ? el('a', { href, class: 'va-tlink' }, 'Open') : null);
  document.body.append(t);
  setTimeout(() => t.remove(), 5000);
}

/** The frame signs in (or stays signed out) and loads. Returns an error text, or null. */
async function loadFrame(frame: HTMLIFrameElement, status: HTMLElement): Promise<void> {
  status.textContent = persona === 'visitor' ? 'Opening as a visitor…' : 'Signing in the mirror account…';
  status.className = 'va-status';
  let session: string | null = null;
  if (persona !== 'visitor') {
    try {
      const r = await rpc<{ email: string; password: string }>('kr8_admin_mirror_signin', { p_persona: persona });
      session = await v5MirrorSession(r.email, r.password);
    } catch (e) {
      const m = String((e as Error).message || e);
      status.textContent = /KR8_NO_MIRROR|function .* does not exist|PGRST202/.test(m) ? 'Needs database update 0110' : `Could not sign in: ${m}`;
      status.className = 'va-status bad';
      return;
    }
  }
  (window as W).__kr8MirrorSeed = mirrorSeed(persona, lang, session, MIRROR_AUTH_KEY);
  frame.src = frameSrc(appBase(), lang);
  frame.onload = () => {
    const w = frame.contentWindow as (Window & { __kr8Mirror?: unknown; __kr8MirrorBroken?: unknown }) | null;
    if (w && w.__kr8MirrorBroken) { status.textContent = 'This browser cannot keep the frame separate. Try Chrome.'; status.className = 'va-status bad'; return; }
    status.textContent = ''; status.className = 'va-status';
  };
}

/** Where the frame is: active tab, an open sheet, or the no-card screen. Short, for the bug case. */
function frameRoute(frame: HTMLIFrameElement): string {
  try {
    const d = frame.contentDocument; const w = frame.contentWindow;
    if (!d || !w) return '';
    const tab = d.querySelector<HTMLElement>('nav.dock [aria-current="page"]')?.dataset.tab;
    const sheet = d.querySelector('[role="dialog"], .sheet-open, .v8-sheet') ? 'sheet:open' : '';
    const parts = [tab ? `tab:${tab}` : d.querySelector('nav.dock') ? '' : 'no-card', sheet, w.location.hash || ''].filter(Boolean);
    return parts.join(' ').slice(0, 300);
  } catch { return ''; }
}

/** A picture of the frame with the tapped point ringed (JPEG data URL), or null when the browser cannot draw it. */
async function frameShot(frame: HTMLIFrameElement, pt: { x: number; y: number }, w: number, h: number): Promise<string | null> {
  const d = frame.contentDocument; const win = frame.contentWindow;
  if (!d || !win) return null;
  try {
    const { default: h2c } = await import('html2canvas');
    const vids = [...d.querySelectorAll('video')];
    const canvas = await Promise.race([
      h2c(d.documentElement, {
        useCORS: true, backgroundColor: '#0B0A12', scale: 1, logging: false, width: w, height: h, windowWidth: w, windowHeight: h,
        x: win.scrollX, y: win.scrollY,
        onclone: (cd: Document) => {
          // Reels: html2canvas cannot draw a <video>; put the current frame (or the poster) in its place
          [...cd.querySelectorAll('video')].forEach((cv, i) => {
            const v = vids[i]; const img = cd.createElement('img');
            img.className = cv.className; img.setAttribute('style', cv.getAttribute('style') || ''); img.style.objectFit = getComputedStyle(v || cv).objectFit || 'cover';
            try {
              if (!v || !v.videoWidth) throw new Error('no frame');
              const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
              c.getContext('2d')!.drawImage(v, 0, 0); img.src = c.toDataURL('image/jpeg', 0.8);
            } catch { img.src = (v || cv).poster || ''; }
            cv.replaceWith(img);
          });
        },
      }),
      new Promise<null>((r) => setTimeout(() => r(null), 9000)),
    ]);
    if (!canvas) return null;
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const g = out.getContext('2d')!;
    g.drawImage(canvas, 0, 0, w, h);
    g.lineWidth = 4; g.strokeStyle = '#ff4fd8'; g.shadowColor = 'rgba(255,79,216,.9)'; g.shadowBlur = 10;
    g.beginPath(); g.arc(pt.x * w, pt.y * h, 22, 0, Math.PI * 2); g.stroke();
    return out.toDataURL('image/jpeg', 0.72);
  } catch { return null; }
}

function header(title: string, sub: string): HTMLElement {
  const back = el('a', { class: 'v2back', href: '#more', 'aria-label': 'Back' });
  back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  return el('header', { class: 'v2hd' }, back, el('div', { class: 'grow' }, el('h1', {}, title), el('div', { class: 'v2sub', id: 'vaSub' }, sub)));
}

export function viewAsView(screen: (...kids: Kid[]) => HTMLElement) {
  cleanup?.();
  const sz = sizeOf(size);
  const frame = el('iframe', { class: 'va-frame', id: 'vaFrame', title: 'Member app', width: String(sz.w), height: String(sz.h) }) as HTMLIFrameElement;
  frame.style.width = sz.w + 'px'; frame.style.height = sz.h + 'px';
  const tapLayer = el('div', { class: 'va-tap', id: 'vaTap', hidden: true }, el('span', { class: 'va-hint' }, 'Tap where the problem is'));
  const dot = el('i', { class: 'va-dot', hidden: true });
  const phone = el('div', { class: 'va-phone', id: 'vaPhone' }, frame, tapLayer, el('div', { class: 'va-screen' }, dot));
  const stage = el('div', { class: 'va-stage', id: 'vaStage' }, el('div', { class: 'va-fit', id: 'vaFit' }, phone));
  const status = el('div', { class: 'va-status', id: 'vaStatus', role: 'status' });

  const rerender = () => viewAsView(screen);
  const spot = el('button', { type: 'button', class: 'va-spot', id: 'vaSpot' }, el('span', { class: 'va-bug', 'aria-hidden': 'true' }), 'Spot a bug');
  const reload = el('button', { type: 'button', class: 'va-reload', id: 'vaReload', title: 'Load again', 'aria-label': 'Load again' }, '↻');
  reload.onclick = () => void loadFrame(frame, status);

  // ── Spot a bug: tap → one line → saved as a case in Needs you ──
  const note = el('input', { id: 'vaNote', class: 'va-note', type: 'text', maxlength: '300', placeholder: "What's wrong? One line", autocomplete: 'off' }) as HTMLInputElement;
  const save = el('button', { type: 'button', class: 'v2btn ok', id: 'vaSave' }, 'Save');
  const cancel = el('button', { type: 'button', class: 'v2btn', id: 'vaCancel' }, 'Cancel');
  const form = el('div', { class: 'va-form', id: 'vaForm', hidden: true }, note, el('div', { class: 'va-form-row' }, cancel, save));
  let pt: { x: number; y: number } | null = null;
  const stopSpot = () => { tapLayer.hidden = true; form.hidden = true; dot.hidden = true; pt = null; note.value = ''; spot.classList.remove('on'); };
  spot.onclick = () => { if (!tapLayer.hidden || !form.hidden) { stopSpot(); return; } tapLayer.hidden = false; spot.classList.add('on'); };
  tapLayer.onclick = (ev) => {
    pt = tapPoint(ev.clientX, ev.clientY, tapLayer.getBoundingClientRect());
    dot.style.left = `${pt.x * 100}%`; dot.style.top = `${pt.y * 100}%`; dot.hidden = false;
    tapLayer.hidden = true; form.hidden = false; note.focus();
  };
  cancel.onclick = stopSpot;
  const doSave = async () => {
    const text = note.value.trim();
    if (!text || !pt) { note.focus(); return; }
    save.setAttribute('disabled', ''); save.textContent = 'Saving…';
    const route = frameRoute(frame);
    dot.hidden = true;
    const shot = await frameShot(frame, pt, sizeOf(size).w, sizeOf(size).h);
    try {
      await rpc('kr8_admin_bug_spot_add', { p_note: text, p_persona: persona, p_lang: lang, p_viewport: size, p_route: route || null,
        p_x: pt.x, p_y: pt.y, p_shot: shot });
      stopSpot(); toast(shot ? 'Saved to Needs you' : 'Saved to Needs you (no picture)', '#inbox');
    } catch (e) { dot.hidden = false; toast(`Not saved: ${(e as Error).message}`); }
    save.removeAttribute('disabled'); save.textContent = 'Save';
  };
  save.onclick = () => void doSave();
  note.onkeydown = (e) => { if (e.key === 'Enter') void doSave(); if (e.key === 'Escape') stopSpot(); };

  const controls = el('div', { class: 'va-ctl', id: 'vaCtl' },
    seg('vaPersona', PERSONAS, persona, (k) => { persona = k; LS('kr8-va-p', k); rerender(); }),
    el('div', { class: 'va-row' },
      seg('vaLang', LANGS, lang, (k) => { lang = k; LS('kr8-va-l', k); rerender(); }),
      seg('vaSize', SIZES.map((s) => ({ key: s.key, label: s.label.split(' ')[0] })), size, (k) => { size = k; LS('kr8-va-s', k); rerender(); })),
    el('div', { class: 'va-row va-acts' }, spot, reload),
    form, status,
    el('p', { class: 'va-safe', id: 'vaSafe' }, persona === 'visitor' ? 'Signed out · nothing is counted as a visit.'
      : 'Hidden mirror account · members never see it · likes, posts and chats are switched off.'));

  const sub = `${PERSONAS.find((p) => p.key === persona)!.hint} · ${sz.w}×${sz.h}`;
  screen(header('View as member', sub), el('div', { class: 'va-wrap' }, controls, stage));
  document.body.classList.add('va-wide');

  // fit the phone into the space left (desktop: next to the controls; phone: under them)
  const fit = () => {
    const r = stage.getBoundingClientRect();
    const bar = document.querySelector('.tabbar')?.getBoundingClientRect().height || 80;
    // a phone-sized admin fits the width and scrolls; a desktop fits the whole phone on screen
    const availH = window.innerWidth < 900 ? Infinity : Math.max(320, window.innerHeight - Math.max(r.top, 0) - bar - 12);
    const s = fitScale(sz.w + 16, sz.h + 16, r.width, availH);
    const fitEl = document.getElementById('vaFit');
    if (fitEl) { fitEl.style.transform = `scale(${s})`; fitEl.style.width = `${sz.w + 16}px`; stage.style.height = `${Math.ceil((sz.h + 16) * s)}px`; }
  };
  fit();
  window.addEventListener('resize', fit);
  cleanup = () => { window.removeEventListener('resize', fit); document.body.classList.remove('va-wide'); cleanup = null; };
  void loadFrame(frame, status);
}
/** Leaving the screen: unhook the resize listener and drop the wide layout. */
export function viewAsLeave() { cleanup?.(); }

// ───────── Needs you: one case per bug spot ─────────
export function bugCaseCard(b: BugSpot, onDone?: (b: BugSpot) => void): HTMLElement {
  const when = new Date(b.at).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  const shot = b.shot ? el('a', { class: 'va-shot', href: b.shot, target: '_blank', rel: 'noopener', 'aria-label': 'Open the screenshot' }, el('img', { src: b.shot, alt: 'Screenshot of the bug', loading: 'lazy' }))
    : el('div', { class: 'va-shot none' }, el('span', {}, 'No picture'),
      b.x != null && b.y != null ? el('i', { class: 'va-dot', style: `left:${b.x * 100}%;top:${b.y * 100}%` }) : null);
  const status = el('small', { class: 'va-cstatus', role: 'status' });
  const set = (st: 'fixed' | 'dismissed', btn: HTMLButtonElement) => async () => {
    btn.setAttribute('disabled', '');
    try { await rpc('kr8_admin_bug_spot_set', { p_id: b.id, p_status: st }); card.classList.add('va-done'); status.textContent = st === 'fixed' ? 'Marked fixed ✓' : 'Closed'; onDone?.(b); }
    catch (e) { btn.removeAttribute('disabled'); status.textContent = `Did not save: ${(e as Error).message}`; }
  };
  const fixed = el('button', { type: 'button', class: 'v2btn ok', id: 'vaFixed-' + b.id }, 'Fixed') as HTMLButtonElement;
  const notBug = el('button', { type: 'button', class: 'v2btn', id: 'vaNotBug-' + b.id }, 'Not a bug') as HTMLButtonElement;
  fixed.onclick = set('fixed', fixed); notBug.onclick = set('dismissed', notBug);
  const card = el('article', { class: 'v2card v2item va-case', 'data-bug': b.id, id: 'case-bug-' + b.id },
    el('div', { class: 'v2item-top' }, el('span', { class: 'v2chip p' }, 'Bug'), el('small', { class: 'v2wait' }, `${when} IST`)),
    el('div', { class: 'va-cbody' }, shot,
      el('div', { class: 'va-ctext' }, el('h3', { class: 'v2q' }, b.note), el('small', { class: 'va-meta' }, bugMeta(b)))),
    el('div', { class: 'v2acts' }, notBug, fixed), status);
  return card;
}

/** Self-filling block for Needs you: nothing shows when no bug is open. */
export function bugSection(onCount?: (n: number) => void): HTMLElement {
  const box = el('section', { id: 'v2Bugs', class: 'va-sec' });
  rpc<unknown>('kr8_admin_bug_spots', { p_open: true }).then((r) => {
    const list = isBugSpots(r) ? r : [];
    onCount?.(list.length);
    if (!list.length) { box.replaceChildren(); return; }
    let left = list.length;
    const title = el('div', { class: 'v2sec' }, `Bug spots · ${left}`);
    box.replaceChildren(title, ...list.map((b) => bugCaseCard(b, () => { left -= 1; title.textContent = `Bug spots · ${left}`; onCount?.(left); })));
  }).catch(() => { box.replaceChildren(); });   // before 0110 the list simply does not show
  return box;
}
