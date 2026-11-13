// T-208: pre-season copy (rewards start date in the member's language) and the recruiter CSV.
import { describe, expect, it, vi } from 'vitest';
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: async () => ({ data: null, error: null }) }) }));
import { fmtRewardDay, rewardsOpen } from './V5Me';
import { checklistCsv, type Check } from '../venue/reelsAdmin';

const START = Date.parse('2026-12-01T00:00:00+07:00');

describe('pre-season rewards', () => {
  it('rewards open at 1 Dec 00:00 Bangkok, not before', () => {
    expect(rewardsOpen(START, START - 1)).toBe(false);
    expect(rewardsOpen(START, START)).toBe(true);
  });
  it('"1 Dec" in the member language, on the Bangkok calendar', () => {
    expect(fmtRewardDay(START, 'en')).toBe('1 Dec');
    expect(fmtRewardDay(START, 'th')).toBe('1 ธ.ค.');
    expect(fmtRewardDay(START, 'ja')).toMatch(/12月1日/);
    expect(fmtRewardDay(START, 'ko')).toMatch(/12월 1일/);
  });
});

describe('recruiter checklist CSV', () => {
  const row = (o: Partial<Check>): Check => ({ user_id: 'u1', first_name: 'Pim', ref_code: 'pich', src_code: null, joined_at: '2026-11-12T03:00:00Z',
    approved: true, has_photo: true, has_area: true, has_ig: true, approved_reels: 1, reels_total: 2, later_day: true, messages_sent: 1, saves: 0,
    second_visit: true, m1: true, m2: true, ...o });
  it('header + yes/no columns', () => {
    const [head, line] = checklistCsv([row({})]).trim().split('\n');
    expect(head.split(',').slice(0, 4)).toEqual(['first_name', 'ref_code', 'src_code', 'joined_at']);
    expect(line).toBe('Pim,pich,,2026-11-12T03:00:00Z,yes,yes,yes,yes,1,2,yes,1,0,yes,yes,yes,u1');
  });
  it('names with commas/quotes are quoted; a name starting with = cannot run as a formula', () => {
    const csv = checklistCsv([row({ first_name: 'Nam, "Bee"' }), row({ first_name: '=HYPERLINK("x")' })]);
    expect(csv).toContain('"Nam, ""Bee"""');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
