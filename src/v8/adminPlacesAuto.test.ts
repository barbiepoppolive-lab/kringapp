import { describe, expect, it } from 'vitest';
import { buildInbox, placeAutoText, placeFlags, type PlaceAuto, type PlaceRow, type Snapshot } from '../venue/adminV2Logic';

// 0086: places members type in decide themselves. The founder never sees them in "Needs you"; they show in "Handled automatically".
const base = (o: Partial<Snapshot> = {}): Snapshot => ({
  at: '2026-11-17T10:00:00Z', day_start: '2026-11-16T18:30:00Z', week_start: '2026-11-16T17:00:00Z', include_test: false,
  counts: { real: 0, real_today: 0, test: 0, team: 0, ghost: 0, admin: 0, nocard: 0 },
  people: [], claims: [], codes: [], board: { week_start: '2026-11-16T17:00:00Z', paid_ranks: 8, floor: 25, rows: [] },
  pending: { reels: [], checks: [], reports: 0, places: 3 }, alerts: [], ...o,
});
const auto = (action: string, o: Partial<PlaceAuto> = {}): PlaceAuto => ({ at: '2026-11-17T09:43:00Z', action, place_id: 'p1', name: 'กาญจนบุรี', reason: null, into: null,
  outside: null, area: null, no: 57, status: 'live', now_name: null, ...o });
const row = (o: Partial<PlaceRow> = {}): PlaceRow => ({ id: 'p1', name_en: 'กาญจนบุรี', name_th: 'กาญจนบุรี', area: 'Outside Bangkok', status: 'live', added_how: 'typed',
  outside_bkk: true, coords_rough: false, osm_ref: 'N301331954', lat: 14.02, lng: 99.53, created_at: '2026-11-17T10:09:00Z', by_no: 57, by_name: 'M57', geo: 'found', reels: 1, auto: 'place_auto_live', ...o });

describe('admin v2 · places decide themselves (0086)', () => {
  it('"N new places from members" is gone from Needs you, even if old pending rows exist', () => {
    const { items } = buildInbox(base());
    expect(items.map((i) => i.title).join(' ')).not.toMatch(/place/i);
  });
  it('every automatic place decision is one line in Handled automatically, newest first', () => {
    const s = base({ places_auto: [
      auto('place_auto_live', { at: '2026-11-17T09:43:00Z', outside: true }),
      auto('place_auto_reject', { at: '2026-11-17T09:50:00Z', name: 'call 0812345678', reason: 'phone', status: 'rejected' }),
      auto('place_auto_link', { at: '2026-11-17T09:55:00Z', name: 'nana coffee 😍', into: 'Nana Coffee Roasters' }),
      auto('place_geo_found', { at: '2026-11-17T10:00:00Z', outside: true }),
      auto('place_geo_miss', { at: '2026-11-17T10:05:00Z', name: 'วัดเจดีย์ไอ้ไข่' }),
    ] });
    const lines = buildInbox(s).handled.map((h) => h.text);
    expect(lines).toEqual([
      'Not on the map: “วัดเจดีย์ไอ้ไข่” (kept as a name-only tag)',
      'Pinned “กาญจนบุรี” on the map · outside Bangkok',
      'Place “nana coffee 😍” (#57) matched existing “Nana Coffee Roasters”',
      'Place “call 0812345678” (#57) refused: phone number',
      'New place “กาญจนบุรี” added (#57) · outside Bangkok',
    ]);
  });
  it('old snapshots without places_auto still work', () => {
    expect(buildInbox(base({ places_auto: undefined })).handled).toEqual([]);
  });
  it('plain words for every refusal reason, unknown actions are skipped', () => {
    for (const [r, w] of [['url', 'web link'], ['line_id', 'LINE id'], ['rude', 'rude word'], ['too_short', 'too short'], ['no_letters', 'no letters'], ['banned', 'banned word'], ['placeholder', 'not a place name']])
      expect(placeAutoText(auto('place_auto_reject', { reason: r }))).toMatch(new RegExp(`refused: ${w}$`));
    expect(placeAutoText(auto('place_hidden'))).toBeNull();
  });
  it('Places list chips: on map / finding pin / name only / outside / refused', () => {
    expect(placeFlags(row())).toEqual([['outside Bangkok', 'a'], ['on map', 'g']]);
    expect(placeFlags(row({ outside_bkk: false, coords_rough: true, geo: 'asked' }))).toEqual([['finding pin…', '']]);
    expect(placeFlags(row({ outside_bkk: false, coords_rough: true, geo: 'not_found' }))).toEqual([['name only', '']]);
    expect(placeFlags(row({ status: 'rejected', outside_bkk: false, auto: 'place_auto_reject:rude' }))).toEqual([['refused · rude word', 'r']]);
    expect(placeFlags(row({ status: 'rejected', outside_bkk: false, auto: 'place_auto_live' }))).toEqual([['hidden', 'r']]);
  });
});
