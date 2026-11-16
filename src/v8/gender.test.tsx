import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { KX_L } from './v5Strings';
import { GENDER_LABEL, GENDERS, GenderChip, GenderRow, genderPayload, isGender, shownGender, type Gender } from './V5Gender';

const kxMock = vi.hoisted(() => ({ kxSetGender: vi.fn(), kxSetTiktok: vi.fn() }));
const liveMock = vi.hoisted(() => ({ v5SaveCard: vi.fn(), v5AcceptTerms: vi.fn(), v5SetIgHandle: vi.fn(), v5CompressImage: vi.fn(async () => 'data:image/jpeg;base64,xx') }));
vi.mock('./v5Face', async (orig) => ({ ...(await orig<typeof import('./v5Face')>()), checkProfilePhoto: vi.fn(async () => 'ok') }));
vi.mock('./v5Kx', async (orig) => ({ ...(await orig<typeof import('./v5Kx')>()), ...kxMock }));
vi.mock('./v5Live', async (orig) => ({ ...(await orig<typeof import('./v5Live')>()), ...liveMock }));
import { NeonCard, V5MintSheet } from './V5KxCard';
import { V5_TERMS_VERSION, type V5Card } from './v5Live';

const L = (en: string) => en;
const Lf = (en: string, a: string, b = '') => en.replace('{0}', a).replace('{1}', b);
const TH = (en: string) => KX_L.th[en] || en;
const card = (extra: Partial<V5Card> = {}): V5Card => ({ first_name: 'TEST-Mali', photo: 'data:image/jpeg;base64,xx', langs: ['EN'], bio: '', area: 'Bangkok', who: 'local', here_until: null, verified: false,
  terms_version: V5_TERMS_VERSION, terms_accepted_at: '2026-11-15', ...extra });
beforeEach(() => {
  for (const k of [...Object.values(kxMock), ...Object.values(liveMock)]) k.mockReset();
  liveMock.v5SaveCard.mockImplementation(async (c: { first_name: string }) => ({ card: card({ first_name: c.first_name }), hellos_today: 0, posts: 0, answers_today: 0, blocked: [] }));
  kxMock.kxSetGender.mockImplementation(async (g: string | null, s: boolean) => ({ gender: g, show_gender: !!g && s }));
  liveMock.v5AcceptTerms.mockResolvedValue('2026-11-15T00:00:00Z'); liveMock.v5CompressImage.mockResolvedValue('data:image/jpeg;base64,xx'); liveMock.v5SetIgHandle.mockResolvedValue(null); kxMock.kxSetTiktok.mockResolvedValue(null);
});
afterEach(() => cleanup());

describe('optional gender: the row', () => {
  it('four chips in the founder\'s order; nothing is pre-selected except "Prefer not to say"; "show" is off', () => {
    render(<GenderRow L={L} value={null} show={false} onChange={() => undefined} />);
    expect([...document.querySelectorAll('#kxGender [data-gender]')].map((b) => b.textContent)).toEqual(['Male', 'Female', 'Kathoey', 'Prefer not to say']);
    expect([...document.querySelectorAll('#kxGender [aria-pressed="true"]')].map((b) => b.getAttribute('data-gender'))).toEqual(['none']);
    const sw = document.getElementById('kxGenderShow') as HTMLInputElement;
    expect(sw.checked).toBe(false);
    expect(sw.disabled).toBe(true);                       // nothing to show yet
    expect(document.getElementById('kxGenderNote')!.textContent).toBe('Optional. You choose whether it shows on your card.');
  });
  it('Thai labels: ชาย · หญิง · กะเทย · ไม่ระบุ, with the privacy line', () => {
    render(<GenderRow L={TH} value={null} show={false} onChange={() => undefined} />);
    expect([...document.querySelectorAll('#kxGender [data-gender]')].map((b) => b.textContent)).toEqual(['ชาย', 'หญิง', 'กะเทย', 'ไม่ระบุ']);
    expect(document.getElementById('kxGenderLab')!.textContent).toBe('ฉันเป็น');
    expect(document.getElementById('kxGenderNote')!.textContent).toBe('ไม่ใส่ก็ได้ คุณเลือกเองว่าจะโชว์บนการ์ดไหม');
    expect(document.querySelector('.kx-gshow span')!.textContent).toBe('โชว์บนการ์ดของฉัน');
  });
  it('picking a chip never switches "show" on by itself; the member does that', () => {
    const onChange = vi.fn();
    const { rerender } = render(<GenderRow L={L} value={null} show={false} onChange={onChange} />);
    for (const g of GENDERS) { fireEvent.click(document.querySelector(`[data-gender="${g}"]`)!); expect(onChange).toHaveBeenLastCalledWith(g, false); }
    rerender(<GenderRow L={L} value="kathoey" show={false} onChange={onChange} />);
    expect((document.getElementById('kxGenderShow') as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(document.getElementById('kxGenderShow')!);
    expect(onChange).toHaveBeenLastCalledWith('kathoey', true);
  });
  it('"Prefer not to say" (or tapping the chosen chip again) clears the value AND switches "show" off', () => {
    const onChange = vi.fn();
    render(<GenderRow L={L} value="female" show onChange={onChange} />);
    fireEvent.click(document.querySelector('[data-gender="none"]')!);
    expect(onChange).toHaveBeenLastCalledWith(null, false);
    fireEvent.click(document.querySelector('[data-gender="female"]')!);
    expect(onChange).toHaveBeenLastCalledWith(null, false);
    fireEvent.click(document.querySelector('[data-gender="male"]')!);
    expect(onChange).toHaveBeenLastCalledWith('male', true);          // switching between options keeps the member's own "show" choice
  });
});

describe('optional gender: what is sent and what is shown', () => {
  it('no value can never be "shown"; only the three values are accepted', () => {
    expect(genderPayload(null, true)).toEqual({ gender: null, show: false });
    expect(genderPayload('kathoey', true)).toEqual({ gender: 'kathoey', show: true });
    expect(genderPayload('male', false)).toEqual({ gender: 'male', show: false });
    expect(GENDERS).toEqual(['male', 'female', 'kathoey']);
    for (const bad of ['Male', 'other', '', null, undefined, 1, 'kathoey ']) expect(isGender(bad)).toBe(false);
  });
  it('the chip shows only when the member switched "show" on', () => {
    expect(shownGender({ gender: 'kathoey', show_gender: true })).toBe('kathoey');
    expect(shownGender({ gender: 'kathoey', show_gender: false })).toBeNull();
    expect(shownGender({ gender: 'kathoey' })).toBeNull();
    expect(shownGender({ gender: 'nonsense', show_gender: true })).toBeNull();
    expect(shownGender(null)).toBeNull();
  });
  it('chip on the card: one small chip with the label, nothing at all when there is no value', () => {
    const { rerender } = render(<NeonCard L={L} photo={null} name="TEST-Mali" level={1} no={16} ig={null} tt={null} size="me" gender="kathoey" />);
    expect([...document.querySelectorAll('[data-gender-chip]')].map((x) => x.textContent)).toEqual(['Kathoey']);
    rerender(<NeonCard L={L} photo={null} name="TEST-Mali" level={1} no={16} ig={null} tt={null} size="me" gender={null} />);
    expect(document.querySelector('[data-gender-chip]')).toBeNull();
    expect(document.querySelector('.kx-grow')).toBeNull();
    rerender(<GenderChip L={TH} gender="kathoey" />);
    expect(document.querySelector('[data-gender-chip]')!.textContent).toBe('กะเทย');
    rerender(<GenderChip L={L} gender="anything" />);
    expect(document.querySelector('[data-gender-chip]')).toBeNull();
  });
});

describe('optional gender: making and editing the card', () => {
  const sheet = (c: V5Card | null, onSaved = vi.fn()) => render(<V5MintSheet L={L} Lf={Lf} card={c as never} uiLang="en" onSaved={onSaved} onClose={() => undefined} toast={() => undefined} onAfter={() => undefined} />);
  const fillNew = async () => {   // 16 Nov: a new card needs a face photo first (picked through the big + on the card)
    fireEvent.change(document.querySelector('#kxAddPhoto input')!, { target: { files: [new File(['x'], 'me.jpg', { type: 'image/jpeg' })] } });
    await vi.waitFor(() => { expect(document.getElementById('kxAddPhoto')).toBeNull(); expect(document.getElementById('kxPhotoNeed')).toBeNull(); }, { timeout: 4000 });
    fireEvent.change(document.getElementById('v5Name')!, { target: { value: 'TEST-Mali' } }); fireEvent.click(document.getElementById('v5Age')!); };
  it('a new card can be made without touching the row: nothing is sent for gender', async () => {
    sheet(null); await fillNew();
    expect(document.getElementById('kxGender')).toBeTruthy();
    fireEvent.click(document.getElementById('v5SaveCard')!);
    await vi.waitFor(() => expect(liveMock.v5SaveCard).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(kxMock.kxSetGender).not.toHaveBeenCalled();
    expect(document.getElementById('v5CardNotice')).toBeNull();
  });
  it.each(GENDERS)('new card choosing %s: saved with "show" off unless switched on', async (g: Gender) => {
    sheet(null); await fillNew();
    fireEvent.click(document.querySelector(`[data-gender="${g}"]`)!);
    fireEvent.click(document.getElementById('v5SaveCard')!);
    await vi.waitFor(() => expect(kxMock.kxSetGender).toHaveBeenCalledWith(g, false));
  });
  it('new card with Kathoey and "Show on my card" on', async () => {
    sheet(null); await fillNew();
    fireEvent.click(document.querySelector('[data-gender="kathoey"]')!);
    fireEvent.click(document.getElementById('kxGenderShow')!);
    fireEvent.click(document.getElementById('v5SaveCard')!);
    await vi.waitFor(() => expect(kxMock.kxSetGender).toHaveBeenCalledWith('kathoey', true));
  });
  it('edit: the saved choice is shown; switching "show" off sends only that; clearing sends null', async () => {
    sheet(card({ gender: 'female', show_gender: true }));
    expect(document.querySelector('[data-gender="female"]')!.getAttribute('aria-pressed')).toBe('true');
    expect((document.getElementById('kxGenderShow') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(document.getElementById('kxGenderShow')!);
    fireEvent.click(document.getElementById('v5SaveCard')!);
    await vi.waitFor(() => expect(kxMock.kxSetGender).toHaveBeenCalledWith('female', false));
    cleanup(); kxMock.kxSetGender.mockClear();
    sheet(card({ gender: 'female', show_gender: true }));
    fireEvent.click(document.querySelector('[data-gender="none"]')!);
    fireEvent.click(document.getElementById('v5SaveCard')!);
    await vi.waitFor(() => expect(kxMock.kxSetGender).toHaveBeenCalledWith(null, false));
  });
  it('edit with no change: the gender call is not made', async () => {
    sheet(card({ gender: 'male', show_gender: false }));
    fireEvent.click(document.getElementById('v5SaveCard')!);
    await vi.waitFor(() => expect(liveMock.v5SaveCard).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(kxMock.kxSetGender).not.toHaveBeenCalled();
  });
  it('if saving the choice fails the card is still saved', async () => {
    kxMock.kxSetGender.mockRejectedValue(new Error('KR8_BAD_GENDER'));
    const onSaved = vi.fn(); const toast = vi.fn();
    render(<V5MintSheet L={L} Lf={Lf} card={card() as never} uiLang="en" onSaved={onSaved} onClose={() => undefined} toast={toast} onAfter={() => undefined} />);
    fireEvent.click(document.querySelector('[data-gender="male"]')!);
    fireEvent.click(document.getElementById('v5SaveCard')!);
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Card saved'));
  });
});

describe('optional gender: where it must NOT be', () => {
  const src = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  it('ranking, rewards, places and logic files never mention it', () => {
    for (const f of ['V5KxRanking.tsx', 'V5KxRewards.tsx', 'V5KxPlaces.tsx', 'kxLogic.ts', 'rewardsConfig.ts', 'goCoach.ts']) expect(/gender/i.test(src(f)), f).toBe(false);
  });
  it('the Reel player (feed overlay) and the People filter never show or use it', () => {
    const go = src('V5Go.tsx');
    const player = go.slice(go.indexOf('export function GoReelPlayer'), go.indexOf('// ───────────── grid'));
    expect(/gender/i.test(player)).toBe(false);
    expect(/filterGender|gender.*filter/i.test(src('KringAppV8.tsx'))).toBe(false);
  });
  it('strings: every label has Thai; no banned word; "wallet"-style words absent', () => {
    const keys = ['I am', 'Male', 'Female', 'Kathoey', 'Prefer not to say', 'Show on my card', 'Optional. You choose whether it shows on your card.'];
    for (const k of keys) expect(KX_L.th[k], k).toBeTruthy();
    const banned = ['rate', 'host', 'guide', 'tour', 'creator', 'gift', 'wallet', 'credit', 'coins', 'launch', 'lucky', 'draw', 'chance', 'reviews', 'stars', 'meet', 'dating'];
    for (const k of [...keys, ...Object.values(GENDER_LABEL)]) for (const w of banned) expect(new RegExp(`(^|[^a-z])${w}`, 'i').test(k), `${w} in ${k}`).toBe(false);
    for (const k of keys) for (const w of ['เดท', 'เจอ', 'พบ', 'นัด', 'ของขวัญ', 'โชค']) expect(KX_L.th[k].includes(w), `${w} in ${KX_L.th[k]}`).toBe(false);
  });
});
