/**
 * admin.html → "Verify" tab (0031): profile photo next to the live-check selfie, the phone's check results, Approve (gives ✓ verified)
 * or Reject with a reason. Opening the tab also deletes selfies reviewed more than 30 days ago (Storage API) — the PDPA promise.
 */
import { bkkTime, el, rpc, tx, v5Client, type TxPair } from './shared';

type Row = { id: string; user_id: string; first_name: string; profile_photo: string | null; selfie_path: string | null;
  live_check: { straight?: boolean; left?: boolean; right?: boolean; blink?: boolean; match?: number | null; device?: string; model?: string };
  status: 'pending' | 'approved' | 'rejected'; created_at: string; reviewed_at: string | null; reject_reason: string | null;
  approved_reels: number; account_created: string };

const T = {
  pending: ['รอตรวจ', 'Waiting'], approved: ['ผ่านแล้ว', 'Approved'], rejected: ['ไม่ผ่าน', 'Rejected'], none: ['ไม่มีรายการ', 'Nothing here'],
  profile: ['รูปโปรไฟล์', 'Profile photo'], selfie: ['เซลฟี่จากการตรวจสด', 'Live-check selfie'], noPhoto: ['ไม่มีรูป', 'No photo'], gone: ['ลบเซลฟี่แล้ว (30 วัน)', 'Selfie deleted (30 days)'],
  approve: ['ยืนยัน ✓', 'Approve ✓'], reject: ['ไม่ผ่าน', 'Reject'], reason: ['เหตุผล (ผู้ใช้จะเห็น)', 'Reason (the member sees it)'], send: ['ส่ง', 'Send'],
  steps: ['ขั้นตอนบนโทรศัพท์', 'Steps on the phone'], rule: ['ดูว่าเป็นคนเดียวกันจริงไหม ใบหน้าชัด ไม่ใช่รูปถ่ายจากจอ แล้วค่อยกดยืนยัน', 'Check it is the same person, the face is clear and it is not a photo of a screen, then approve.'],
  cleaned: ['ลบเซลฟี่ที่เกิน 30 วันแล้ว', 'Deleted selfies older than 30 days'],
  noBlink: ['กะพริบตา: ตรวจไม่พบ (ผ่านด้วยการมองกล้องตรง 20 วินาที) ดูเซลฟี่ให้ดี', 'blink: not detected (passed after 20 s facing the camera). Look at the selfie carefully.'],
} as const satisfies Record<string, TxPair>;

function matchLabel(m: number | null | undefined, aws = false): [string, TxPair] {
  // 0125: AWS similarity 0–1, higher = more alike (0.80+ = automatic ✓)
  if (aws && m !== null && m !== undefined) return m >= 0.8 ? ['ok', [`น่าจะเป็นคนเดียวกัน (AWS ${(m * 100).toFixed(0)}%)`, `Likely the same person (AWS ${(m * 100).toFixed(0)}%)`]]
    : ['err', [`ดูให้ดี อาจเป็นคนละคน (AWS ${(m * 100).toFixed(0)}%)`, `Look carefully: may be a different person (AWS ${(m * 100).toFixed(0)}%)`]];
  if (m === null || m === undefined) return ['meta', ['ไม่มีคะแนน (หาใบหน้าในรูปใดรูปหนึ่งไม่เจอ)', 'No score (no face found in one of the photos)']];
  if (m < 0.5) return ['ok', [`น่าจะเป็นคนเดียวกันมาก (${m.toFixed(2)})`, `Very likely the same person (${m.toFixed(2)})`]];
  if (m < 0.6) return ['ok', [`น่าจะเป็นคนเดียวกัน (${m.toFixed(2)})`, `Likely the same person (${m.toFixed(2)})`]];
  return ['err', [`ดูให้ดี อาจเป็นคนละคน (${m.toFixed(2)})`, `Look carefully: may be a different person (${m.toFixed(2)})`]];
}

let filter: Row['status'] = 'pending';

/** Selfies reviewed > 30 days ago: remove the files, then mark them. */
async function cleanup(note: HTMLElement) {
  try {
    const due = await rpc<{ id: string; selfie_path: string }[]>('kr8_admin_verify_files_due');
    if (!due.length) return;
    const c = await v5Client();
    const { error } = await c.storage.from('kr8-verify').remove(due.map((d) => d.selfie_path));
    if (error) return;
    const n = await rpc<number>('kr8_admin_mark_selfies_deleted', { p_ids: due.map((d) => d.id) });
    if (n) note.replaceChildren(el('p', { class: 'meta', id: 'verifyCleaned' }, tx([`${T.cleaned[0]}: ${n}`, `${T.cleaned[1]}: ${n}`])));
  } catch {
    // try again next time the tab opens
  }
}

export async function verifyView(body: HTMLElement, onCount?: (n: number) => void) {
  const tabs = el('div', { class: 'row', style: 'margin:0 0 12px' });
  for (const s of ['pending', 'approved', 'rejected'] as const) {
    const b = el('button', { class: filter === s ? '' : 'ghost', id: 'verifyFilter-' + s }, tx(T[s]));
    b.onclick = () => { filter = s; void verifyView(body, onCount); };
    tabs.append(b);
  }
  const note = el('div', {});
  body.replaceChildren(tabs, el('p', { class: 'meta', style: 'margin:0 0 10px' }, tx(T.rule)), note);
  void cleanup(note);
  let rows: Row[];
  try { rows = await rpc<Row[]>('kr8_admin_verifications', { p_status: filter }); } catch (e) { body.append(el('p', { class: 'err' }, String((e as Error).message))); return; }
  if (filter === 'pending') onCount?.(rows.length);
  if (!rows.length) { body.append(el('div', { class: 'card empty' }, tx(T.none))); return; }
  const c = await v5Client();
  const paths = rows.map((r) => r.selfie_path).filter((x): x is string => !!x);
  const signed: Record<string, string> = {};
  if (paths.length) {
    const { data } = await c.storage.from('kr8-verify').createSignedUrls(paths, 600);
    for (const d of data || []) if (d.path && d.signedUrl) signed[d.path] = d.signedUrl;
  }
  const grid = el('div', { class: 'reel-grid' });
  for (const r of rows) {
    const msg = el('div', {});
    const pic = (src: string | null | undefined, label: TxPair, empty: TxPair) => el('figure', { class: 'vf-pic' },
      src ? el('img', { src, alt: '' }) : el('div', { class: 'vf-none' }, tx(empty)), el('figcaption', {}, tx(label)));
    const [cls, ml] = matchLabel(r.live_check.match, r.live_check.model === 'aws-rekognition');
    const lc = r.live_check;
    const card = el('div', { class: 'card reel-card', 'data-verify': r.id },
      el('div', { class: 'row' }, el('b', { class: 'grow' }, r.first_name), el('span', { class: `pill ${r.status === 'approved' ? 'live' : ''}` }, r.status)),
      el('div', { class: 'vf-pair' }, pic(r.profile_photo, T.profile, T.noPhoto), pic(r.selfie_path ? signed[r.selfie_path] : null, T.selfie, T.gone)),
      el('div', { class: cls, 'data-match': String(lc.match ?? '') }, tx(ml)),
      el('div', { class: 'meta' }, tx(T.steps), ' ', [lc.straight && '🙂', lc.left && '↶', lc.right && '↷', lc.blink && '😉'].filter(Boolean).join(' '), lc.device ? ` · ${lc.device}` : ''),
      lc.right && !lc.blink && lc.model !== 'aws-rekognition' ? el('div', { class: 'err', 'data-noblink': '1' }, tx(T.noBlink)) : null,
      el('div', { class: 'meta' }, bkkTime(r.created_at), ` · account ${bkkTime(r.account_created)} · approved Reels ${r.approved_reels}`),
      r.reject_reason ? el('p', { class: 'meta' }, r.reject_reason) : null);
    if (r.status === 'pending') {
      const ok = el('button', { id: 'verifyApprove-' + r.id }, tx(T.approve));
      const no = el('button', { class: 'bad', id: 'verifyReject-' + r.id }, tx(T.reject));
      ok.onclick = async () => {
        ok.disabled = true;
        try { await rpc('kr8_admin_review_verification', { p_id: r.id, p_approve: true }); card.remove(); }
        catch (e) { ok.disabled = false; msg.replaceChildren(el('p', { class: 'err' }, String((e as Error).message))); }
      };
      no.onclick = () => {
        const why = el('textarea', { rows: '2', maxlength: '200', id: 'verifyWhy-' + r.id }) as HTMLTextAreaElement;
        const go = el('button', { class: 'bad', id: 'verifySendReject-' + r.id }, tx(T.send));
        go.onclick = async () => {
          go.disabled = true;
          try { await rpc('kr8_admin_review_verification', { p_id: r.id, p_approve: false, p_reason: why.value }); card.remove(); }
          catch (e) { go.disabled = false; msg.append(el('p', { class: 'err' }, String((e as Error).message))); }
        };
        msg.replaceChildren(el('label', { class: 'f' }, tx(T.reason), why), el('div', { class: 'row', style: 'margin-top:8px' }, go));
      };
      card.append(el('div', { class: 'row', style: 'margin-top:10px' }, ok, no));
    }
    card.append(msg);
    grid.append(card);
  }
  body.append(grid);
}
