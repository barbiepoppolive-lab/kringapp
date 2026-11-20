import { describe, expect, it } from 'vitest';
import { AC_PRESETS, memberThai, whyRefused, type AccountCheck } from './accountChecks';

const base: AccountCheck = {
  id: 'c1', status: 'open', created_at: '2026-11-20T12:00:00Z', decided_at: null, note: null, log: [],
  user_id: 'u1', member_no: 307, first_name: '🩵', langs: ['th'], other_user: 'u2', other_no: 23, other_name: '🩵', other_gone: false,
  sim: 99.9, refused_at: '2026-11-20T08:04:00Z', gone_winner: false, selfie_path: null, other_selfie_path: null, refusals: 1,
};

describe('account checks (0171)', () => {
  it('says why it was refused in plain words', () => {
    const w = whyRefused(base);
    expect(w).toMatch(/^Same face as #23 🩵 · 100% AWS match · refused automatically/);
  });
  it('names a deleted prize winner', () => {
    expect(whyRefused({ ...base, other_gone: true, gone_winner: true, other_no: 50, other_name: 'X' })).toContain('deleted account #50 X (took a prize)');
  });
  it('reads Thai unless the card lists languages without Thai', () => {
    expect(memberThai({ langs: null })).toBe(true);
    expect(memberThai({ langs: ['th', 'en'] })).toBe(true);
    expect(memberThai({ langs: ['en'] })).toBe(false);
  });
  it('has 3 one-tap replies, each with natural Thai ending in ครับ', () => {
    expect(AC_PRESETS).toHaveLength(3);
    for (const p of AC_PRESETS) { expect(p.en.length).toBeGreaterThan(20); expect(p.th).toMatch(/ครับ$/); }
  });
});
