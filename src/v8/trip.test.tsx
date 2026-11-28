import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TripPerks, TRIP_PARTNERS } from './V5Trip';
import { V5_L, KX_L } from './v5Strings';

const TH = (s: string) => V5_L.th[s] || KX_L.th[s] || s;

describe('Deals → For your trip (17 Nov polish)', () => {
  it('keeps the exact affiliate links and tracking', () => {
    const { container } = render(<TripPerks L={(s) => s} />);
    const want: Record<string, string> = {
      airalo: 'https://airalo.tpk.mx/nlhtRbJg', welcomepickups: 'https://tpk.mx/BnsZgC2u',
      klook: 'https://klook.tpk.mx/w8u5zsYQ', radicalstorage: 'https://radicalstorage.tpk.mx/RsPrWtrl',
    };
    expect(TRIP_PARTNERS.map((p) => p.id)).toEqual(Object.keys(want));
    for (const [id, url] of Object.entries(want)) {
      const a = container.querySelector(`a[data-partner="${id}"]`)!;
      expect(a.getAttribute('href')).toBe(url);
      expect(a.getAttribute('rel')).toBe('noopener noreferrer sponsored');
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.querySelector('.ktrip-badge svg path, .ktrip-badge svg rect')).toBeTruthy();
    }
  });
  it('T-301 round 2: Thai screen shows Thai only (no English stacked under it); English screen shows English only', () => {
    const { container, unmount } = render(<TripPerks L={TH} />);
    expect(screen.getByText('สำหรับทริปของคุณ')).toBeTruthy();
    expect(screen.queryByText('For your trip')).toBeNull();
    expect(screen.getByText('ออนไลน์ได้ทันทีที่เครื่องลง')).toBeTruthy();
    expect(screen.queryByText('Online the moment you land')).toBeNull();
    expect(container.querySelectorAll('.ktrip-sub small').length).toBe(0);
    unmount();
    const en = render(<TripPerks L={(s) => s} />);
    expect(en.container.querySelectorAll('.ktrip-sub small').length).toBe(0);
  });
  it('commission line stays visible; info button shows the partner note; photos are our own', () => {
    const { container } = render(<TripPerks L={(s) => s} />);
    expect(document.getElementById('tripDisclosure')!.textContent).toContain('Kring may earn a small commission');
    fireEvent.click(screen.getByRole('button', { name: 'Trusted travel partners' }));
    expect(document.getElementById('tripInfo')!.textContent).toBe('Trusted travel partners');
    expect(screen.queryByText(/Wikimedia/)).toBeNull();
    for (const p of TRIP_PARTNERS) {
      const ph = container.querySelector(`a[data-partner="${p.id}"] .ktrip-photo`) as HTMLElement;
      expect(ph.style.backgroundImage).toContain(`media/trip/${p.id}.webp`);
    }
  });
});

describe('m250 TAGTHAi share & earn', () => {
  it('members see their own link (kringapp.com/pass/k<no>); guests see no share row', async () => {
    const { affLink } = await import('./V5Trip');
    expect(affLink(114)).toBe('https://kringapp.com/pass/k114');
    const guest = render(<TripPerks L={(s) => s} />);
    expect(guest.container.querySelector('#affShare')).toBeNull();
    guest.unmount();
    const m = render(<TripPerks L={TH} memberNo={114} />);
    expect(m.container.querySelector('#affShare')).not.toBeNull();
    expect(m.container.textContent).toContain('แชร์พาสนี้');
    fireEvent.click(m.container.querySelector('.kf-aff-row')!);
    expect(m.container.querySelector('#affLink')!.textContent).toBe('kringapp.com/pass/k114');
  });
});
