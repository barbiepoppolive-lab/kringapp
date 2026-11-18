// 0079 (17 Nov): Terms update + "Kring may feature my posts in promotion" consent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { V5_L } from './v5Strings';

const kxMock = vi.hoisted(() => ({ kxSetGender: vi.fn(), kxSetTiktok: vi.fn() }));
const liveMock = vi.hoisted(() => ({ v5SaveCard: vi.fn(), v5AcceptTerms: vi.fn(), v5SetIgHandle: vi.fn(), v5CompressImage: vi.fn(async () => 'data:image/jpeg;base64,xx') }));
vi.mock('./v5Face', async (orig) => ({ ...(await orig<typeof import('./v5Face')>()), checkProfilePhoto: vi.fn(async () => 'ok') }));
vi.mock('./v5Kx', async (orig) => ({ ...(await orig<typeof import('./v5Kx')>()), ...kxMock }));
vi.mock('./v5Live', async (orig) => ({ ...(await orig<typeof import('./v5Live')>()), ...liveMock }));
import { V5MintSheet } from './V5KxCard';
import { V5_TERMS_VERSION, type V5Card } from './v5Live';

const L = (en: string) => en;
const Lf = (en: string, a: string, b = '') => en.replace('{0}', a).replace('{1}', b);
const card = (extra: Partial<V5Card> = {}): V5Card => ({ first_name: 'TEST-Mali', photo: 'data:image/jpeg;base64,xx', langs: ['EN'], bio: '', area: 'Bangkok', who: 'local', here_until: null, verified: false,
  terms_version: 'member-2026-11-10', terms_accepted_at: '2026-11-10', ...extra });
beforeEach(() => {
  for (const k of [...Object.values(kxMock), ...Object.values(liveMock)]) k.mockReset();
  liveMock.v5SaveCard.mockImplementation(async (c: { first_name: string }) => ({ card: card({ first_name: c.first_name }), hellos_today: 0, posts: 0, answers_today: 0, blocked: [] }));
  liveMock.v5AcceptTerms.mockResolvedValue('2026-11-17T00:00:00Z'); liveMock.v5CompressImage.mockResolvedValue('data:image/jpeg;base64,xx'); liveMock.v5SetIgHandle.mockResolvedValue(null);
});
afterEach(() => cleanup());

const sheet = (c: V5Card | null) => render(<V5MintSheet L={L} Lf={Lf} card={c as never} uiLang="en" onSaved={vi.fn()} onClose={() => undefined} toast={() => undefined} onAfter={() => undefined} />);
const fillNew = async () => {
  fireEvent.change(document.querySelector('#kxAddPhoto input')!, { target: { files: [new File(['x'], 'me.jpg', { type: 'image/jpeg' })] } });
  await vi.waitFor(() => { expect(document.getElementById('kxAddPhoto')).toBeNull(); expect(document.getElementById('kxPhotoNeed')).toBeNull(); expect((document.getElementById('v5SaveCard') as HTMLButtonElement).disabled).toBe(false); }, { timeout: 4000 });
  fireEvent.change(document.getElementById('v5Name')!, { target: { value: 'TEST-Mali' } });
};

describe('0079 new card: explicit agree checkbox', () => {
  it('version is the 17 Nov terms', () => expect(V5_TERMS_VERSION).toBe('member-2026-11-17'));
  it('one checkbox (makecard-1: 18+ and Terms together) starts unticked, names promotion, and links Terms + Privacy Policy', async () => {
    sheet(null);
    const box = document.getElementById('v5TermsOk') as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(document.getElementById('v5Age')).toBeNull();
    const line = document.getElementById('v5CardTerms')!;
    expect(line.textContent).toBe('I’m 18+ and agree to the Terms and Privacy Policy (Kring may feature my posts).');
    expect([...line.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/terms.html', '/privacy.html']);
  });
  it('cannot mint without agreeing; nothing is saved', async () => {
    sheet(null); await fillNew();
    fireEvent.click(document.getElementById('v5SaveCard')!);
    await vi.waitFor(() => expect(document.getElementById('v5CardNotice')!.textContent).toBe('Please confirm you’re 18+ and agree to the Terms.'));
    expect(liveMock.v5SaveCard).not.toHaveBeenCalled();
    expect(liveMock.v5AcceptTerms).not.toHaveBeenCalled();
  });
  it('ticking it records the agreement as "signup"', async () => {
    sheet(null); await fillNew();
    fireEvent.click(document.getElementById('v5TermsOk')!);
    fireEvent.click(document.getElementById('v5SaveCard')!);
    await vi.waitFor(() => expect(liveMock.v5AcceptTerms).toHaveBeenCalledWith('signup'));
    // the one tick still sends the 18+ confirmation the server requires (kr8_save_card p_age_ok)
    expect(liveMock.v5SaveCard).toHaveBeenCalledWith(expect.objectContaining({ age_ok: true }));
  });
  it('makecard-1: a new card shows no photo box, no Instagram/TikTok rows and no "I am" row until "More about you"', async () => {
    sheet(null);
    expect(document.getElementById('kxPhotoNeed')).toBeNull();
    expect(document.getElementById('kxPhotoGallery')).toBeNull();
    expect(document.getElementById('kxPhotoCamera')).toBeTruthy();
    expect(document.getElementById('kxIgRow')).toBeNull();
    expect(document.getElementById('kxTtRow')).toBeNull();
    expect(document.getElementById('kxGender')).toBeNull();
    fireEvent.click(document.getElementById('v5More')!);
    expect(document.getElementById('kxGender')).toBeTruthy();
  });
  it('makecard-1: editing an existing card keeps every row', async () => {
    sheet(card());
    expect(document.getElementById('kxIgRow')).toBeTruthy();
    expect(document.getElementById('kxTtRow')).toBeTruthy();
    expect(document.getElementById('kxGender')).toBeTruthy();
  });
  it('editing an existing card never counts as agreeing (that happens in the update dialog)', async () => {
    sheet(card());
    expect(document.getElementById('v5TermsOk')).toBeNull();
    fireEvent.click(document.getElementById('v5SaveCard')!);
    await vi.waitFor(() => expect(liveMock.v5SaveCard).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(liveMock.v5AcceptTerms).not.toHaveBeenCalled();
  });
});

describe('0079 app wiring', () => {
  const app = fs.readFileSync(path.join(__dirname, 'KringAppV8.tsx'), 'utf8');
  it('update dialog: Agree records "update"; Not now snoozes, never locks out', () => {
    expect(app).toContain('id="termsDlg"');
    expect(app).toContain("onClick={() => void agreeTerms('update')}");
    expect(app).toMatch(/id="termsLater"[^\n]*onClick=\{termsLater\}/);
    expect(app).toContain('3 * 86400_000');
  });
  it('Settings switch: off-and-not-agreed opens the dialog instead of switching on quietly', () => {
    expect(app).toContain('id="setPromo"');
    expect(app).toContain("if (promo?.on !== true && !termsAgreed) { setSheet(null); setTermsDlg(true); return; }");
  });
  it('the new member-facing words avoid the banned list', () => {
    const keys = Object.keys(V5_L.th).filter((k) => /promot|Terms|Privacy Policy|feature|surname|take down|all set|^Agree$/.test(k));
    expect(keys.length).toBeGreaterThanOrEqual(12);
    const all = [...keys, ...keys.flatMap((k) => ['th', 'zh', 'hi', 'ja', 'ko'].map((l) => V5_L[l][k]))].join(' \n ').toLowerCase();
    for (const w of ['meet', 'guide', 'tour', 'host', 'creator', 'review', 'hidden gem', 'alcohol', 'gift', 'wallet', 'credit', 'lucky', 'draw', 'temple', 'ลุ้น', 'เจอ', 'นัด']) expect(all.includes(w), w).toBe(false);
  });
});
