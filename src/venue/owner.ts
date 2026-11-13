/**
 * Owner's private "today" page (OPTION A, D-10NOV-E): kringapp.com/app/owner.html?v=<slug>&k=<owner_key>
 * Every time a Kring guest opens their live pass at this place it shows here (name, time, treat, today n of limit).
 * The link is sent once in the LINE welcome; it refreshes every 30 seconds. Thai first, English under.
 */
import '../lib/sentry';
import '../v8/fonts-v8.css';
import { bkkTime, el, rpc, tx } from './shared';
import './venue.css';

type Today = { venue: { name: string; name_th: string | null; deal_en: string | null; deal_th: string | null } | null; daily_cap: number;
  uses: { name: string | null; at: string; deal_en: string | null; deal_th: string | null }[] };

const root = document.getElementById('app')!;
document.documentElement.style.background = document.body.style.background = '#FFF7EC';
const q = new URLSearchParams(location.search);
const slug = (q.get('v') || '').toLowerCase();
const key = q.get('k') || '';

async function draw() {
  try {
    const d = await rpc<Today>('kr8_owner_today', { p_venue: slug, p_key: key });
    const name = d.venue ? (d.venue.name_th || d.venue.name) : '';
    root.replaceChildren(el('div', { class: 'owner' },
      el('h1', {}, name),
      el('p', { class: 'big' }, tx([`วันนี้ลูกค้ากริ๊ง! ${d.uses.length} จาก ${d.daily_cap} คน`, `Kring guests today: ${d.uses.length} of ${d.daily_cap}`])),
      d.uses.length
        ? el('ul', { class: 'uses' }, ...d.uses.map((u) => el('li', {},
            el('b', {}, bkkTime(u.at, false)), ' · ', el('span', {}, u.name || 'Kring'), ' · ',
            tx([u.deal_th || u.deal_en || '', u.deal_en || u.deal_th || ''], 'small'))))
        : el('p', { class: 'muted' }, tx(['ยังไม่มีลูกค้าใช้สิทธิ์วันนี้', 'No treats used yet today'])),
      el('p', { class: 'muted' }, tx(['หน้านี้อัปเดตเองทุก 30 วินาที', 'This page updates every 30 seconds']))));
  } catch {
    root.replaceChildren(el('div', { class: 'owner' }, el('p', { class: 'big' }, tx(['ลิงก์นี้ใช้ไม่ได้ ทัก LINE @194hsqbc', 'This link does not work. Message LINE @194hsqbc']))));
  }
}
void draw();
setInterval(() => { if (document.visibilityState === 'visible') void draw(); }, 30_000);
