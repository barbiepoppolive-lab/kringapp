import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, waitFor } from '@testing-library/react';
import { RankingPage, SeatsLine } from './V5KxRanking';
import { KX_L } from './v5Strings';

const kxMock = vi.hoisted(() => ({
  kxRanking: vi.fn(async () => ({ week_start: '', ends_at: '', scope: 'all', area: null, total: 0, paid_ranks: 8, floor: 25, posters: 0, min_posters: 0, payout_on: true, open_seats: 8, prizes: [1500, 900, 600, 500, 400, 250, 150, 100], rows: [], me: null, gap: null, mine: null })),
  kxSeatsLeft: vi.fn(async () => 37 as number | null),
}));
vi.mock('./v5Kx', async (orig) => ({ ...(await orig<typeof import('./v5Kx')>()), ...kxMock }));

const en = (s: string) => s;
const enf = (s: string, a: string, b = '') => s.replace('{0}', a).replace('{1}', b);
const th = (s: string) => KX_L.th[s] || s;
const thf = (s: string, a: string, b = '') => th(s).replace('{0}', a).replace('{1}', b);
const BANNED = /\b(meet|guide|tour|host|creator|reviews|hidden gem|alcohol|gift|wallet|credit|lucky|draw|temples)\b|ลุ้น/i;

describe('Board: "X of 50 paid seats left" (0096)', () => {
  it('English: one plain line', () => {
    render(<SeatsLine L={en} Lf={enf} lang="en" left={37} />);
    expect(screen.getByText('37 of 50 paid seats left')).toBeTruthy();
  });
  it('Thai: Thai line with the English under it', () => {
    render(<SeatsLine L={th} Lf={thf} lang="th" left={37} />);
    expect(screen.getByText('ที่นั่งรับรางวัล เหลือ 37 จาก 50 ที่')).toBeTruthy();
    expect(screen.getByText('37 of 50 paid seats left')).toBeTruthy();
  });
  it('hidden when full, off (null) or unknown', () => {
    for (const left of [0, null, undefined]) {
      const { container, unmount } = render(<SeatsLine L={en} Lf={enf} lang="en" left={left} />);
      expect(container.querySelector('#kxSeatsLeft')).toBeNull();
      unmount();
    }
  });
  it('on the board, from kr8_seats_left', async () => {
    render(<RankingPage L={en} Lf={enf} lang="en" myArea={null} myPhoto={null} myName="" myId={null} onBack={() => undefined} onPerson={() => undefined} onPost={() => undefined} onShare={() => undefined} />);
    await waitFor(() => expect(document.querySelector('#kxSeatsLeft')?.textContent).toBe('37 of 50 paid seats left'));
    expect(kxMock.kxSeatsLeft).toHaveBeenCalled();
  });
  it('copy has no banned words; the SQL returns one integer and never reads voucher stock', () => {
    expect(BANNED.test('{0} of {1} paid seats left')).toBe(false);
    expect(BANNED.test(KX_L.th['{0} of {1} paid seats left'])).toBe(false);
    const sql = readFileSync(`${process.cwd()}/supabase/migrations/0096_kr8_seats_left.sql`, 'utf8').replace(/^--.*$/gm, '');
    expect(sql).toMatch(/returns integer/);
    expect(sql).toMatch(/count(distinct assigned_to)/);   // 18 Nov: seats = people who received a voucher (one person = one seat)
    expect(sql).not.toMatch(/status = 'available'/);       // never counts stock left
  });
});
