/** B (15 Nov, member #16): "กูกินจุ" / "Gukinju" found nothing and there was no way to add it. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { cleanPlaceName, isMapsLink, parseMapsCoords } from './kxLogic';

const m = vi.hoisted(() => ({ kxSearchPlaces: vi.fn(), kxPhoton: vi.fn(), kxMemberAddPlace: vi.fn() }));
vi.mock('./v5Kx', async (orig) => ({ ...(await orig<typeof import('./v5Kx')>()), ...m }));
vi.mock('./v5Reel', () => ({ signReelPaths: vi.fn().mockResolvedValue({}) }));
import { PlaceSearchPage } from './V5KxPlaces';
import { KX_L } from './v5Strings';

afterEach(() => cleanup());
const L = (en: string) => KX_L.th[en] || en;
const Lf = (en: string, a: string) => L(en).replace('{0}', a);

describe('maps link + name helpers', () => {
  it('reads coordinates from full Google Maps links, Bangkok only', () => {
    expect(parseMapsCoords('https://www.google.com/maps/place/X/@13.7801,100.5432,17z')).toEqual({ lat: 13.7801, lng: 100.5432 });
    expect(parseMapsCoords('https://www.google.com/maps/place/X/data=!3d13.75!4d100.51')).toEqual({ lat: 13.75, lng: 100.51 });
    expect(parseMapsCoords('https://maps.google.com/?q=13.74,100.52')).toEqual({ lat: 13.74, lng: 100.52 });
    expect(parseMapsCoords('https://maps.app.goo.gl/abc')).toBeNull();
    expect(parseMapsCoords('https://www.google.com/maps/@48.85,2.35,12z')).toBeNull();
  });
  it('maps link check and name clean-up', () => {
    expect(isMapsLink('https://maps.app.goo.gl/abc')).toBe(true);
    expect(isMapsLink('https://evil.example/maps')).toBe(false);
    expect(cleanPlaceName('  กูกิน   จุ ')).toBe('กูกิน จุ');
  });
});

describe('Add place page', () => {
  it('nothing found → "＋ เพิ่ม ‘กูกินจุ’ เป็นสถานที่ใหม่" → pending place is picked for the Reel', async () => {
    m.kxSearchPlaces.mockResolvedValue([]);
    m.kxPhoton.mockResolvedValue([]);
    m.kxMemberAddPlace.mockResolvedValue({ id: '0f0f0f0f-0000-4000-8000-000000000001', name_en: 'กูกินจุ', name_th: 'กูกินจุ', area: 'Ari', kr_area: 'Ari', lat: 13.78, lng: 100.54, photo_url: null, status: 'pending' });
    const done = vi.fn(), toast = vi.fn();
    render(<PlaceSearchPage L={L} Lf={Lf} lang="th" picked={[]} onDone={done} onBack={() => undefined} toast={toast} />);
    fireEvent.change(document.getElementById('kxPlaceQ')!, { target: { value: 'กูกินจุ' } });
    const add = await screen.findByText('เพิ่ม ‘กูกินจุ’ เป็นสถานที่ใหม่');
    expect(screen.getByText('Add as new place')).toBeTruthy();
    expect(screen.getByText('ยังไม่มีสถานที่ชื่อนี้')).toBeTruthy();
    fireEvent.click(add);
    fireEvent.click(document.querySelector('[data-area="Ari"]')!);
    fireEvent.change(document.getElementById('kxNewLink')!, { target: { value: 'https://www.google.com/maps/place/x/@13.7801,100.5432,17z' } });
    fireEvent.click(document.getElementById('kxNewSave')!);
    await waitFor(() => expect(m.kxMemberAddPlace).toHaveBeenCalledWith('กูกินจุ', 'Ari', 'https://www.google.com/maps/place/x/@13.7801,100.5432,17z', { lat: 13.7801, lng: 100.5432 }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    fireEvent.click(document.getElementById('kxPlaceDone')!);
    expect(done.mock.calls[0][0][0]).toMatchObject({ name_th: 'กูกินจุ', kr_area: 'Ari' });
  });
  it('no add row when the place is already found', async () => {
    m.kxSearchPlaces.mockResolvedValue([{ id: 'a', name_en: 'Gukinju', name_th: 'กูกินจุ', area: 'Ari', photo_url: null }]);
    m.kxPhoton.mockResolvedValue([]);
    render(<PlaceSearchPage L={L} Lf={Lf} lang="en" picked={[]} onDone={() => undefined} onBack={() => undefined} toast={() => undefined} />);
    fireEvent.change(document.getElementById('kxPlaceQ')!, { target: { value: 'gukinju' } });
    await screen.findByText('Gukinju');
    expect(document.getElementById('kxAddNew')).toBeNull();
  });
});
