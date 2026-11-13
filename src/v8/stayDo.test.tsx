import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const listings = vi.fn();
const tap = vi.fn();
vi.mock('./v5Live', () => ({ v5Listings: () => listings(), v5ListingTap: (id: string) => tap(id) }));
import { StayDo, bookingUrl, bookingMessage } from './V5StayDo';

const L = (s: string) => s;
const Lf = (s: string, a: string) => s.replace('{0}', a);
const row = { id: 'test-stay', kind: 'stay' as const, name: 'Test Hostel', name_th: 'โฮสเทลทดสอบ', area: 'Ari', blurb_en: 'Rooftop near BTS', blurb_th: null,
  photos: ['https://x.test/a.jpg'], member_price_thb: 450, price_unit_en: 'per night', price_unit_th: 'ต่อคืน', saving_thb: 80,
  booking_kind: 'line_oa' as const, booking_contact: '@testhostel', my_code: 'KRING-2402' };

describe('T-209 Stay & do', () => {
  beforeEach(() => { listings.mockReset(); tap.mockReset(); tap.mockResolvedValue(true); });

  it('LINE OA link carries the pre-filled message with the member code', () => {
    const u = bookingUrl(row)!;
    expect(u.startsWith('https://line.me/R/oaMessage/%40testhostel/?')).toBe(true);
    expect(decodeURIComponent(u.split('?')[1])).toBe(bookingMessage(row));
    expect(bookingMessage(row)).toContain('KRING-2402');
  });
  it('other contact kinds: safe links only', () => {
    expect(bookingUrl({ ...row, booking_kind: 'line', booking_contact: 'nam.stay' })).toBe('https://line.me/ti/p/~nam.stay');
    expect(bookingUrl({ ...row, booking_kind: 'ig', booking_contact: '@ari.studio' })).toBe('https://ig.me/m/ari.studio');
    expect(bookingUrl({ ...row, booking_kind: 'url', booking_contact: 'https://example.com/book' })).toBe('https://example.com/book');
    expect(bookingUrl({ ...row, booking_kind: 'url', booking_contact: 'javascript:alert(1)' })).toBeNull();
    expect(bookingUrl({ ...row, booking_kind: 'line_oa', booking_contact: '@bad id"<' })).toBeNull();
  });
  it('signed out: nothing rendered, nothing fetched', () => {
    const { container } = render(<StayDo L={L} Lf={Lf} thai={false} signedIn={false} />);
    expect(container.innerHTML).toBe('');
    expect(listings).not.toHaveBeenCalled();
  });
  it('no live partner yet: section stays hidden', async () => {
    listings.mockResolvedValue([]);
    const { container } = render(<StayDo L={L} Lf={Lf} thai={false} signedIn />);
    await waitFor(() => expect(listings).toHaveBeenCalled());
    expect(container.querySelector('#stayDo')).toBeNull();
  });
  it('member sees partner price, subtle saving, no other-site price; Book direct logs one tap', async () => {
    listings.mockResolvedValue([row, { ...row, id: 'test-do', kind: 'do', name: 'Clay Studio' }]);
    render(<StayDo L={L} Lf={Lf} thai={false} signedIn />);
    expect(await screen.findByText('Test Hostel')).toBeTruthy();
    expect(screen.getAllByText('฿450').length).toBe(2);
    expect(screen.getAllByText('save ฿80').length).toBe(2);
    expect(document.body.textContent).not.toMatch(/%|Booking\.com|Agoda|was ฿/);
    fireEvent.click(screen.getByRole('tab', { name: 'Do' }));
    expect(screen.queryByText('Test Hostel')).toBeNull();
    const a = screen.getByText(/Book direct/) as HTMLAnchorElement;
    expect(a.getAttribute('href')).toContain('line.me/R/oaMessage');
    a.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(a);
    expect(tap).toHaveBeenCalledWith('test-do');
  });
  it('Thai screen uses the Thai name and unit', async () => {
    listings.mockResolvedValue([row]);
    render(<StayDo L={L} Lf={Lf} thai signedIn />);
    expect(await screen.findByText('โฮสเทลทดสอบ')).toBeTruthy();
    expect(document.body.textContent).toContain('ต่อคืน');
  });
});
