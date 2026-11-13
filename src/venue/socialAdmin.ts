/**
 * admin.html → "Social queue" (T-210): reply drafts the CoS queued for Reddit threads. Per card: Send (Reddit API via the
 * Edge Function `social-send`, founder's own account) · Copy + Open (no Reddit API needed) · Edit · Skip.
 * All rails (5 a day, 20 minutes apart, 9:1 Kring mentions, disclosure line) are checked in the DB (0040), for both paths.
 */
import { bkkTime, el, rpc, tx, v5Client, type TxPair } from './shared';

export type SocialCard = { id: string; subreddit: string; thread_url: string; thread_title: string; reply_text: string; why_helps: string;
  mentions_kring: boolean; status: 'pending' | 'sending' | 'sent' | 'skipped'; send_mode: 'api' | 'manual' | null; final_text: string | null;
  result_url: string | null; error: string | null; created_at: string; sent_at: string | null };
type Status = { sent_today: number; max_per_day: number; next_allowed_at: string; kring_allowed: boolean };

const T = {
  pending: ['รอส่ง', 'To send'], sent: ['ส่งแล้ว', 'Sent'], skipped: ['ข้าม', 'Skipped'], none: ['ไม่มีรายการ', 'Nothing here'],
  send: ['ส่ง', 'Send'], copy: ['คัดลอก + เปิด', 'Copy + Open'], edit: ['แก้ไข', 'Edit'], save: ['บันทึก', 'Save'], skip: ['ข้าม', 'Skip'],
  undo: ['ยกเลิก (ยังไม่ได้โพสต์)', 'Undo (not posted)'], open: ['เปิดกระทู้ ↗', 'Open thread ↗'], posted: ['ดูคอมเมนต์ ↗', 'See comment ↗'],
  why: ['ช่วยอย่างไร', 'Why it helps'], mentions: ['พูดถึง Kring · จะเติมบรรทัดเปิดเผยให้', 'Mentions Kring · disclosure line added'],
  copied: ['คัดลอกแล้ว · เปิดกระทู้ กดค้างที่ช่องคอมเมนต์ แล้ววาง', 'Copied · open the thread, long-press the comment box, paste'],
  copyFail: ['คัดลอกไม่ได้ · เลือกข้อความด้านล่างแล้วคัดลอกเอง', 'Could not copy · select the text below and copy it'],
  sentOk: ['โพสต์แล้ว', 'Posted'],
  rule: ['กติกา: วันละไม่เกิน 5 · ห่างกันอย่างน้อย 20 นาที · พูดถึง Kring ได้เมื่อ 9 ครั้งก่อนหน้าไม่ได้พูดถึง', 'Rules: max 5 a day · 20+ minutes apart · Kring only after 9 replies that don’t mention it'],
} as const satisfies Record<string, TxPair>;

const ERR: Record<string, TxPair> = {
  KR8_SOCIAL_DAY_LIMIT: ['ครบ 5 ครั้งวันนี้แล้ว · พรุ่งนี้ค่อยส่ง', '5 sent today already · send tomorrow'],
  KR8_SOCIAL_TOO_SOON: ['ยังไม่ครบ 20 นาทีจากครั้งก่อน', 'Less than 20 minutes since the last one'],
  KR8_SOCIAL_RATIO: ['ยังพูดถึง Kring ไม่ได้ · ต้องมี 9 คำตอบที่ไม่พูดถึงก่อน', 'Not yet: Kring needs 9 replies without it first'],
  KR8_SOCIAL_NOT_PENDING: ['รายการนี้ส่งหรือข้ามไปแล้ว', 'Already sent or skipped'],
  REDDIT_OFF: ['ยังไม่ได้ต่อ Reddit API · ใช้ "คัดลอก + เปิด" ไปก่อน', 'Reddit API not connected yet · use Copy + Open'],
  KR8_ADMIN_ONLY: ['เฉพาะแอดมิน', 'Admins only'],
};
function errPair(code: string): TxPair {
  const k = (code.match(/KR8_[A-Z_]+|REDDIT_OFF/) || [''])[0];
  return ERR[k] || ['ส่งไม่สำเร็จ: ' + code, 'Failed: ' + code];
}

/** Kring mention in the reply text (same rule as the DB). */
export const mentionsKring = (t: string) => /(kring|กริ๊ง|กริ๋ง)/i.test(t);

/** Copies text that only arrives after a network call while keeping the tap's permission (iPhone Safari needs this). */
async function copyLater(textP: Promise<string>): Promise<boolean> {
  try {
    const CI = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (CI && navigator.clipboard?.write) {
      await navigator.clipboard.write([new CI({ 'text/plain': textP.then((t) => new Blob([t], { type: 'text/plain' })) })]);
      return true;
    }
    await navigator.clipboard.writeText(await textP);
    return true;
  } catch {
    return false;
  }
}

async function sendViaApi(id: string): Promise<{ result_url?: string; error?: string }> {
  const c = await v5Client();
  const { data, error } = await c.functions.invoke('social-send', { body: { id } });
  if (!error) return data as { result_url?: string };
  const ctx = (error as { context?: Response }).context;
  const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
  return { error: (body as { error?: string } | null)?.error || String(error.message || 'SEND') };
}

let filter: 'pending' | 'sent' | 'skipped' = 'pending';

export async function socialView(body: HTMLElement, setCount: (n: number) => void) {
  const tabs = el('div', { class: 'row', style: 'margin:0 0 10px;gap:6px' });
  for (const f of ['pending', 'sent', 'skipped'] as const) {
    const b = el('button', { class: filter === f ? '' : 'ghost', id: 'socialTab-' + f }, tx(T[f]));
    b.onclick = () => { filter = f; void socialView(body, setCount); };
    tabs.append(b);
  }
  let rows: SocialCard[] = [];
  let st: Status | null = null;
  try {
    [rows, st] = await Promise.all([
      rpc<SocialCard[]>('kr8_admin_social_list', { p_status: filter }),
      rpc<Status[]>('kr8_social_status').then((r) => r[0] || null),
    ]);
  } catch (e) {
    body.replaceChildren(tabs, el('p', { class: 'err' }, tx(errPair(String((e as Error).message)))));
    return;
  }
  if (filter === 'pending') setCount(rows.filter((r) => r.status === 'pending').length);
  const head = st ? el('p', { class: 'note', id: 'socialStatus' },
    `${st.sent_today}/${st.max_per_day} today · next at ${bkkTime(st.next_allowed_at, false)} · Kring mention ${st.kring_allowed ? 'allowed' : 'not yet'}`) : null;
  body.replaceChildren(tabs, el('p', { class: 'meta' }, tx(T.rule)), head || '',
    ...(rows.length ? rows.map((r) => socialCard(r, () => void socialView(body, setCount))) : [el('div', { class: 'card empty' }, tx(T.none))]));
}

function socialCard(r: SocialCard, refresh: () => void): HTMLElement {
  const msg = el('div', {});
  const say = (p: TxPair, cls = 'note') => msg.replaceChildren(el('p', { class: cls }, tx(p)));
  const text = el('pre', { class: 'social-text', style: 'white-space:pre-wrap;font:inherit;margin:8px 0', 'data-text': r.id }, r.final_text || r.reply_text);
  const card = el('div', { class: 'card', 'data-social': r.id, 'data-status': r.status },
    el('div', { class: 'row' }, el('b', { class: 'grow' }, `r/${r.subreddit}`), el('span', { class: 'pill' }, r.status)),
    el('a', { href: r.thread_url, target: '_blank', rel: 'noopener noreferrer' }, r.thread_title || r.thread_url),
    r.why_helps ? el('p', { class: 'meta' }, tx(T.why), ' ', r.why_helps) : null,
    (r.mentions_kring || mentionsKring(r.reply_text)) ? el('p', { class: 'err', 'data-mentions': '1' }, tx(T.mentions)) : null,
    text,
    r.error ? el('p', { class: 'err' }, r.error) : null,
    r.result_url ? el('a', { href: r.result_url, target: '_blank', rel: 'noopener noreferrer', id: 'socialResult-' + r.id }, tx(T.posted)) : null);
  const row = el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' });

  if (r.status === 'pending') {
    const send = el('button', { id: 'socialSend-' + r.id }, tx(T.send));
    const copy = el('button', { class: 'ghost', id: 'socialCopy-' + r.id }, tx(T.copy));
    const edit = el('button', { class: 'ghost', id: 'socialEdit-' + r.id }, tx(T.edit));
    const skip = el('button', { class: 'bad', id: 'socialSkip-' + r.id }, tx(T.skip));
    const lock = (on: boolean) => { for (const b of [send, copy, edit, skip]) (b as HTMLButtonElement).disabled = on; };
    send.onclick = async () => {
      lock(true);
      const res = await sendViaApi(r.id);
      if (res.result_url) { say(T.sentOk); setTimeout(refresh, 800); return; }
      lock(false);
      say(errPair(res.error || 'SEND'), 'err');
    };
    copy.onclick = async () => {
      lock(true);
      const prep = rpc<{ text: string; thread_url: string }>('kr8_admin_social_prepare', { p_id: r.id, p_mode: 'manual' });
      const copiedP = copyLater(prep.then((p) => p.text));   // started inside the tap
      let p: { text: string; thread_url: string };
      try { p = await prep; } catch (e) { lock(false); say(errPair(String((e as Error).message)), 'err'); return; }
      const copied = await copiedP;
      text.textContent = p.text;
      try { await rpc('kr8_admin_social_done', { p_id: r.id, p_result_url: null }); } catch { /* stays "sending"; Undo still works */ }
      const open = el('a', { class: 'btn', href: p.thread_url, target: '_blank', rel: 'noopener noreferrer', id: 'socialOpen-' + r.id, style: 'font-weight:800' }, tx(T.open));
      msg.replaceChildren(el('p', { class: copied ? 'ok' : 'err' }, tx(copied ? T.copied : T.copyFail)), open, undoBtn(r.id, refresh));
      row.remove();
      window.open(p.thread_url, '_blank', 'noopener');   // may be blocked after the wait; the link above always works
    };
    edit.onclick = () => {
      const ta = el('textarea', { rows: '8', id: 'socialText-' + r.id, style: 'width:100%' }) as HTMLTextAreaElement;
      ta.value = r.reply_text;
      const save = el('button', { id: 'socialSave-' + r.id }, tx(T.save));
      save.onclick = async () => {
        try { await rpc('kr8_admin_social_edit', { p_id: r.id, p_text: ta.value }); refresh(); } catch (e) { say(errPair(String((e as Error).message)), 'err'); }
      };
      text.replaceWith(ta);
      row.replaceChildren(save);
    };
    skip.onclick = async () => {
      try { await rpc('kr8_admin_social_skip', { p_id: r.id }); card.remove(); } catch (e) { say(errPair(String((e as Error).message)), 'err'); }
    };
    row.append(send, copy, edit, skip);
  } else if (r.send_mode === 'manual' && r.sent_at && Date.now() - Date.parse(r.sent_at) < 2 * 3600_000) {
    row.append(el('a', { href: r.thread_url, target: '_blank', rel: 'noopener noreferrer' }, tx(T.open)), undoBtn(r.id, refresh));
  }
  if (r.sent_at) card.append(el('p', { class: 'meta' }, `${r.send_mode || ''} · ${bkkTime(r.sent_at)}`));
  card.append(row, msg);
  return card;
}

function undoBtn(id: string, refresh: () => void): HTMLElement {
  const b = el('button', { class: 'ghost', id: 'socialUndo-' + id }, tx(T.undo));
  b.onclick = async () => { try { await rpc('kr8_admin_social_undo', { p_id: id }); refresh(); } catch { /* past 2 hours */ } };
  return b;
}
