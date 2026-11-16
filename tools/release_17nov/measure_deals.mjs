// LOCAL-ONLY: finds what makes the Deals page wider than the phone (uses the prize_ui fake backend; nothing reaches live).
import { open, settle } from '../prize_ui/run.mjs';
import { APP } from '../prize_ui/fake_kring.mjs';
const browsers = {};
const { page, context, state } = await open(browsers, process.argv[2] || 'iphone14', 'C');
const img = (n) => `${APP}media/places/${n}.jpg`;
export const TREATS = [
  { id: 't1', venue: 'Baan Ari Coffee', venue_th: 'บ้านอารีย์ คอฟฟี่', area: 'Ari', cat: 'coffee', tag: 'Coffee', title: 'Free cookie with any coffee', price_now: 0, price_was: 0, total: 50, claimed: 3, left_count: 47,
    valid_window: 'all day', img: img('bacc'), mine_code: null, deal_en: 'Free butter cookie with any coffee', deal_th: 'คุกกี้เนยฟรี เมื่อสั่งกาแฟแก้วใดก็ได้', hours_en: '8:00–18:00', hours_th: '8:00–18:00', maps_url: 'https://maps.app.goo.gl/x' },
  { id: 't2', venue: 'Talad Noi Studio', venue_th: 'ตลาดน้อย สตูดิโอ', area: 'Talad Noi', cat: 'fun', tag: 'Fun', title: '฿50 off a pottery class', price_now: 0, price_was: 0, total: 20, claimed: 1, left_count: 19,
    valid_window: 'all day', img: img('bang-lamphu'), mine_code: null, deal_en: '฿50 off a 1-hour pottery class with an extra-long studio name', deal_th: 'ลด ฿50 คลาสปั้นดิน 1 ชั่วโมง', hours_en: '10:00–20:00', hours_th: '10:00–20:00', maps_url: null },
];
export const LISTINGS = [
  { id: 'l1', kind: 'stay', name: 'Riverside Hostel Bangkok', name_th: 'ริเวอร์ไซด์ โฮสเทล', area: 'Riverside', blurb_en: 'Dorm beds by the river, rooftop with a view', blurb_th: 'เตียงหอพักริมน้ำ ดาดฟ้าวิวสวย',
    photos: [img('asiatique-the-riverfront')], member_price_thb: 390, price_unit_en: 'per night', price_unit_th: 'ต่อคืน', saving_thb: 60, booking_kind: 'line', booking_contact: 'riverside', my_code: 'K-1234' },
  { id: 'l2', kind: 'do', name: 'Muay Thai morning class', name_th: 'คลาสมวยไทยตอนเช้า', area: 'Sukhumvit', blurb_en: 'Beginner-friendly, gloves included', blurb_th: 'มือใหม่เรียนได้ มีนวมให้',
    photos: [img('centralworld')], member_price_thb: 450, price_unit_en: 'per class', price_unit_th: 'ต่อคลาส', saving_thb: 100, booking_kind: 'ig', booking_contact: 'muaybkk', my_code: 'K-5678' },
];
state.data.rpc.kr8_treats_live = TREATS;
state.data.rpc.kr8_listings_live = LISTINGS;
await settle(page, 2000);
await page.click('nav.dock [data-tab="deals"]');
await settle(page, 2500);
const r = await page.evaluate(() => {
  const W = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll('#s-deals *')) {
    const b = el.getBoundingClientRect();
    if (b.width && b.right > W + 0.5) out.push({ tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 60), right: Math.round(b.right), w: Math.round(b.width), text: (el.textContent || '').trim().slice(0, 40) });
  }
  const s = document.getElementById('s-deals');
  return { W, docSW: document.documentElement.scrollWidth, secSW: s && s.scrollWidth, secCW: s && s.clientWidth, over: out.slice(0, 25) };
});
console.log(JSON.stringify({ W: r.W, secSW: r.secSW, over: r.over.map((o) => o.cls) }));
const box = await page.locator('#s-deals').boundingBox();
await page.mouse.move(box.x + 200, box.y + 300);
await page.mouse.wheel(120, 0);
await page.waitForTimeout(400);
console.log('scrollLeft after a sideways wheel:', await page.evaluate(() => document.getElementById('s-deals').scrollLeft));
await context.close(); for (const b of Object.values(browsers)) await b.close();
void APP;
