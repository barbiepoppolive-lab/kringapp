/**
 * 0138 traveller tag (19 Nov, founder): members can't pick "traveller" any more; a passport photo goes to the team, who approve
 * or refuse in admin Needs you. Guard rules, the migration's safety properties, member screens (one language), admin case card.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guardWho, OTHER_KEY, passportPathOk, reasonText, REASON_KEY, REFUSE_REASONS, travellerView, whoToSave, type TravellerState } from './travellerLogic';
import { V5_L, KX_L } from './v5Strings';
import { buildInbox, countryName, travellerPerson, travellerSuggestion, type Snapshot, type TravellerCase, type TravellerCheck } from '../venue/adminV2Logic';

vi.mock('./v5Live', async (orig) => ({
  ...(await orig<typeof import('./v5Live')>()),
  v5PassportJpeg: vi.fn(async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })),
  v5RequestTraveller: vi.fn(),
}));
import { TravellerPage, TravellerRow } from './V5Traveller';

const read = (p: string) => readFileSync(path.join(__dirname, p), 'utf8');
const SQL = readFileSync(path.join(__dirname, '../../supabase/migrations/0138_kr8_traveller_passport.sql'), 'utf8');
const code = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const thL = (en: string) => V5_L.th[en] || KX_L.th[en] || en;
const enL = (en: string) => en;
const pending: TravellerState = { who: 'local', request: { id: 'r1', status: 'pending', reason_code: null, reason_note: null, at: '2026-11-19T10:00:00Z', decided_at: null } };
const refused: TravellerState = { who: 'local', request: { id: 'r1', status: 'refused', reason_code: 'thai', reason_note: null, at: '2026-11-19T10:00:00Z', decided_at: '2026-11-19T11:00:00Z' } };
afterEach(cleanup);

describe('guard: who can become a traveller (mirror of kr8_traveller_guard_trg)', () => {
  it('a member asking for traveller stays local (new card and edit)', () => {
    expect(guardWho({ op: 'INSERT', newWho: 'traveller', signedIn: true })).toBe('local');
    expect(guardWho({ op: 'UPDATE', oldWho: 'local', newWho: 'traveller', signedIn: true })).toBe('local');
  });
  it('approved request, the admin decision, or no member signed in (seeding) may set traveller', () => {
    expect(guardWho({ op: 'UPDATE', oldWho: 'local', newWho: 'traveller', signedIn: true, approved: true })).toBe('traveller');
    expect(guardWho({ op: 'UPDATE', oldWho: 'local', newWho: 'traveller', signedIn: true, adminDecision: true })).toBe('traveller');
    expect(guardWho({ op: 'INSERT', newWho: 'traveller', signedIn: false })).toBe('traveller');
  });
  it('existing traveller rows (ghost / demo) are left alone; back to local is always fine', () => {
    expect(guardWho({ op: 'UPDATE', oldWho: 'traveller', newWho: 'traveller', signedIn: true })).toBe('traveller');
    expect(guardWho({ op: 'UPDATE', oldWho: 'traveller', newWho: 'local', signedIn: true })).toBe('local');
  });
  it('card forms only ever send what the card already is', () => {
    expect(whoToSave(null)).toBe('local');
    expect(whoToSave('local')).toBe('local');
    expect(whoToSave('traveller')).toBe('traveller');
    for (const f of ['V5KxCard.tsx', 'V5Sheets.tsx']) {
      const src = read(f);
      expect(src).not.toMatch(/setWho\('traveller'\)/);
      expect(src).not.toContain('v5WhoTraveller');
    }
  });
  it('passport file path: own folder, uuid, .jpg only', () => {
    const uid = '11111111-1111-1111-1111-111111111111';
    expect(passportPathOk(uid, `${uid}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg`)).toBe(true);
    expect(passportPathOk(uid, `22222222-2222-2222-2222-222222222222/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg`)).toBe(false);
    expect(passportPathOk(uid, `${uid}/../x.jpg`)).toBe(false);
  });
});

describe('migration 0138: additive, guarded, private, no passport numbers', () => {
  it('has an UNDO block and drops nothing outside it', () => {
    expect(SQL.slice(0, 4000)).toMatch(/-- UNDO/);
    expect(code).not.toMatch(/\bdrop (table|column|function)\b/i);
    expect(code).not.toMatch(/alter table public\.kr8_members/i);
  });
  it('the trigger is BEFORE INSERT OR UPDATE OF who and keeps who instead of raising', () => {
    expect(code).toMatch(/create trigger kr8_traveller_guard before insert or update of who on public\.kr8_members/);
    expect(code).toMatch(/new\.who := case when tg_op = 'UPDATE' then coalesce\(old\.who, 'local'\) else 'local' end/);
    // #68: kr8_save_card upserts, so the INSERT step keeps an existing traveller; the flag only counts for an admin
    expect(code).toMatch(/tg_op = 'INSERT' and exists \(select 1 from public\.kr8_members m where m\.user_id = new\.user_id and m\.who = 'traveller'\)/);
    expect(code).toMatch(/kr8\.traveller_set', true\), ''\) = '1' and public\.kr8_is_admin\(\)/);
  });
  it('admin functions check kr8_is_admin(); the decision sets the session flag and resets it', () => {
    for (const fn of ['kr8_admin_traveller_requests', 'kr8_admin_traveller_decide', 'kr8_admin_passport_files_due', 'kr8_admin_mark_passports_deleted']) {
      const body = code.slice(code.indexOf(`function public.${fn}(`));
      expect(body.slice(0, 900), fn).toContain("if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'");
    }
    expect(code).toContain("set_config('kr8.traveller_set', '1', true)");
    expect(code).toContain("set_config('kr8.traveller_set', '', true)");
  });
  it('private bucket, member upload into own folder only, admin-only read; photo deleted at the decision, 30 days at most', () => {
    expect(code).toMatch(/values \('kr8-passport', 'kr8-passport', false/);
    expect(code).toMatch(/kr8_passport_upload on storage\.objects for insert to authenticated\s+with check \(bucket_id = 'kr8-passport' and \(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text and public\.kr8_has_card\(\)\)/);
    expect(code).toMatch(/kr8_passport_admin_read on storage\.objects for select to authenticated\s+using \(bucket_id = 'kr8-passport' and public\.kr8_is_admin\(\)\)/);
    const decide = code.slice(code.indexOf('function public.kr8_admin_traveller_decide('), code.indexOf('-- ───────────── 6.'));
    expect(decide).toMatch(/insert into public\.kr8_storage_trash \(bucket, name, user_id\) values \('kr8-passport', r\.passport_path/);
    expect(decide).toContain('passport_path = null');
    expect(decide).toContain('kr8_passport_cleanup_kick()');
    expect(code).toMatch(/created_at < now\(\) - interval '30 days'/);
    expect(code).toMatch(/cron\.schedule\('kr8_passport_cleanup'/);
  });
  it('stores the photo only: no passport number / nationality / birth date columns', () => {
    const table = code.slice(code.indexOf('create table if not exists public.kr8_traveller_requests'), code.indexOf(');', code.indexOf('create table if not exists public.kr8_traveller_requests')));
    expect(table).not.toMatch(/number|passport_no|nationality|birth|dob/i);
  });
  it('the app never logs passport details (no client events from the traveller screen)', () => {
    const src = read('V5Traveller.tsx');
    expect(src).not.toMatch(/v5LogClient|console\./);
    const live = read('v5Live.ts');
    const fn = live.slice(live.indexOf('export async function v5RequestTraveller'), live.indexOf('/** 0066: the face code'));
    expect(fn).not.toMatch(/v5LogClient|console\./);
    expect(fn).toContain('/storage/v1/object/kr8-passport/');
  });
});

describe('member screens: one language, every string in all six', () => {
  const keys = [...new Set([...read('V5Traveller.tsx').matchAll(/\bL\(\s*'((?:\\.|[^'])*)'/g)].map((m) => m[1].replace(/\\'/g, "'"))
    .concat(Object.values(REASON_KEY), [OTHER_KEY, 'Visiting Bangkok? Ask for the traveller tag', 'Checking your passport · within 24 h', '✓ Verified traveller', 'Not approved · tap to see why']))];
  it('Thai and zh / hi / ja / ko for every key', () => {
    expect(keys.length).toBeGreaterThan(20);
    for (const k of keys) {
      expect(V5_L.th[k] || KX_L.th[k], `th: ${k}`).toBeTruthy();
      for (const l of ['zh', 'hi', 'ja', 'ko']) expect(read(`strings/v5.${l}.ts`).includes(`'${k.replace(/'/g, "\\'")}':`), `${l}: ${k}`).toBe(true);
    }
  });
  it('no banned words; Thai copy is polite where Kring speaks', () => {
    const BAD_EN = /\b(match|meet|host|guide|tour|dating|rate|gift|wallet|credit|lucky|draw|chance|reviews?|stars|temples?)\b/i;
    const BAD_TH = ['ไกด์', 'โฮสต์', 'ทัวร์', 'รีวิว', 'ดาว', 'เจอ', 'พบ', 'นัด', 'ค่ะ'];
    for (const k of keys) {
      expect(BAD_EN.test(k), k).toBe(false);
      const th = V5_L.th[k] || KX_L.th[k];
      for (const w of BAD_TH) expect(th.includes(w), `${w} in ${th}`).toBe(false);
    }
    expect(V5_L.th['Only the Kring team sees this photo, never other members. We delete it as soon as we decide, and always within 30 days.']).toMatch(/ครับ$/);
  });
  it('request screen in Thai mode shows Thai only (no English words)', () => {
    const { container } = render(<div className="v8-app-root"><TravellerPage L={thL} state={null} onClose={() => {}} onSent={() => {}} /></div>);
    const txt = container.textContent || '';
    expect(txt).toContain('มาเที่ยวกรุงเทพฯ ใช่ไหม');
    expect(txt).toContain('ลบทิ้งทันทีที่ตรวจเสร็จ');
    expect(txt).toContain('ยินยอม');
    expect(txt.replace(/24|30/g, '')).not.toMatch(/[A-Za-z]{3,}/);
  });
  it('English: the form, what we check, privacy; Send waits for a photo', () => {
    const { container } = render(<TravellerPage L={enL} state={null} onClose={() => {}} onSent={() => {}} />);
    expect(container.querySelector('#ktCheck')!.textContent).toContain('It’s a non-Thai passport');
    expect(container.querySelector('#ktPrivacy')!.textContent).toContain('as soon as we decide');
    expect(container.querySelector('#ktPrivacy')!.textContent).toContain('never other members');
    expect(container.querySelector('#ktConsent')!.textContent).toContain('you agree');
    expect((container.querySelector('#ktSend') as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('#ktCamera input')!.getAttribute('capture')).toBe('environment');
  });
  it('pick a photo → Send → pending, through the upload function', async () => {
    const sent = vi.fn(async () => pending);
    const onSent = vi.fn();
    const { container } = render(<TravellerPage L={enL} state={null} onClose={() => {}} onSent={onSent} send={sent} />);
    const f = new File([new Uint8Array([1, 2, 3])], 'p.jpg', { type: 'image/jpeg' });
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:passport');
    globalThis.URL.revokeObjectURL = vi.fn();
    await act(async () => { fireEvent.change(container.querySelector('#ktGallery input')!, { target: { files: [f] } }); });
    await waitFor(() => expect((container.querySelector('#ktSend') as HTMLButtonElement).disabled).toBe(false));
    expect(container.querySelector('#ktFrame img')!.getAttribute('src')).toBe('blob:passport');
    await act(async () => { fireEvent.click(container.querySelector('#ktSend')!); });
    expect(sent).toHaveBeenCalledTimes(1);
    expect((sent.mock.calls[0] as unknown[])[0]).toBeInstanceOf(Blob);
    expect(onSent).toHaveBeenCalledWith(pending);
  });
  it('pending: "We’ll check within 24 h"; approved: traveller; refused: the reason in the member language', () => {
    const p = render(<TravellerPage L={enL} state={pending} onClose={() => {}} onSent={() => {}} />);
    expect(p.container.querySelector('#ktPending')!.textContent).toContain('We’ll check within 24 h');
    p.unmount();
    const a = render(<TravellerPage L={enL} state={{ who: 'traveller', request: null }} onClose={() => {}} onSent={() => {}} />);
    expect(a.container.querySelector('#ktApproved')!.textContent).toContain('You’re a verified traveller');
    a.unmount();
    const r = render(<TravellerPage L={thL} state={refused} onClose={() => {}} onSent={() => {}} />);
    expect(r.container.querySelector('#ktRefused')!.textContent).toContain('พาสปอร์ตไทยขอป้ายนักท่องเที่ยวไม่ได้ครับ');
    expect(reasonText(enL, { reason_code: 'other', reason_note: 'Please send the page with your photo.' })).toBe('Please send the page with your photo.');
    // Thai mode never shows the team's English note: a Thai line instead (one language at a time)
    expect(reasonText(thL, { reason_code: 'other', reason_note: 'Please send the page with your photo.' }, false)).toBe(V5_L.th[OTHER_KEY]);
    const { container: thRef } = render(<TravellerPage L={thL} state={{ who: 'local', request: { id: 'r', status: 'refused', reason_code: 'other', reason_note: 'Please send the page with your photo.', at: '', decided_at: '' } }} onClose={() => {}} onSent={() => {}} />);
    expect(thRef.querySelector('#ktRefused')!.textContent).not.toMatch(/[A-Za-z]{3,}/);
  });
  it('the row on the card edit screen shows the state', () => {
    const states: [TravellerState | null, string][] = [[null, 'Ask for the traveller tag'], [pending, 'within 24 h'], [refused, 'tap to see why'], [{ who: 'traveller', request: null }, 'Verified traveller']];
    for (const [s, t] of states) {
      const { container, unmount } = render(<TravellerRow L={enL} state={s} onOpen={() => {}} />);
      expect(container.querySelector('#kxTravRow')!.textContent).toContain(t);
      unmount();
    }
    expect(travellerView(null, 'traveller')).toBe('approved');
  });
});

// ───────── admin ─────────
const NOW = '2026-11-19T12:00:00Z';
const tcase = (o: Partial<TravellerCase> = {}): TravellerCase => ({ id: 'req1', user_id: 'u77', member_no: 77, first_name: 'Anna', who: 'local', verified: true,
  passport_path: 'u77/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg', status: 'pending', reason_code: null, reason_note: null, created_at: '2026-11-19T09:00:00Z', decided_at: null, file_deleted_at: null, ...o });
const snap = (): Snapshot => ({
  at: NOW, day_start: '2026-11-18T18:30:00Z', week_start: '2026-11-15T17:00:00Z', include_test: false,
  counts: { real: 1, real_today: 0, test: 0, team: 0, ghost: 0, admin: 0, nocard: 0 },
  people: [{ ...travellerPerson(tcase()), joined_at: '2026-11-10T09:00:00Z', area: 'Ari' }], claims: [], codes: [],
  board: { week_start: '2026-11-15T17:00:00Z', paid_ranks: 8, floor: 25, rows: [] }, pending: { reels: [], checks: [], reports: 0, places: 0 }, alerts: [],
  traveller: [tcase(), tcase({ id: 'req2', user_id: 'u88', member_no: 88, first_name: 'Ben' }), tcase({ id: 'req3', status: 'replaced' })],
});

describe('admin: Traveller check case cards (logic)', () => {
  it('one card per pending request, question in plain English, members missing from the snapshot still get a card', () => {
    const { items } = buildInbox(snap());
    const t = items.filter((i) => i.kind === 'traveller');
    expect(t.map((i) => i.key)).toEqual(['t:req1', 't:req2']);
    expect(t[0].question).toBe('Make Anna (#77) a traveller?');
    expect(t[0].what[0]).toMatch(/same name, same face, not a Thai passport/);
    expect(t[1].people[0].name).toBe('Ben');
    expect(t[1].traveller!.id).toBe('req2');
  });
  it('a request whose photo is already gone says so', () => {
    const s = snap(); s.traveller = [tcase({ passport_path: null })];
    expect(buildInbox(s).items[0].what[0]).toMatch(/deleted/);
  });
  it('refuse reasons cover the member-facing ones', () => {
    for (const k of Object.keys(REASON_KEY)) expect(REFUSE_REASONS.some((r) => r.code === k), k).toBe(true);
    expect(REFUSE_REASONS.some((r) => r.code === 'other')).toBe(true);
  });
});

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let checksMock: unknown[] = [];   // 0187: kr8_admin_traveller_checks answer
vi.mock('../venue/shared', async () => {
  const actual = await vi.importActual<typeof import('../venue/shared')>('../venue/shared');
  return {
    ...actual,
    v5Client: vi.fn(async () => ({ storage: { from: (b: string) => ({ createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://signed.test/${b}/${p}` } }),
      createSignedUrls: async () => ({ data: [] }), remove: async () => ({ error: null }) }) } })),
    rpc: vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push({ fn, args });
      if (fn === 'kr8_admin_v2_snapshot') { const s = snap(); delete s.traveller; return s; }
      if (fn === 'kr8_admin_traveller_requests') return snap().traveller;
      if (fn === 'kr8_admin_v2_photos') return { u77: 'https://cdn.test/anna.jpg' };
      if (fn === 'kr8_admin_traveller_decide') return { ok: true };
      if (fn === 'kr8_admin_traveller_checks') return checksMock;
      return null;
    }),
  };
});
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

describe('admin: Traveller check case card (DOM)', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="app"></div>'; rpcCalls.length = 0; checksMock = []; history.replaceState(null, '', '#inbox'); });
  it('passport photo big next to the card photo, name + member no, Approve → decide RPC', async () => {
    const v2 = await import('../venue/adminV2');
    await v2.loadSnapshot(true);
    v2.inboxView(); await wait(80);
    const card = document.querySelector<HTMLElement>('[data-item="t:req1"]')!;
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('Traveller check');
    expect(card.textContent).toContain('Make Anna (#77) a traveller?');
    expect(card.textContent).toContain('Anna #77');
    const pass = card.querySelector<HTMLImageElement>('.v2pp-pass img')!;
    expect(pass.src).toBe('https://signed.test/kr8-passport/u77/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg');
    expect(pass.closest('a')!.getAttribute('target')).toBe('_blank');
    expect(card.querySelector<HTMLImageElement>('.v2pp-card img')!.src).toBe('https://cdn.test/anna.jpg');
    expect(card.querySelector('.v2pp-chk')!.textContent).toContain('NOT a Thai passport');
    vi.useFakeTimers();
    try {
      card.querySelector<HTMLButtonElement>('#v2TravOk-req1')!.click();
      expect(document.getElementById('v2Toast')!.textContent).toContain('is now a traveller');
      await vi.advanceTimersByTimeAsync(5200);
    } finally { vi.useRealTimers(); }
    expect(rpcCalls.find((c) => c.fn === 'kr8_admin_traveller_decide')!.args).toEqual({ p_id: 'req1', p_approve: true });
  });
  it('Refuse… needs a reason; "Other" needs a note; the reason goes to the decide RPC', async () => {
    const v2 = await import('../venue/adminV2');
    await v2.loadSnapshot(true);
    v2.inboxView(); await wait(80);
    const card = document.querySelector<HTMLElement>('[data-item="t:req2"]')!;
    const box = card.querySelector<HTMLElement>('#v2TravRefuse-req2')!;
    expect(box.hidden).toBe(true);
    card.querySelector<HTMLButtonElement>('#v2TravNo-req2')!.click();
    expect(box.hidden).toBe(false);
    const go = box.querySelector<HTMLButtonElement>('#v2TravRefuseGo-req2')!;
    expect(go.disabled).toBe(true);
    box.querySelector<HTMLElement>('[data-code="other"]')!.click();
    expect(go.disabled).toBe(true);
    const note = box.querySelector<HTMLInputElement>('#v2TravNote-req2')!;
    note.value = 'Please send the page with your photo.'; note.dispatchEvent(new Event('input'));
    expect(go.disabled).toBe(false);
    box.querySelector<HTMLElement>('[data-code="thai"]')!.click();
    vi.useFakeTimers();
    try { go.click(); await vi.advanceTimersByTimeAsync(5200); } finally { vi.useRealTimers(); }
    expect(rpcCalls.find((c) => c.fn === 'kr8_admin_traveller_decide')!.args).toEqual({ p_id: 'req2', p_approve: false, p_reason_code: 'thai', p_note: null });
  });
  it('0187 robot PASS: big APPROVE line + four ✓ lines; the founder still taps Approve', async () => {
    checksMock = [chk({ request_id: 'req1' })];
    const v2 = await import('../venue/adminV2');
    await v2.loadSnapshot(true);
    v2.inboxView(); await wait(80);
    const card = document.querySelector<HTMLElement>('[data-item="t:req1"]')!;
    expect(card.querySelector('#v2TravSug-req1')!.textContent).toBe('Suggested: APPROVE — passport from Germany, face match 97%, name matches “Anna”');
    expect(card.querySelectorAll('.v2pp-auto li.ok').length).toBe(4);
    expect(card.querySelector('#v2TravOk-req1')!.className).toBe('v2btn ok');
    expect(rpcCalls.some((c) => c.fn === 'kr8_admin_traveller_decide')).toBe(false);   // nothing decided by itself
  });
  it('0187 robot FAIL (not a passport): REFUSE line, Refuse is the solid button, the reason is picked already', async () => {
    checksMock = [chk({ request_id: 'req2', mrz_found: false, nationality: null, issuing: null, face_result: 'skipped', face_sim: null, name_result: 'unknown', suggestion: 'fail', fail_code: 'not_passport' })];
    const v2 = await import('../venue/adminV2');
    await v2.loadSnapshot(true);
    v2.inboxView(); await wait(80);
    const card = document.querySelector<HTMLElement>('[data-item="t:req2"]')!;
    expect(card.querySelector('#v2TravSug-req2')!.textContent).toBe('Suggested: REFUSE — not a passport page (no passport code found)');
    expect(card.querySelector('.v2pp-auto li.no')!.textContent).toContain('No passport code found');
    expect(card.querySelector('#v2TravNo-req2')!.className).toContain('solid');
    card.querySelector<HTMLButtonElement>('#v2TravNo-req2')!.click();
    const box = card.querySelector<HTMLElement>('#v2TravRefuse-req2')!;
    expect(box.querySelector('[data-code="not_passport"]')!.getAttribute('aria-checked')).toBe('true');
    const go = box.querySelector<HTMLButtonElement>('#v2TravRefuseGo-req2')!;
    expect(go.disabled).toBe(false);
    vi.useFakeTimers();
    try { go.click(); await vi.advanceTimersByTimeAsync(5200); } finally { vi.useRealTimers(); }
    expect(rpcCalls.find((c) => c.fn === 'kr8_admin_traveller_decide')!.args).toEqual({ p_id: 'req2', p_approve: false, p_reason_code: 'not_passport', p_note: null });
  });
});

const chk = (o: Partial<TravellerCheck> = {}): TravellerCheck => ({ request_id: 'req1', state: 'done', checked_at: '2026-11-21T10:00:00Z', mrz_found: true, mrz_valid: true,
  issuing: 'DEU', nationality: 'DEU', is_thai: false, face_ref: 'selfie', face_result: 'ok', face_sim: 97.2, name_result: 'match', suggestion: 'pass',
  fail_code: null, errors: [], attempts: 1, ...o });
describe('0187 travellerSuggestion (plain English)', () => {
  it('Thai passport → REFUSE with the thai reason', () => {
    const s = travellerSuggestion(chk({ issuing: 'THA', nationality: 'THA', is_thai: true, suggestion: 'fail', fail_code: 'thai' }), 'Mint')!;
    expect(s.line).toBe('Suggested: REFUSE — Thai passport'); expect(s.preselect).toBe('thai'); expect(s.tone).toBe('r');
  });
  it('different face → REFUSE with the percent', () => {
    const s = travellerSuggestion(chk({ face_result: 'different', face_sim: 12.4, suggestion: 'fail', fail_code: 'photo' }), 'Lena')!;
    expect(s.line).toBe('Suggested: REFUSE — different face (12% match)'); expect(s.preselect).toBe('photo');
  });
  it('only the name differs → CHECK BY EYE, nothing pre-picked', () => {
    const s = travellerSuggestion(chk({ nationality: 'NOR', issuing: 'NOR', name_result: 'differs', suggestion: 'check' }), 'Lena')!;
    expect(s.line).toBe('Suggested: CHECK BY EYE — name differs from “Lena”'); expect(s.preselect).toBeNull(); expect(s.tone).toBe('a');
    expect(s.items[1].text).toBe('Not Thai: passport from Norway (NOR)');
  });
  it('Thai-script card name + no face to compare', () => {
    const s = travellerSuggestion(chk({ name_result: 'thai_script', face_result: 'no_reference', face_ref: 'none', face_sim: null, suggestion: 'check' }), 'มิ้นท์')!;
    expect(s.line).toContain('Suggested: CHECK BY EYE — no face-check selfie or card photo to compare · card name “มิ้นท์” is in Thai letters');
  });
  it('still running / errored', () => {
    expect(travellerSuggestion(chk({ state: 'running', suggestion: null }), 'A')!.line).toContain('checking');
    expect(travellerSuggestion(chk({ state: 'error', suggestion: null }), 'A')!.line).toBe('Suggested: CHECK BY EYE — the automatic check could not run');
    expect(travellerSuggestion(null, 'A')).toBeNull();
  });
  it('country names', () => { expect(countryName('DEU')).toBe('Germany'); expect(countryName('USA')).toBe('United States'); expect(countryName('UTO')).toContain('specimen'); expect(countryName('ZZZ')).toBe('ZZZ'); });
});
