/**
 * 0171 (20 Nov 2026, founder): "Account checks" in Needs you. A duplicate face is refused automatically at the face check; the
 * founder only sees the member's one-tap request "Ask Kring to check my account", with WHY it was refused, both selfies and both
 * card photos side by side (never an empty slot), Approve (different person) / Keep refused, and one-tap messages.
 * SELF-CONTAINED: adminV2 adds accountCheckSection(onCount) at the top of Needs you. English only (the founder's rule).
 */
import { el, rpc, v5Client } from './shared';
import { sendTeamReply } from './adminHelp';

export interface AccountCheck {
  id: string; status: 'open' | 'approved' | 'kept'; created_at: string; decided_at: string | null; note: string | null;
  log: { at: string; what: string; en?: string }[];
  user_id: string; member_no: number | null; first_name: string; langs: string[] | null;
  other_user: string | null; other_no: number | null; other_name: string; other_gone: boolean;
  sim: number | null; refused_at: string | null; gone_winner: boolean;
  selfie_path: string | null; other_selfie_path: string | null; refusals: number;
}

/** the 3 one-tap replies: the founder reads English, the member gets their language (Thai written here, so nothing is machine-translated) */
export const AC_PRESETS: { id: string; en: string; th: string }[] = [
  { id: 'ok', en: 'We checked your account and you’re all set. Please do the face check again and it will work now. Thank you!',
    th: 'ทีมงานตรวจสอบบัญชีของคุณแล้วครับ เรียบร้อยแล้ว ลองยืนยันใบหน้าอีกครั้งได้เลยครับ ขอบคุณครับ' },
  { id: 'same', en: 'We checked, and this face matches another Kring account. Please use your first account. Kring is one person, one account.',
    th: 'ทีมงานตรวจสอบแล้วครับ ใบหน้านี้ตรงกับบัญชี Kring อีกบัญชีหนึ่ง กรุณาใช้บัญชีแรกของคุณนะครับ เพราะ Kring ใช้กติกาหนึ่งคน หนึ่งบัญชีครับ' },
  { id: 'more', en: 'Thanks for your request. Could you tell us a bit more? Is the other account a family member or a friend who used your phone?',
    th: 'ขอบคุณที่แจ้งมานะครับ ช่วยเล่าเพิ่มอีกนิดได้ไหมครับ บัญชีอีกบัญชีเป็นของคนในครอบครัว หรือเพื่อนที่ใช้โทรศัพท์เครื่องเดียวกันหรือเปล่าครับ' },
];

const tag = (no: number | null, name?: string) => `#${no ?? '?'}${name ? ` ${name}` : ''}`;
const hhmm = (iso: string | null) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};
/** member reads Thai unless their card lists languages and Thai is not one of them */
export const memberThai = (c: Pick<AccountCheck, 'langs'>) => !c.langs || !c.langs.length || c.langs.some((l) => /^th|thai|ไทย/i.test(l));
/** the plain reason line on the card */
export function whyRefused(c: AccountCheck): string {
  const other = c.other_gone ? `deleted account ${tag(c.other_no, c.other_name)}${c.gone_winner ? ' (took a prize)' : ''}` : tag(c.other_no, c.other_name);
  const sim = c.sim != null ? `${Math.round(Number(c.sim))}% AWS match` : 'AWS match';
  return `Same face as ${other} · ${sim} · refused automatically ${hhmm(c.refused_at)}`.trim();
}

let photos: Record<string, string> = {};
async function loadPhotos(ids: string[]) {
  const need = [...new Set(ids.filter(Boolean))].filter((id) => !(id in photos));
  if (!need.length) return;
  const got = await rpc<Record<string, string>>('kr8_admin_v2_photos', { p_users: need }).catch(() => ({} as Record<string, string>));
  for (const id of need) photos[id] = (got && got[id]) || '';
}
async function signSelfies(paths: (string | null)[]): Promise<Record<string, string>> {
  const p = paths.filter((x): x is string => !!x);
  if (!p.length) return {};
  try {
    const { data } = await (await v5Client()).storage.from('kr8-verify').createSignedUrls(p, 600);
    return Object.fromEntries((data || []).filter((d) => d.path && d.signedUrl).map((d) => [d.path as string, d.signedUrl as string]));
  } catch { return {}; }
}

function photoGrid(c: AccountCheck, selfies: Record<string, string>): HTMLElement {
  const tile = (src: string | undefined, cap: string) => src ? el('figure', { style: 'margin:0;flex:1;min-width:0' },
    el('img', { src, alt: '', style: 'width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:14px;display:block' }),
    el('figcaption', { style: 'font-size:13px;margin-top:4px;opacity:.85;text-align:center' }, cap)) : null;
  const row = (...k: (HTMLElement | null)[]) => { const kids = k.filter((x): x is HTMLElement => !!x); return kids.length ? el('div', { style: 'display:flex;gap:8px;margin-top:8px' }, ...kids) : null; };
  const me = tag(c.member_no, c.first_name); const ot = tag(c.other_no, c.other_name);
  const mine = { selfie: c.selfie_path ? selfies[c.selfie_path] : undefined, card: photos[c.user_id] || undefined };
  const theirs = { selfie: c.other_selfie_path ? selfies[c.other_selfie_path] : undefined, card: (c.other_user && photos[c.other_user]) || undefined };
  const missing: string[] = [];
  if (!mine.selfie) missing.push(`${me}: refused selfie already deleted`);
  if (!mine.card) missing.push(`${me}: no card photo`);
  if (!theirs.selfie) missing.push(c.other_gone ? `${ot}: deleted account (no selfie kept)` : `${ot}: no face-check selfie`);
  if (!theirs.card) missing.push(c.other_gone ? `${ot}: deleted account (no card photo)` : `${ot}: no card photo`);
  return el('div', { class: 'ac-photos', id: `acPhotos-${c.id}` },
    row(tile(mine.selfie, `${me} · selfie (refused)`), tile(theirs.selfie, `${ot} · selfie`)),
    row(tile(mine.card, `${me} · card photo`), tile(theirs.card, `${ot} · card photo`)),
    missing.length ? el('small', { class: 'v2sub', style: 'display:block;margin-top:6px' }, missing.join(' · ')) : null,
    el('small', { class: 'v2sub', style: 'display:block;margin-top:6px' }, 'Left = the refused account, right = the account it matched. Two different people → Approve. Same human → Keep refused.'));
}

function card(c: AccountCheck, selfies: Record<string, string>, refresh: () => void): HTMLElement {
  const open = c.status === 'open';
  const status = el('small', { class: 'v2sub', id: `acStatus-${c.id}`, role: 'status' }, '');
  const busy = (b: HTMLButtonElement[], on: boolean) => b.forEach((x) => { x.disabled = on; });
  const btns: HTMLButtonElement[] = [];
  const decide = (action: 'approve' | 'keep') => async () => {
    busy(btns, true); status.textContent = 'Saving…';
    try {
      await rpc('kr8_admin_account_check_decide', { p_id: c.id, p_action: action });
      status.textContent = action === 'approve' ? 'Approved ✓ Prize ban removed; their next face check will pass.' : 'Kept refused ✓';
      window.setTimeout(refresh, 900);
    } catch (e) { status.textContent = `Didn’t save: ${String((e as Error)?.message || e).slice(0, 120)}`; busy(btns, false); }
  };
  const thai = memberThai(c);
  const send = async (en: string, th?: string) => {
    busy(btns, true); status.textContent = 'Sending…';
    try {
      const r = await sendTeamReply({ member: c.user_id, en, memberThai: thai, draftEn: th ? en : undefined, draftTh: th, onStep: (t) => { status.textContent = t; } });
      await rpc('kr8_admin_account_check_note', { p_id: c.id, p_en: r.en }).catch(() => undefined);
      status.textContent = `Sent ✓ “${r.en.slice(0, 80)}${r.en.length > 80 ? '…' : ''}”`;
    } catch (e) { status.textContent = `Not sent: ${String((e as Error)?.message || e).slice(0, 120)}`; }
    busy(btns, false);
  };
  const mk = (label: string, cls: string, id: string, fn: () => void) => { const b = el('button', { type: 'button', class: `v2btn ${cls}`, id }, label); b.onclick = fn; btns.push(b); return b; };
  const custom = el('textarea', { id: `acCustom-${c.id}`, rows: '2', maxlength: '500', placeholder: 'Write your own message in English…',
    style: 'width:100%;box-sizing:border-box;border-radius:12px;padding:10px;font:inherit;margin-top:6px' }) as HTMLTextAreaElement;
  const sentLog = c.log.filter((l) => l.what === 'message');
  return el('article', { class: `v2card v2item v2case t-${open ? 'a' : 'f'} ac-card`, 'data-item': `acct:${c.id}`, id: `acCase-${c.id}` },
    el('div', { class: 'v2item-top' }, el('span', { class: 'v2chip a' }, 'Account check'),
      el('small', { class: 'v2wait' }, open ? `asked ${hhmm(c.created_at)}` : `${c.status === 'approved' ? 'approved' : 'kept refused'} ${hhmm(c.decided_at)}`)),
    el('h3', { class: 'v2q' }, `${tag(c.member_no, c.first_name)} asks Kring to check their account`),
    el('div', { class: 'v2what', id: `acWhy-${c.id}` }, `Why it was refused: ${whyRefused(c)}`),
    c.note ? el('small', { class: 'v2sub v2what2' }, `Their note: “${c.note}”`) : el('small', { class: 'v2sub v2what2' }, 'No note from the member.'),
    c.refusals > 1 ? el('small', { class: 'v2sub' }, `Refused ${c.refusals} times so far.`) : null,
    photoGrid(c, selfies),
    open ? el('div', { class: 'v2acts' },
      mk('Approve (different person)', 'ok', `acApprove-${c.id}`, () => void decide('approve')()),
      mk('Keep refused', 'bad', `acKeep-${c.id}`, () => void decide('keep')())) : null,
    el('div', { class: 'ac-msg', style: 'margin-top:10px' },
      el('b', { style: 'display:block;font-size:14px;margin-bottom:6px' }, `Message ${tag(c.member_no, c.first_name)} (one tap · they read it in ${thai ? 'Thai' : 'English'})`),
      el('div', { style: 'display:flex;flex-direction:column;gap:6px' },
        ...AC_PRESETS.map((p) => mk(p.en, '', `acMsg-${p.id}-${c.id}`, () => void send(p.en, thai ? p.th : undefined)))),
      custom,
      mk('Send my message', 'ok', `acSend-${c.id}`, () => { const t = custom.value.trim(); if (!t) { status.textContent = 'Write a message first.'; return; } void send(t).then(() => { custom.value = ''; }); })),
    sentLog.length ? el('small', { class: 'v2sub', style: 'display:block;margin-top:6px' }, `Sent before: ${sentLog.map((l) => `“${(l.en || '').slice(0, 50)}”`).join(' · ')}`) : null,
    status);
}

/** the block at the top of Needs you; hidden when there is nothing (or before 0171). onCount: open requests (Needs you badge). */
export function accountCheckSection(onCount?: (n: number) => void): HTMLElement {
  const box = el('section', { id: 'v2AcctChecks', class: 'ac-sec', hidden: true });
  const load = async () => {
    const list = await rpc<AccountCheck[]>('kr8_admin_account_checks').catch(() => null);
    const items = Array.isArray(list) ? list : [];
    const open = items.filter((c) => c.status === 'open');
    onCount?.(open.length);
    // decided ones stay visible for 7 days only when nothing is open would hide the section; show open first, then the decided
    const shown = open.length ? items : [];
    box.hidden = !shown.length;
    if (!shown.length) { box.replaceChildren(); return; }
    await loadPhotos(shown.flatMap((c) => [c.user_id, c.other_user || '']));
    const selfies = await signSelfies(shown.flatMap((c) => [c.selfie_path, c.other_selfie_path]));
    box.replaceChildren(...shown.map((c) => card(c, selfies, () => { photos = {}; void load(); })));
  };
  void load();
  return box;
}
