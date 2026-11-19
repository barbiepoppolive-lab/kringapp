/**
 * Admin "Needs you" → Help cases (0097 + T-402 Help AI, 18 Nov 2026). SELF-CONTAINED so it can be merged into the one-case-per-card "Needs you":
 *   loadHelpCases()            → the case list (kr8_admin_help_cases), oldest wait first
 *   helpCaseCard(case, onDone) → one card: member, their question (+ English translation under every Thai line),
 *                                waiting time (red after 45 min), the chat so far, and a "Suggested reply" box
 *                                prefilled with Sonnet's draft + one-tap "Send as Kring Team" (never auto-sent)
 *   helpSection(onCount?)      → a ready block (title + cards) that fills itself; used by adminV2 inboxView
 */
import { el, rpc, v5Client } from './shared';
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

/**
 * The one send path for Help replies (Needs you cards AND the Help panel): the founder writes ENGLISH; when the member writes Thai
 * the English is turned into natural Thai (kr8-help-ai translate_reply; the unchanged Sonnet draft sends Sonnet's own Thai),
 * then kr8_admin_team_reply_en stores the Thai for the member and the English for the founder. Returns what the member got.
 */
export async function sendTeamReply(o: { member: string; en: string; memberThai: boolean; draftTh?: string; draftEn?: string; onStep?: (t: string) => void }): Promise<{ body: string; en: string }> {
  const en = o.en.trim();
  if (!en) throw new Error('Write a reply first.');
  let body = en;
  if (o.memberThai && !hasThaiText(en)) {
    if (o.draftTh && en === (o.draftEn || '').trim()) body = o.draftTh;
    else {
      o.onStep?.('Translating to Thai…');
      const cl = await v5Client();
      const { data, error } = await cl.functions.invoke('kr8-help-ai', { body: { mode: 'translate_reply', text_en: en, lang: 'th' } });
      const th = (data as { ok?: boolean; text?: string } | null)?.text;
      if (error || !th) throw new Error('Thai translation failed, nothing was sent. Try again.');
      body = th;
    }
  }
  o.onStep?.('Sending…');
  await rpc('kr8_admin_team_reply_en', { p_member: o.member, p_body: body, p_body_en: en });
  return { body, en };
}

/**
 * 0122 "No reply needed": closes the member's waiting Help case WITHOUT sending anything. The admin-only RPC records
 * kr8_help_closed(thread, closed_upto_message_id); the waiting lists and the help SLA ignore member messages up to that id,
 * so a NEW message from the member opens the case again. thread = null closes every Kring Team chat of that member.
 */
export const HELP_CLOSE_RPC = 'kr8_admin_help_no_reply';
export async function closeHelpNoReply(member: string, thread: string | null = null): Promise<{ closed: number }> {
  const r = await rpc<{ closed?: number } | null>(HELP_CLOSE_RPC, { p_member: member, p_thread: thread });
  return { closed: Number(r?.closed) || 0 };
}

export function helpCaseCard(c: HelpCase, onDone?: (c: HelpCase) => void): HTMLElement {
  const urg = helpUrgency(c);
  const who = `${c.name || 'Member'}${c.member_no ? ` #${c.member_no}` : ''}`;
  const rawItems = c.unanswered_items?.length
    ? c.unanswered_items.map((it) => ({ q: helpQuestion(it.body), en: it.translation_en }))
    : (c.messages?.length ? c.messages : [c.question]).map((b) => ({ q: helpQuestion(b), en: null }));
  const lastAi = c.unanswered_items?.slice().reverse().find((it) => (it.suggested_reply || '').trim());
  const draftTh = (c.suggested_reply || '').trim() || lastAi?.suggested_reply?.trim() || '';
  const draftEn = (c.suggested_reply_en || '').trim() || lastAi?.suggested_reply_en?.trim() || '';
  // founder can't read Thai: he reads and edits ENGLISH; the member gets natural Thai (translated on send)
  const memberThai = rawItems.some((it) => hasThaiText(it.q));
  const draft = memberThai ? draftEn : (draftEn || draftTh);

  const av = c.photo && /^https?:/.test(c.photo) ? el('img', { class: 'hpa-av', src: c.photo, alt: '' }) : el('span', { class: 'hpa-av none' }, (c.name || '?').slice(0, 1));
  const ta = el('textarea', {
    class: 'hpa-ta',
    id: 'hpaText-' + c.member,
    rows: draft ? '3' : '2',
    maxlength: '2000',
    placeholder: memberThai ? 'Write your reply in English. It is sent to the member in Thai.' : 'Write your reply…',
  }) as HTMLTextAreaElement;
  if (draft) ta.value = draft;

  const suggestHead = draft
    ? el('label', { class: 'hpa-suggest-hd', for: 'hpaText-' + c.member },
        el('b', {}, 'Suggested reply'),
        el('small', {}, memberThai ? 'In English · sent in Thai · never automatic' : 'Edit or tap Send · never automatic'))
    : null;

  const send = el('button', { type: 'button', class: 'v2btn ok hpa-send', id: 'hpaSend-' + c.member }, 'Send as Kring Team');
  const noReply = el('button', { type: 'button', class: 'v2btn hpa-noreply', id: 'hpaNoReply-' + c.member, title: 'Close this case without sending a message' }, 'No reply needed');
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
    hist, suggestHead, ta, el('div', { class: 'v2acts' }, send, noReply), status);
  send.onclick = async () => {
    const en = ta.value.trim();
    if (!en) { ta.focus(); return; }
    send.setAttribute('disabled', ''); status.textContent = memberThai ? 'Translating to Thai…' : 'Sending…';
    try {
      await sendTeamReply({ member: c.member, en, memberThai, draftTh, draftEn, onStep: (t) => { status.textContent = t; } });
      card.classList.add('hpa-done'); status.textContent = `Sent to ${who} as Kring Team ✓`; ta.setAttribute('disabled', ''); noReply.setAttribute('disabled', '');
      onDone?.(c);
    } catch (e) {
      send.removeAttribute('disabled'); status.textContent = `Not sent: ${(e as Error).message}`;
    }
  };
  noReply.onclick = async () => {
    noReply.setAttribute('disabled', ''); send.setAttribute('disabled', ''); status.textContent = 'Closing…';
    try {
      await closeHelpNoReply(c.member, c.thread_id || null);
      card.classList.add('hpa-done'); status.textContent = `Closed · no message sent to ${who} ✓`; ta.setAttribute('disabled', '');
      onDone?.(c);
    } catch (e) {
      noReply.removeAttribute('disabled'); send.removeAttribute('disabled'); status.textContent = `Not closed: ${(e as Error).message}`;
    }
  };
  return card;
}

/** Self-filling block for "Needs you": a "Help chats" link to the full Help panel (#help), then one card per waiting member. */
export function helpSection(onCount?: (n: number) => void): HTMLElement {
  const box = el('section', { id: 'v2Help', class: 'hpa-sec' });
  const link = (n: number, late: number) => el('a', { class: `hpa-open${late ? ' late' : ''}`, href: '#help', id: 'hpaOpenPanel' },
    el('b', {}, n ? `Help · ${n} waiting` : 'Help chats'),
    el('small', {}, late ? `${late} past 45 min · open all chats` : n ? 'Open all chats' : 'All answered · open all chats'),
    el('span', { class: 'hpa-open-go', 'aria-hidden': 'true' }, '›'));
  box.replaceChildren(link(0, 0));
  loadHelpCases().then((list) => {
    onCount?.(list.length);
    const late = list.filter((c) => helpUrgency(c) !== 'ok').length;
    box.replaceChildren(link(list.length, late), ...list.map((c) => helpCaseCard(c)));
  }).catch((e) => { box.replaceChildren(link(0, 0), el('div', { class: 'v2card v2err' }, el('b', {}, 'Help cases could not load'), el('div', { class: 'v2sub' }, String((e as Error).message)))); });
  return box;
}
