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

/** 21 Nov: a step that never answers must not leave the founder looking at a silent button */
function withTimeout<T>(p: Promise<T>, ms: number, why: string): Promise<T> {
  let t = 0;
  return Promise.race([p, new Promise<never>((_, rej) => { t = window.setTimeout(() => rej(new Error(why)), ms); })]).finally(() => window.clearTimeout(t));
}

/** plain-English reason for the red "Not sent — …" line (the admin is English only) */
export function sendFailReason(e: unknown): string {
  const m = String((e as Error)?.message || e || '');
  if (/KR8_ADMIN_ONLY|JWT|jwt|401|not authenticated|refresh token/i.test(m)) return 'your admin sign-in has expired. Reload the page, sign in again, then tap Send.';
  if (/KR8_NO_PERSON/.test(m)) return "this member's card was not found (account closed?).";
  if (/KR8_BAD_TEXT/.test(m)) return 'the reply is empty or longer than 2,000 characters.';
  if (/KR8_NO_TEAM/.test(m)) return 'the Kring Team account is missing on the server.';
  if (/Failed to fetch|Load failed|NetworkError|network/i.test(m)) return 'no internet connection. Check the connection and tap Send again.';
  return m.replace(/^Not sent:?\s*/i, '') || 'unknown error. Tap Send again.';
}

/** English → Thai for the member. Long replies go in short pieces (one long call was cut off mid-sentence and leaked a <thai> tag). */
export function splitForTranslation(en: string, max = 320): string[] {
  const out: string[] = [];
  for (const para of en.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)) {
    if (para.length <= max) { out.push(para); continue; }
    let cur = '';
    for (const sent of para.match(/[^.!?。]+[.!?。]+["')\]]*\s*|[^.!?。]+$/g) || [para]) {
      if (cur && (cur + sent).length > max) { out.push(cur.trim()); cur = ''; }
      cur += sent;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out.flatMap((x) => (x.length > 560 ? x.match(/[\s\S]{1,560}/g) || [x] : [x]));
}
export function cleanThai(raw: string): string | null {
  const t = (raw || '').replace(/<\/?thai>/gi, '').trim();
  if (!t || !/[\u0E00-\u0E7F]/.test(t)) return null;
  if (/<thai>/i.test(raw) && !/<\/thai>/i.test(raw)) return null;   // cut off before the end
  return t;
}
async function toThai(en: string): Promise<string> {
  const cl = await v5Client();
  const parts = splitForTranslation(en);
  const th = await withTimeout(Promise.all(parts.map(async (p) => {
    const { data, error } = await cl.functions.invoke('kr8-help-ai', { body: { mode: 'translate_reply', text_en: p, lang: 'th' } });
    const ok = cleanThai((data as { text?: string } | null)?.text || '');
    if (error || !ok) throw new Error('the Thai translation failed (nothing was sent). Tap Send again.');
    return ok;
  })), 40_000, 'the Thai translation took too long (nothing was sent). Tap Send again.');
  return th.join('\n\n');
}

/** true once the team message is really in the member's chat (by id, or by text within the last few minutes) */
export async function teamMessageExists(member: string, o: { id?: number | null; body?: string; since?: number }): Promise<boolean> {
  const r = await rpc<{ messages?: { id: number | string; from: string; body: string; at: string }[] } | null>('kr8_admin_help_thread', { p_member: member });
  return (r?.messages || []).some((m) => m.from === 'team' && (o.id != null ? Number(m.id) === Number(o.id)
    : m.body === o.body && Date.parse(m.at) >= (o.since || 0) - 120_000));
}

/**
 * The one send path for Help replies (Needs you cards, the Help panel, account checks): the founder writes ENGLISH; when the member
 * writes Thai the English is turned into natural Thai (kr8-help-ai translate_reply; the unchanged Sonnet draft sends Sonnet's own
 * Thai), then kr8_admin_team_reply_en stores the Thai for the member and the English for the founder.
 * 21 Nov (founder pressed Send on #87 and nothing appeared): every step has a time limit, every failure throws a plain reason, and
 * it only resolves once the message row is confirmed in the member's chat. Returns what the member got + the message id.
 */
export async function sendTeamReply(o: { member: string; en: string; memberThai: boolean; draftTh?: string; draftEn?: string; onStep?: (t: string) => void }): Promise<{ body: string; en: string; id: number | null }> {
  const en = o.en.trim();
  if (!en) throw new Error('write a reply first.');
  if (!o.member) throw new Error("this member's id is missing. Reload the page.");
  let body = en;
  if (o.memberThai && !hasThaiText(en)) {
    if (o.draftTh && en === (o.draftEn || '').trim()) body = o.draftTh;
    else { o.onStep?.('Translating to Thai…'); body = await toThai(en); }
  }
  if (body.length > 2000) throw new Error('the reply is longer than 2,000 characters. Make it shorter.');
  o.onStep?.('Sending…');
  const since = Date.now();
  let id: number | null = null;
  try {
    const r = await withTimeout(rpc<number | string | null>('kr8_admin_team_reply_en', { p_member: o.member, p_body: body, p_body_en: en }), 25_000, 'TIMEOUT');
    id = r == null ? null : Number(r);
  } catch (e) {
    if ((e as Error).message !== 'TIMEOUT') throw new Error(sendFailReason(e));
    // no answer in time: it may still have gone through, so look before saying anything (never a double send)
    o.onStep?.('Checking…');
    const there = await teamMessageExists(o.member, { body, since }).catch(() => false);
    if (!there) throw new Error('no answer from the server (nothing was sent). Check the connection and tap Send again.');
    return { body, en, id: null };
  }
  if (id == null || !Number.isFinite(id)) throw new Error('the server did not save the message. Tap Send again.');
  o.onStep?.('Checking…');
  const ok = await teamMessageExists(o.member, { id }).catch(() => true);   // the id only comes back after the row is committed
  if (!ok) throw new Error('the server did not save the message. Tap Send again.');
  return { body, en, id };
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
    hist, suggestHead, ta, status, el('div', { class: 'v2acts' }, send, noReply));   // 21 Nov: the result sits ABOVE the buttons (below them the phone's tab bar covered it)
  const setStatus = (cls: '' | 'busy' | 'ok' | 'bad', text: string) => { status.className = `hpa-status ${cls}`.trim(); status.textContent = text; };
  send.onclick = async () => {
    if (card.classList.contains('hpa-sending')) return;
    const en = ta.value.trim();
    if (!en) { setStatus('bad', 'Not sent — write a reply first.'); ta.focus(); return; }
    card.classList.add('hpa-sending'); send.setAttribute('disabled', ''); noReply.setAttribute('disabled', ''); send.textContent = 'Sending…';
    setStatus('busy', memberThai ? 'Translating to Thai…' : 'Sending…');
    try {
      const r = await sendTeamReply({ member: c.member, en, memberThai, draftTh, draftEn, onStep: (t) => setStatus('busy', t) });
      card.classList.add('hpa-done'); send.textContent = 'Sent ✓';
      setStatus('ok', `Sent to ${who} as Kring Team ✓ · ${fmtClock(new Date().toISOString())} IST${r.id ? ` · message #${r.id}` : ''}`);
      ta.setAttribute('disabled', '');
      onDone?.(c);
    } catch (e) {
      send.removeAttribute('disabled'); noReply.removeAttribute('disabled'); send.textContent = 'Send as Kring Team';
      setStatus('bad', `Not sent — ${sendFailReason(e)}`);
      status.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    } finally {
      card.classList.remove('hpa-sending');
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
