// T-209 · admin "Stay / Do" tab with the DB calls mocked: listing card shows taps per partner, Live toggle, save form.
import { beforeEach, describe, expect, it, vi } from 'vitest';
const calls: [string, Record<string, unknown>][] = [];
const ROW = { id: 'test-stay', kind: 'stay', name: 'Test Hostel', name_th: null, area: 'Ari', blurb_en: null, blurb_th: null, photos: [], member_price_thb: 450,
  price_unit_en: 'per night', price_unit_th: null, saving_thb: 80, booking_kind: 'line_oa', booking_contact: '@test', live: false, live_at: null,
  taps: 7, members: 5, taps_7d: 3, last_tap_at: '2026-11-11T10:00:00Z', by_ref: { pich: 4, '-': 3 } };
vi.mock('../venue/shared', async () => {
  const real = await vi.importActual<typeof import('../venue/shared')>('../venue/shared');
  return { ...real, rpc: async (fn: string, args: Record<string, unknown> = {}) => { calls.push([fn, args]); return fn === 'kr8_admin_listings' ? [ROW] : null; } };
});
import { stayView } from '../venue/stayAdmin';

describe('admin Stay / Do', () => {
  beforeEach(() => { calls.length = 0; document.body.innerHTML = ''; });
  it('shows Book-direct taps per partner and by ref code', async () => {
    const body = document.createElement('div'); document.body.append(body);
    let n = -1; await stayView(body, (x) => { n = x; });
    expect(n).toBe(0);
    expect(body.querySelector('#stayTaps-test-stay')!.textContent).toContain('7');
    expect(body.textContent).toContain('pich 4');
  });
  it('Make live calls the toggle; Add opens the form and saves', async () => {
    const body = document.createElement('div'); document.body.append(body);
    await stayView(body, () => undefined);
    (body.querySelector('#stayLive-test-stay') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.find(([f]) => f === 'kr8_admin_listing_set_live')![1]).toEqual({ p_id: 'test-stay', p_live: true });
    (body.querySelector('#stayAdd') as HTMLButtonElement).click();
    const f = body.querySelector('#stayForm')!;
    const set = (k: string, v: string) => { (f.querySelector(`[name="${k}"]`) as HTMLInputElement).value = v; };
    set('id', 'clay-ari'); set('kind', 'do'); set('name', 'Clay Studio'); set('member_price_thb', '600'); set('booking_contact', '@clay');
    (f.querySelector('#staySave') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    const saved = calls.find(([fn]) => fn === 'kr8_admin_listing_save')![1].p as Record<string, unknown>;
    expect(saved).toMatchObject({ id: 'clay-ari', kind: 'do', member_price_thb: 600, booking_kind: 'line_oa', saving_thb: '' });
  });
});
