/**
 * Admin tabs for Reels (0024): review list (approve / hide), per-creator counts with recruiter codes (payouts),
 * daily + weekly top-5 gifts that point at Reel ids.
 */
import { signReelPaths } from '../v8/v5Reel';
import { basePath, bkkTime, el, rpc, tx, type TxPair } from './shared';

type AdminReel = { id: string; author_id: string; author_name: string; ref_code: string | null; area: string; body: string; created_at: string;
  video_path: string; poster_path: string; duration_ms: number; width: number; height: number; status: 'pending' | 'approved' | 'hidden';
  author_approved: number; reviewed_at: string | null };
type Attr = { kind: 'ref' | 'src'; code: string; signed_up: number; first_reel: number; live_14d: number; three_reels_2days: number };
export type Check = { user_id: string; first_name: string; ref_code: string | null; src_code: string | null; joined_at: string; approved: boolean;
  has_photo: boolean; has_area: boolean; has_ig: boolean; approved_reels: number; reels_total: number; later_day: boolean;
  messages_sent: number; saves: number; second_visit: boolean; m1: boolean; m2: boolean };
const CSV_COLS: (keyof Check)[] = ['first_name', 'ref_code', 'src_code', 'joined_at', 'approved', 'has_photo', 'has_area', 'has_ig', 'approved_reels',
  'reels_total', 'later_day', 'messages_sent', 'saves', 'second_visit', 'm1', 'm2', 'user_id'];
/** Recruiter checklist as CSV (opens in Sheets/Excel). Names are quoted; a leading = + - @ is neutralised. */
export function checklistCsv(rows: Check[]): string {
  const cell = (v: unknown) => {
    let t = v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v);
    if (/^[=+\-@]/.test(t)) t = "'" + t;
    return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  return [CSV_COLS.join(','), ...rows.map((r) => CSV_COLS.map((k) => cell(r[k])).join(','))].join('\n') + '\n';
}
type Creator = { user_id: string; first_name: string; ref_code: string | null; joined_at: string; reels_total: number; approved: number; pending: number;
  hidden: number; first_approved_at: string | null; approved_first_14d: number; approved_last_14d: number };
type Award = { award_id: string; period: 'day' | 'week'; period_start: string; rank: number; prize: string; reel_id: string; author_name: string; area: string;
  poster_path: string; awarded_at: string };

const T = {
  pending: ['รอตรวจ', 'Waiting'], approved: ['อนุมัติแล้ว', 'Approved'], hidden: ['ซ่อนแล้ว', 'Hidden'],
  approve: ['อนุมัติ', 'Approve'], hide: ['ซ่อน', 'Hide'], none: ['ไม่มีรีลในรายการนี้', 'No Reels here'],
  by: ['โดย', 'by'], ref: ['รหัสผู้แนะนำ', 'Recruiter code'], noRef: ['ไม่มีรหัส', 'no code'],
  creator: ['ครีเอเตอร์', 'Creator'], firstOk: ['รีลแรกที่อนุมัติ', 'First approved Reel'], first14: ['อนุมัติใน 14 วันแรก', 'Approved in first 14 days'],
  last14: ['อนุมัติ 14 วันล่าสุด', 'Approved last 14 days'], totals: ['อนุมัติ / รอ / ซ่อน', 'Approved / waiting / hidden'],
  attrTitle: ['ที่มาของสมาชิก (ลิงก์ ?ref= และ ?src=)', 'Where members came from (?ref= and ?src= links)'],
  attrRef: ['ผู้แนะนำ', 'Recruiter'], attrSrc: ['ช่องทาง', 'Channel'], attrCode: ['รหัส', 'Code'],
  attrSigned: ['สมัครแล้ว', 'Signed up'], attrFirst: ['รีลแรกที่อนุมัติ', 'First approved Reel'],
  attrLive: ['ยังออนไลน์หลัง 14 วัน', 'Still live after 14 days'], attrThree: ['3 รีลใน 2 วันขึ้นไป', '3 Reels over 2+ days'],
  attrNone: ['ยังไม่มีใครมาจากลิงก์', 'No one has come from a link yet'],
  ckTitle: ['เช็กลิสต์ผู้แนะนำ (งวดของพิช)', 'Recruiter checklist (Pich milestones)'], ckRef: ['รหัสผู้แนะนำ', 'Recruiter code'],
  ckCsv: ['ดาวน์โหลด CSV', 'Download CSV'], ckRule: ['M1 = ผ่านการยืนยัน + รูป ย่าน IG + รีลที่อนุมัติ 1 รีล · M2 = M1 + กลับมาเปิดแอปวันอื่น และ ทักทาย / บันทึก 3 / รีลที่ 2 (การแอด LINE OA ไม่มีในระบบ)',
    'M1 = verified + photo, area, IG + 1 approved Reel · M2 = M1 + opened the app on a later day and sent a hello / saved 3 / 2nd Reel (LINE OA adds are not in the system)'],
  ckApproved: ['ยืนยัน', 'Verified'], ckProfile: ['โปรไฟล์', 'Profile'], ckReel: ['รีล', 'Reel'], ckSecond: ['ครั้งที่ 2', '2nd visit'],
  payRule: ['นับเฉพาะรีลที่อนุมัติ: รีลแรกที่อนุมัติ และครบ 3 รีลใน 14 วันแรก', 'Only approved Reels count: first approved Reel, and 3 approved Reels within the first 14 days'],
  day: ['รายวัน', 'Daily'], week: ['รายสัปดาห์', 'Weekly'], date: ['วันที่ (สัปดาห์เริ่มวันจันทร์)', 'Date (weeks start Monday)'],
  prize: ['ของรางวัล (เป็นบาท ห้ามใช้เปอร์เซ็นต์)', 'Gift (in baht, no percent)'], winners: ['ผู้ชนะ', 'Winners'], candidates: ['รีลที่อนุมัติในช่วงนี้', 'Approved Reels in this period'],
  remove: ['เอาออก', 'Remove'], link: ['ลิงก์รีล', 'Reel link'], noWinners: ['ยังไม่มีผู้ชนะ', 'No winners yet'],
} as const satisfies Record<string, TxPair>;

const ERR: Record<string, TxPair> = {
  KR8_DEAL_WORDS: ['ห้ามมีเปอร์เซ็นต์ ลิงก์ หรือเบอร์โทร', 'No percent sign, links or phone numbers'],
  KR8_NO_REEL: ['รีลนี้ยังไม่อนุมัติหรือถูกซ่อน', 'This Reel is not approved or is hidden'],
};
const errBox = (e: unknown) => el('p', { class: 'err' }, tx(ERR[String((e as Error)?.message)] || ['ทำไม่สำเร็จ: ' + String((e as Error)?.message), 'Failed: ' + String((e as Error)?.message)]));

export const reelLink = (id: string) => `${location.origin}${basePath()}?reel=${encodeURIComponent(id)}`;
const bkkToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const mondayOf = (d: string) => { const t = new Date(d + 'T00:00:00Z'); const k = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - k); return t.toISOString().slice(0, 10); };

let reelFilter: 'pending' | 'approved' | 'hidden' = 'pending';

export async function reelsView(body: HTMLElement) {
  const tabs = el('div', { class: 'row', style: 'margin:0 0 12px' });
  for (const s of ['pending', 'approved', 'hidden'] as const) {
    const b = el('button', { class: reelFilter === s ? '' : 'ghost', id: 'reelFilter-' + s }, tx(T[s]));
    b.onclick = () => { reelFilter = s; void reelsView(body); };
    tabs.append(b);
  }
  body.replaceChildren(tabs);
  let rows: AdminReel[];
  try { rows = await rpc<AdminReel[]>('kr8_admin_reels', { p_status: reelFilter, p_limit: 100 }); } catch (e) { body.append(errBox(e)); return; }
  if (!rows.length) { body.append(el('div', { class: 'card empty' }, tx(T.none))); return; }
  const urls = await signReelPaths(rows.flatMap((r) => [r.video_path, r.poster_path])).catch(() => ({} as Record<string, string>));
  const grid = el('div', { class: 'reel-grid' });
  for (const r of rows) {
    const msg = el('div', {});
    const card = el('div', { class: 'card reel-card', 'data-reel': r.id },
      el('video', { class: 'reel-admin-video', src: urls[r.video_path] || '', poster: urls[r.poster_path] || '', controls: true, playsinline: true, preload: 'none', muted: true, loop: true }),
      el('div', { class: 'row' }, el('b', { class: 'grow' }, r.author_name), el('span', { class: `pill ${r.status === 'approved' ? 'live' : ''}` }, r.status)),
      el('div', { class: 'meta' }, r.area, ' · ', `${Math.round(r.duration_ms / 1000)} s`, ' · ', bkkTime(r.created_at)),
      el('div', { class: 'meta' }, tx(T.ref), ' ', el('b', {}, r.ref_code || '–'), ` · approved before: ${r.author_approved}`),
      el('div', { class: 'meta', 'data-counts': r.id }),
      r.body ? el('p', { class: 'meta' }, r.body) : null,
      el('div', { class: 'meta', style: 'word-break:break-all' }, el('a', { href: reelLink(r.id), target: '_blank', rel: 'noopener', style: 'color:var(--gold)' }, `Reel ${r.id.slice(0, 8)}`)));
    const row = el('div', { class: 'row', style: 'margin-top:10px' });
    if (r.status !== 'approved') {
      const ok = el('button', { id: 'approveReel-' + r.id }, tx(T.approve));
      ok.onclick = async () => { ok.disabled = true; try { await rpc('kr8_admin_review_reel', { p_reel: r.id, p_status: 'approved' }); card.remove(); } catch (e) { ok.disabled = false; msg.replaceChildren(errBox(e)); } };
      row.append(ok);
    }
    if (r.status !== 'hidden') {
      const hide = el('button', { class: 'bad', id: 'hideReel-' + r.id }, tx(T.hide));
      hide.onclick = async () => { hide.disabled = true; try { await rpc('kr8_admin_review_reel', { p_reel: r.id, p_status: 'hidden' }); card.remove(); } catch (e) { hide.disabled = false; msg.replaceChildren(errBox(e)); } };
      row.append(hide);
    }
    card.append(row, msg);
    grid.append(card);
  }
  body.append(grid);
  // views / likes / saves / shares / open reports (0026); views are only shown here and to the creator
  const counts = await rpc<{ id: string; views: number; likes: number; saves: number; shares: number; open_reports: number }[]>('kr8_admin_reel_counts', { p_ids: rows.map((r) => r.id) }).catch(() => []);
  for (const c of counts) {
    grid.querySelector(`[data-counts="${c.id}"]`)?.replaceChildren(
      `👁 ${c.views} · ♥ ${c.likes} · 🔖 ${c.saves} · ↗ ${c.shares}`, c.open_reports ? el('b', { class: 'err' }, ` · ⚑ ${c.open_reports}`) : '');
  }
}

// ───────────────────────────── Reports tab (A-08) ─────────────────────────────
type Report = { id: string; created_at: string; category: string | null; reason: string; reporter_name: string | null; target_id: string | null; target_name: string | null;
  post_id: string | null; post_kind: string | null; post_body: string | null; video_path: string | null; poster_path: string | null; post_hidden: boolean | null;
  post_reports: number; target_reports: number; handled_at: string | null; resolution: string | null };
const CAT: Record<string, TxPair> = {
  spam: ['สแปมหรือหลอกลวง', 'Spam or scam'], unsafe: ['ไม่ปลอดภัย อนาจาร หรือคุกคาม', 'Unsafe, adult or harassment'],
  stolen: ['ขโมยคลิปหรือแอบอ้าง', 'Stolen clip or pretending to be someone'], wrong_place: ['สถานที่ผิด หรือร้านปิดแล้ว', 'Wrong place or the place is closed'],
  block: ['บล็อกครีเอเตอร์', 'Blocked the creator'],
};
const R = {
  open: ['รอดู', 'Open'], closed: ['จัดการแล้ว', 'Done'], none: ['ไม่มีรายงาน', 'No reports'], person: ['รายงานคน (แชท/โปรไฟล์)', 'Report about a person (chat / profile)'],
  keep: ['เก็บไว้ (แสดงต่อ)', 'Keep (show it again)'], remove: ['ลบออกจากฟีด', 'Remove from feed'], dismiss: ['ปิดรายงาน', 'Close report'],
  by: ['ผู้รายงาน', 'Reported by'], about: ['เกี่ยวกับ', 'About'], hiddenNow: ['ซ่อนอยู่ (3 คนรายงาน)', 'Hidden now (3 people reported)'],
  rule: ['รีลที่ 3 คนรายงานจะถูกซ่อนเองจนกว่าคุณจะตัดสินใจ', 'A Reel reported by 3 different people hides itself until you decide'],
  kept: ['เก็บไว้', 'Kept'], removed: ['ลบแล้ว', 'Removed'], dismissed: ['ปิดแล้ว', 'Closed'],
} as const satisfies Record<string, TxPair>;
let reportsOpen = true;

export async function reportsView(body: HTMLElement, onCount?: (n: number) => void) {
  const tabs = el('div', { class: 'row', style: 'margin:0 0 12px' });
  for (const open of [true, false]) {
    const b = el('button', { class: reportsOpen === open ? '' : 'ghost', id: open ? 'reportsOpen' : 'reportsDone' }, tx(open ? R.open : R.closed));
    b.onclick = () => { reportsOpen = open; void reportsView(body, onCount); };
    tabs.append(b);
  }
  body.replaceChildren(tabs, el('p', { class: 'meta', style: 'margin:0 0 10px' }, tx(R.rule)));
  let rows: Report[];
  try { rows = await rpc<Report[]>('kr8_admin_reports', { p_open: reportsOpen, p_limit: 200 }); } catch (e) { body.append(errBox(e)); return; }
  if (reportsOpen) onCount?.(rows.length);
  if (!rows.length) { body.append(el('div', { class: 'card empty' }, tx(R.none))); return; }
  const urls = await signReelPaths(rows.flatMap((r) => (r.video_path ? [r.video_path, r.poster_path || ''] : []))).catch(() => ({} as Record<string, string>));
  const grid = el('div', { class: 'reel-grid' });
  for (const r of rows) {
    const msg = el('div', {});
    const cat = r.category && CAT[r.category];
    const askAnswer = !r.post_id && /^Ask a Thai answer/.test(r.reason || '');   // 0057/0064: Keep / Remove via kr8_admin_ask_answer
    const card = el('div', { class: 'card reel-card', 'data-report': r.id, 'data-post': r.post_id || '' },
      r.video_path ? el('video', { class: 'reel-admin-video', src: urls[r.video_path] || '', poster: urls[r.poster_path || ''] || '', controls: true, playsinline: true, preload: 'none', muted: true, loop: true }) : null,
      el('div', { class: 'row' }, el('b', { class: 'grow' }, cat ? tx(cat) : tx(R.person)),
        r.post_hidden ? el('span', { class: 'pill' }, tx(R.hiddenNow)) : null,
        r.resolution ? el('span', { class: 'pill' }, tx(R[r.resolution as 'kept' | 'removed' | 'dismissed'] || [r.resolution, r.resolution])) : null),
      cat && !askAnswer ? null : el('p', { class: 'meta' }, r.reason),
      el('div', { class: 'meta' }, tx(R.about), ' ', el('b', {}, r.target_name || '–'), ` · ⚑ ${r.post_id ? r.post_reports : r.target_reports}`),
      el('div', { class: 'meta' }, tx(R.by), ' ', r.reporter_name || '–', ' · ', bkkTime(r.created_at)),
      r.post_body ? el('p', { class: 'meta' }, r.post_body) : null);
    if (!r.handled_at) {
      const row = el('div', { class: 'row', style: 'margin-top:10px' });
      const act = (a: 'keep' | 'remove' | 'dismiss', cls: string, label: TxPair) => {
        const b = el('button', { class: cls, id: `report-${a}-${r.id}` }, tx(label));
        b.onclick = async () => {
          b.disabled = true;
          try {
            if (askAnswer && a !== 'dismiss') await rpc('kr8_admin_ask_answer', { p_report: r.id, p_action: a });
            else await rpc('kr8_admin_resolve_report', { p_report: r.id, p_action: a });
            void reportsView(body, onCount);
          }
          catch (e) { b.disabled = false; msg.replaceChildren(errBox(e)); }
        };
        row.append(b);
      };
      if (r.post_id || askAnswer) { act('keep', '', R.keep); act('remove', 'bad', R.remove); } else act('dismiss', 'ghost', R.dismiss);
      card.append(row);
    }
    card.append(msg);
    grid.append(card);
  }
  body.append(grid);
}

let ckRef = 'pich';
async function checklistCard(): Promise<HTMLElement> {
  const card = el('div', { class: 'card', style: 'overflow-x:auto', id: 'recruitChecklist' });
  const ref = el('input', { id: 'ckRef', value: ckRef, style: 'max-width:160px' }) as HTMLInputElement;
  const csv = el('button', { class: 'ghost', id: 'ckCsv' }, tx(T.ckCsv));
  const out = el('div', {});
  const load = async () => {
    ckRef = ref.value.trim().toLowerCase();
    let rows: Check[] = [];
    try { rows = await rpc<Check[]>('kr8_admin_recruit_checklist', { p_ref: ckRef || null }); } catch (e) { out.replaceChildren(errBox(e)); return; }
    const yes = (b: boolean) => el('td', { class: b ? 'ok' : 'meta' }, b ? '✓' : '–');
    const tb = el('tbody', {});
    for (const r of rows) tb.append(el('tr', { 'data-check': r.user_id },
      el('td', {}, el('b', {}, r.first_name), el('div', { class: 'meta' }, `${r.ref_code || ''} · ${bkkTime(r.joined_at)}`)),
      yes(r.approved), yes(r.has_photo && r.has_area && r.has_ig), el('td', { class: r.approved_reels ? 'ok' : 'meta' }, String(r.approved_reels)),
      yes(r.second_visit), el('td', { class: r.m1 ? 'ok' : 'meta' }, r.m1 ? 'M1 ✓' : '–'), el('td', { class: r.m2 ? 'ok' : 'meta' }, r.m2 ? 'M2 ✓' : '–')));
    const m1 = rows.filter((r) => r.m1).length, m2 = rows.filter((r) => r.m2).length;
    out.replaceChildren(el('p', { class: 'meta', 'data-summary': `${rows.length}/${m1}/${m2}` }, `${rows.length} signed up · M1 ${m1} · M2 ${m2}`),
      el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', {}, tx(T.ckApproved)), el('th', {}, tx(T.ckProfile)), el('th', {}, tx(T.ckReel)),
        el('th', {}, tx(T.ckSecond)), el('th', {}, 'M1'), el('th', {}, 'M2'))), tb));
    csv.onclick = () => {
      const a = el('a', { href: URL.createObjectURL(new Blob(['\ufeff' + checklistCsv(rows)], { type: 'text/csv;charset=utf-8' })),
        download: `kring_recruits_${ckRef || 'all'}_${new Date().toISOString().slice(0, 10)}.csv` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
  };
  ref.onchange = () => void load();
  card.append(el('b', { style: 'font-size:17px' }, tx(T.ckTitle)), el('p', { class: 'note' }, tx(T.ckRule)),
    el('div', { class: 'row', style: 'gap:8px;margin:6px 0' }, el('label', { class: 'f' }, tx(T.ckRef), ref), csv), out);
  await load();
  return card;
}

export async function creatorsView(body: HTMLElement) {
  let rows: Creator[];
  try { rows = await rpc<Creator[]>('kr8_admin_creator_counts'); } catch (e) { body.replaceChildren(errBox(e)); return; }
  body.replaceChildren(el('p', { class: 'note' }, tx(T.payRule)));
  let attr: Attr[] = [];
  try { attr = await rpc<Attr[]>('kr8_admin_attribution'); } catch { attr = []; }
  const at = el('table', { id: 'attrTable' }, el('thead', {}, el('tr', {},
    el('th', {}, tx(T.attrCode)), el('th', {}, tx(T.attrSigned)), el('th', {}, tx(T.attrFirst)), el('th', {}, tx(T.attrLive)), el('th', {}, tx(T.attrThree)))));
  const atb = el('tbody', {});
  for (const a of attr) atb.append(el('tr', { 'data-attr': `${a.kind}:${a.code}` },
    el('td', {}, el('b', {}, a.code), el('div', { class: 'meta' }, tx(a.kind === 'ref' ? T.attrRef : T.attrSrc))),
    el('td', {}, String(a.signed_up)), el('td', {}, String(a.first_reel)), el('td', { class: a.live_14d ? 'ok' : '' }, String(a.live_14d)), el('td', {}, String(a.three_reels_2days))));
  at.append(atb);
  body.append(el('div', { class: 'card', style: 'overflow-x:auto' }, el('b', { style: 'font-size:17px' }, tx(T.attrTitle)),
    attr.length ? at : el('p', { class: 'meta' }, tx(T.attrNone))));
  body.append(await checklistCard());
  if (!rows.length) { body.append(el('div', { class: 'card empty' }, tx(T.none))); return; }
  const byRef = new Map<string, Creator[]>();
  for (const r of rows) { const k = r.ref_code || ''; byRef.set(k, [...(byRef.get(k) || []), r]); }
  for (const [ref, list] of byRef) {
    const firstOk = list.filter((c) => c.first_approved_at).length;
    const three = list.filter((c) => c.approved_first_14d >= 3).length;
    const tbl = el('table', { 'data-ref': ref || 'none' }, el('thead', {}, el('tr', {},
      el('th', {}, tx(T.creator)), el('th', {}, tx(T.firstOk)), el('th', {}, tx(T.first14)), el('th', {}, tx(T.last14)), el('th', {}, tx(T.totals)))));
    const tb = el('tbody', {});
    for (const c of list) {
      tb.append(el('tr', { 'data-creator': c.user_id },
        el('td', {}, el('b', {}, c.first_name), el('div', { class: 'meta' }, bkkTime(c.joined_at))),
        el('td', { class: c.first_approved_at ? 'ok' : 'meta' }, c.first_approved_at ? bkkTime(c.first_approved_at) : '–'),
        el('td', { class: c.approved_first_14d >= 3 ? 'ok' : '', 'data-first14': String(c.approved_first_14d) }, `${c.approved_first_14d} / 3`),
        el('td', {}, String(c.approved_last_14d)),
        el('td', {}, `${c.approved} / ${c.pending} / ${c.hidden}`)));
    }
    tbl.append(tb);
    body.append(el('div', { class: 'card', style: 'overflow-x:auto' },
      el('div', { class: 'row' }, el('b', { class: 'grow', style: 'font-size:17px' }, ref ? `${T.ref[0]} · ${T.ref[1]}: ${ref}` : `${T.noRef[0]} · ${T.noRef[1]}`),
        el('span', { class: 'pill live', 'data-summary': `${firstOk}/${three}` }, `${firstOk} first · ${three} with 3 in 14 days`)), tbl));
  }
}

let giftPeriod: 'day' | 'week' = 'day';
let giftDate = bkkToday();

export async function giftsView(body: HTMLElement) {
  const per = el('div', { class: 'row', style: 'margin:0 0 10px' });
  for (const p of ['day', 'week'] as const) {
    const b = el('button', { class: giftPeriod === p ? '' : 'ghost', id: 'giftPeriod-' + p }, tx(T[p]));
    b.onclick = () => { giftPeriod = p; void giftsView(body); };
    per.append(b);
  }
  const date = el('input', { type: 'date', id: 'giftDate', value: giftDate });
  date.onchange = () => { giftDate = date.value || bkkToday(); void giftsView(body); };
  const prize = el('input', { id: 'giftPrize', value: giftPeriod === 'day' ? '฿300 café voucher' : '฿1,000 dinner voucher' });
  body.replaceChildren(per, el('div', { class: 'grid2' }, el('label', { class: 'f' }, tx(T.date), date), el('label', { class: 'f' }, tx(T.prize), prize)));
  const start = giftPeriod === 'week' ? mondayOf(giftDate) : giftDate;
  const end = new Date(new Date(start + 'T00:00:00+07:00').getTime() + (giftPeriod === 'week' ? 7 : 1) * 864e5);
  let winners: Award[] = [];
  let reels: AdminReel[] = [];
  try {
    [winners, reels] = await Promise.all([
      rpc<Award[]>('kr8_reel_awards_list', { p_period: giftPeriod, p_start: start }),
      rpc<AdminReel[]>('kr8_admin_reels', { p_status: 'approved', p_limit: 300 }),
    ]);
  } catch (e) { body.append(errBox(e)); return; }
  const from = new Date(start + 'T00:00:00+07:00').getTime();
  reels = reels.filter((r) => { const t = Date.parse(r.created_at); return t >= from && t < end.getTime(); });

  const wl = el('div', { class: 'card', id: 'winners' }, el('b', {}, tx(T.winners)), el('p', { class: 'meta' }, `${giftPeriod === 'week' ? 'Week of' : 'Day'} ${start}`));
  if (!winners.length) wl.append(el('p', { class: 'meta' }, tx(T.noWinners)));
  for (const w of winners) {
    const rm = el('button', { class: 'ghost', id: 'unaward-' + w.award_id }, tx(T.remove));
    rm.onclick = async () => { await rpc('kr8_admin_unaward', { p_award: w.award_id }).catch(() => undefined); void giftsView(body); };
    wl.append(el('div', { class: 'row', 'data-rank': String(w.rank), style: 'margin-top:8px' },
      el('b', { style: 'font-size:20px;color:var(--gold)' }, `#${w.rank}`),
      el('div', { class: 'grow' }, el('div', {}, `${w.author_name} · ${w.area}`), el('div', { class: 'meta' }, w.prize),
        el('a', { href: reelLink(w.reel_id), target: '_blank', rel: 'noopener', style: 'color:var(--gold);font-size:13px', 'data-reel-link': w.reel_id }, reelLink(w.reel_id))),
      rm));
  }
  body.append(wl);
  const cl = el('div', { class: 'card', id: 'candidates' }, el('b', {}, tx(T.candidates)));
  if (!reels.length) cl.append(el('p', { class: 'meta' }, tx(T.none)));
  const urls = reels.length ? await signReelPaths(reels.map((r) => r.poster_path)).catch(() => ({} as Record<string, string>)) : {};
  for (const r of reels) {
    const ranks = el('div', { class: 'row' });
    for (let k = 1; k <= 5; k++) {
      const b = el('button', { class: 'ghost', id: `rank-${k}-${r.id}`, style: 'padding:8px 12px' }, `#${k}`);
      b.onclick = async () => {
        b.disabled = true;
        try { await rpc('kr8_admin_award_reel', { p_reel: r.id, p_period: giftPeriod, p_start: start, p_rank: k, p_prize: prize.value }); void giftsView(body); }
        catch (e) { b.disabled = false; cl.append(errBox(e)); }
      };
      ranks.append(b);
    }
    cl.append(el('div', { class: 'row', style: 'margin-top:10px;align-items:flex-start', 'data-candidate': r.id },
      el('img', { src: urls[r.poster_path] || '', alt: '', style: 'width:54px;height:96px;object-fit:cover;border-radius:10px;background:#000' }),
      el('div', { class: 'grow' }, el('div', {}, `${r.author_name} · ${r.area}`), el('div', { class: 'meta' }, bkkTime(r.created_at)), ranks)));
  }
  body.append(cl);
}
