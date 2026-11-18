/**
 * Admin "Needs you" → Help cases (0097 + T-402 Help AI, 18 Nov 2026). SELF-CONTAINED so it can be merged into the one-case-per-card "Needs you":
 *   loadHelpCases()            → the case list (kr8_admin_help_cases), oldest wait first
 *   helpCaseCard(case, onDone) → one card: member, their question (+ English translation under every Thai line),
 *                                waiting time (red after 45 min), the chat so far, and a "Suggested reply" box
 *                                prefilled with Sonnet's draft + one-tap "Send as Kring Team" (never auto-sent)
 *   helpSection(onCount?)      → a ready block (title + cards) that fills itself; used by adminV2 inboxView
 */
import { el, rpc } from './shared';
import { hasThaiText, helpQuestion, helpUrgency, helpUrgencyText, helpWaitLabel, sortHelpCases, type HelpCase } from './adminHelpLogic';
import './adminHelp.css';

export async function loadHelpCases(): Promise<HelpCase[]> {
  const r = await rpc<unknown>('kr8_admin_help_cases');
  return sortHelpCases(Array.isArray(r) ? (r as HelpCase[]) : []);
}

const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });

function enLine(rawText: string, tr?: string | null): HTMLElement | null {
  const cleanTr = (tr || '').trim();
  if (!cleanTr || !hasThaiText(rawText)) return null;
  return el('small', { class: 'hpa-en' }, `EN: ${cleanTr}`);
}

export function helpCaseCard(c: HelpCase, onDone?: (c: HelpCase) => void): HTMLElement {
  const urg = helpUrgency(c);
  const who = `${c.name || 'Member'}${c.member_no ? ` #${c.member_no}` : ''}`;
  const rawItems = c.unanswered_items?.length
    ? c.unanswered_items.map((it) => ({ q: helpQuestion(it.body), en: it.translation_en }))
    : (c.messages?.length ? c.messages : [c.question]).map((b) => ({ q: helpQuestion(b), en: null }));
  const draft = (c.suggested_reply || '').trim() || (
    c.unanswered_items?.slice().reverse().find((it) => (it.suggested_reply || '').trim())?.suggested_reply?.trim() || ''
  );

  const av = c.photo && /^https?:/.test(c.photo) ? el('img', { class: 'hpa-av', src: c.photo, alt: '' }) : el('span', { class: 'hpa-av none' }, (c.name || '?').slice(0, 1));
  const ta = el('textarea', {
    class: 'hpa-ta',
    id: 'hpaText-' + c.member,
    rows: draft ? '3' : '2',
    maxlength: '500',
    placeholder: 'Reply as Kring Team… (use polite Thai ending)',
  }) as HTMLTextAreaElement;
  if (draft) ta.value = draft;

  const suggestHead = draft
    ? el('label', { class: 'hpa-suggest-hd', for: 'hpaText-' + c.member },
        el('b', {}, 'Suggested reply'),
        el('small', {}, 'Edit or tap Send — never sent automatically'))
    : null;

  const send = el('button', { type: 'button', class: 'v2btn ok hpa-send', id: 'hpaSend-' + c.member }, 'Send as Kring Team');
  const status = el('small', { class: 'hpa-status', role: 'status' });
  const hist = el('details', { class: 'hpa-hist' }, el('summary', {}, `Chat so far · ${c.history?.length || 0}`),
    ...(c.history || []).map((h) => {
      const text = h.from === 'member' ? helpQuestion(h.body) : h.body;
      return el('div', { class: `hpa-line ${h.from}` },
        el('b', {}, h.from === 'team' ? 'Team' : c.name || 'Member'),
        el('div', { class: 'hpa-msg-col' },
          el('span', {}, text),
          enLine(text, h.translation_en)),
        el('small', {}, fmtClock(h.at)));
    }));
  const card = el('article', { class: `v2card v2item hpa-case u-${urg}`, 'data-help': c.member, 'data-urgency': urg },
    el('div', { class: 'v2item-top' }, el('span', { class: `v2chip ${urg === 'ok' ? 'b' : 'r'}` }, 'Help'),
      el('small', { class: `hpa-wait ${urg}` }, `${helpWaitLabel(c)} · since ${fmtClock(c.waiting_since)} IST`)),
    el('div', { class: 'hpa-who' }, av, el('div', {}, el('b', {}, who),
      el('small', {}, [c.verified ? '✓ verified' : 'not verified yet', c.test ? 'test account' : '', c.unanswered > 1 ? `${c.unanswered} messages waiting` : ''].filter(Boolean).join(' · ')))),
    el('div', { class: 'hpa-q' }, ...rawItems.map((it) => el('div', { class: 'hpa-q-item' },
      el('p', {}, `“${it.q}”`),
      enLine(it.q, it.en)))),
    urg !== 'ok' ? el('p', { class: 'hpa-risk', id: 'hpaRisk-' + c.member }, `⚠ ${helpUrgencyText(urg)}`) : null,
    hist, suggestHead, ta, el('div', { class: 'v2acts' }, send), status);
  send.onclick = async () => {
    const body = ta.value.trim();
    if (!body) { ta.focus(); return; }
    send.setAttribute('disabled', ''); status.textContent = 'Sending…';
    try {
      await rpc('kr8_admin_team_reply', { p_member: c.member, p_body: body });
      card.classList.add('hpa-done'); status.textContent = `Sent to ${who} as Kring Team ✓`; ta.setAttribute('disabled', '');
      onDone?.(c);
    } catch (e) {
      send.removeAttribute('disabled'); status.textContent = `Not sent: ${(e as Error).message}`;
    }
  };
  return card;
}

/** Self-filling block for "Needs you": nothing shows when no member is waiting. */
export function helpSection(onCount?: (n: number) => void): HTMLElement {
  const box = el('section', { id: 'v2Help', class: 'hpa-sec' });
  loadHelpCases().then((list) => {
    onCount?.(list.length);
    if (!list.length) { box.replaceChildren(); return; }
    const late = list.filter((c) => helpUrgency(c) !== 'ok').length;
    box.replaceChildren(el('div', { class: 'v2sec' }, `Help · ${list.length} waiting${late ? ` · ${late} past 45 min` : ''}`), ...list.map((c) => helpCaseCard(c)));
  }).catch((e) => { box.replaceChildren(el('div', { class: 'v2card v2err' }, el('b', {}, 'Help cases could not load'), el('div', { class: 'v2sub' }, String((e as Error).message)))); });
  return box;
}
