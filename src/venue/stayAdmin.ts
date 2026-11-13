/**
 * admin.html → "Stay / Do" (T-209 simplified): partner stays and workshops with a member price.
 * The partner tells us the member price; the admin types it here. Each listing stays hidden until "Live" is switched on.
 * The only proof shown to partners: "Book direct" taps per listing (total · different members · last 7 days · by ref code).
 */
import { bkkTime, el, rpc, tx, type TxPair } from './shared';

export type AdminListing = { id: string; kind: 'stay' | 'do'; name: string; name_th: string | null; area: string; blurb_en: string | null; blurb_th: string | null;
  photos: string[]; member_price_thb: number; price_unit_en: string | null; price_unit_th: string | null; saving_thb: number | null;
  booking_kind: 'line_oa' | 'line' | 'ig' | 'url'; booking_contact: string; live: boolean; live_at: string | null;
  taps: number; members: number; taps_7d: number; last_tap_at: string | null; by_ref: Record<string, number> };

const T = {
  add: ['+ เพิ่มที่พัก / กิจกรรม', '+ Add a stay / do'], none: ['ยังไม่มีรายการ', 'No listings yet'],
  live: ['แสดงอยู่ (Live)', 'Live'], hidden: ['ซ่อนอยู่', 'Hidden'], goLive: ['เปิดให้สมาชิกเห็น', 'Make live'], hide: ['ซ่อน', 'Hide'],
  edit: ['แก้ไข', 'Edit'], save: ['บันทึก', 'Save'], cancel: ['ยกเลิก', 'Cancel'],
  taps: ['กด "จองตรง"', 'Book-direct taps'], members: ['สมาชิก', 'members'], week: ['7 วัน', '7 days'], byRef: ['ตามรหัสผู้แนะนำ', 'By ref code'],
  rule: ['ราคาสมาชิกตั้งโดยพาร์ทเนอร์ · ไม่ใส่ราคาเว็บอื่น · ซ่อนไว้จนกว่าจะกด "เปิดให้สมาชิกเห็น"',
         'The partner sets the member price · no other-site prices · hidden until you tap "Make live"'],
} as const satisfies Record<string, TxPair>;

const FIELDS: [key: keyof AdminListing, label: TxPair, hint?: string][] = [
  ['id', ['รหัส (a-z 0-9 -)', 'ID (a-z 0-9 -)'], 'e.g. lub-d-silom'],
  ['kind', ['ประเภท stay / do', 'Kind stay / do'], 'stay'],
  ['name', ['ชื่อ (อังกฤษ)', 'Name (English)']],
  ['name_th', ['ชื่อ (ไทย)', 'Name (Thai)']],
  ['area', ['ย่าน', 'Area'], 'Ari'],
  ['blurb_en', ['คำอธิบายสั้น (อังกฤษ)', 'Short line (English)']],
  ['blurb_th', ['คำอธิบายสั้น (ไทย)', 'Short line (Thai)']],
  ['photos', ['ลิงก์รูป https (บรรทัดละรูป)', 'Photo links https (one per line)']],
  ['member_price_thb', ['ราคาสมาชิก ฿ (พาร์ทเนอร์ตั้ง)', 'Member price ฿ (set by partner)']],
  ['price_unit_en', ['หน่วย (อังกฤษ)', 'Unit (English)'], 'per night'],
  ['price_unit_th', ['หน่วย (ไทย)', 'Unit (Thai)'], 'ต่อคืน'],
  ['saving_thb', ['ประหยัด ฿ (ไม่ใส่ก็ได้)', 'Saving ฿ (optional)']],
  ['booking_kind', ['ช่องทางจอง line_oa / line / ig / url', 'Booking via line_oa / line / ig / url'], 'line_oa'],
  ['booking_contact', ['LINE @id / LINE ID / IG / https ลิงก์', 'LINE @id / LINE ID / IG / https link'], '@partner'],
];

function form(start: Partial<AdminListing>, done: () => void): HTMLElement {
  const box = el('div', { class: 'card', id: 'stayForm' });
  const inputs = new Map<string, HTMLInputElement | HTMLTextAreaElement>();
  for (const [k, label, hint] of FIELDS) {
    const v = start[k];
    const inp = k === 'photos' || k.startsWith('blurb')
      ? (el('textarea', { rows: k === 'photos' ? '3' : '2', name: k, placeholder: hint, style: 'width:100%' }) as HTMLTextAreaElement)
      : (el('input', { name: k, placeholder: hint, style: 'width:100%' }) as HTMLInputElement);
    inp.value = Array.isArray(v) ? v.join('\n') : v === null || v === undefined ? '' : String(v);
    if (k === 'id' && start.id) (inp as HTMLInputElement).readOnly = true;
    inputs.set(k, inp);
    box.append(el('label', { style: 'display:block;margin:6px 0' }, tx(label), inp));
  }
  const msg = el('div');
  const save = el('button', { id: 'staySave' }, tx(T.save));
  const cancel = el('button', { class: 'ghost' }, tx(T.cancel));
  cancel.onclick = done;
  save.onclick = async () => {
    const g = (k: string) => (inputs.get(k)?.value || '').trim();
    const p = Object.fromEntries(FIELDS.map(([k]) => [k, g(k)]));
    const payload = { ...p, photos: g('photos').split(/\s+/).filter(Boolean), member_price_thb: Number(g('member_price_thb')) || 0, saving_thb: g('saving_thb') ? Number(g('saving_thb')) : '' };
    try { await rpc('kr8_admin_listing_save', { p: payload }); done(); } catch (e) { msg.replaceChildren(el('p', { class: 'err' }, String((e as Error).message))); }
  };
  box.append(el('div', { class: 'row', style: 'gap:6px' }, save, cancel), msg);
  return box;
}

function card(l: AdminListing, refresh: () => void): HTMLElement {
  const c = el('div', { class: 'card', id: 'stay-' + l.id },
    el('div', { class: 'row', style: 'justify-content:space-between;gap:8px' },
      el('b', {}, `${l.kind === 'stay' ? '🛏' : '🎨'} ${l.name}${l.name_th ? ' · ' + l.name_th : ''}`),
      el('span', { class: l.live ? 'ok' : 'meta' }, tx(l.live ? T.live : T.hidden))),
    el('p', { class: 'meta' }, `${l.area} · ฿${l.member_price_thb}${l.price_unit_en ? ' ' + l.price_unit_en : ''}${l.saving_thb ? ` · save ฿${l.saving_thb}` : ''} · ${l.booking_kind}: ${l.booking_contact}`),
    el('p', { id: 'stayTaps-' + l.id }, tx([`${T.taps[0]} ${l.taps} · ${T.members[0]} ${l.members} · ${T.week[0]} ${l.taps_7d}`,
      `${T.taps[1]} ${l.taps} · ${l.members} ${T.members[1]} · ${l.taps_7d} in ${T.week[1]}`])),
    Object.keys(l.by_ref || {}).length ? el('p', { class: 'meta' }, `${T.byRef[1]}: ` + Object.entries(l.by_ref).map(([k, n]) => `${k} ${n}`).join(' · ')) : null,
    l.last_tap_at ? el('p', { class: 'meta' }, 'last tap ' + bkkTime(l.last_tap_at)) : null);
  const toggle = el('button', { class: l.live ? 'bad' : '', id: 'stayLive-' + l.id }, tx(l.live ? T.hide : T.goLive));
  toggle.onclick = async () => { await rpc('kr8_admin_listing_set_live', { p_id: l.id, p_live: !l.live }).catch(() => undefined); refresh(); };
  const edit = el('button', { class: 'ghost' }, tx(T.edit));
  edit.onclick = () => c.replaceWith(form(l, refresh));
  c.append(el('div', { class: 'row', style: 'gap:6px' }, toggle, edit));
  return c;
}

export async function stayView(body: HTMLElement, setCount: (n: number) => void): Promise<void> {
  const refresh = () => void stayView(body, setCount);
  const rows = await rpc<AdminListing[]>('kr8_admin_listings');
  setCount(rows.filter((r) => r.live).length);
  const add = el('button', { id: 'stayAdd' }, tx(T.add));
  add.onclick = () => add.replaceWith(form({ kind: 'stay', booking_kind: 'line_oa', area: 'Bangkok' }, refresh));
  body.replaceChildren(el('p', { class: 'meta' }, tx(T.rule)), add,
    ...(rows.length ? rows.map((r) => card(r, refresh)) : [el('div', { class: 'card empty' }, tx(T.none))]));
}
