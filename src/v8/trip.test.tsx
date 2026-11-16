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
  it('Thai screen: Thai value line with the English under it; one-language screens show one line', () => {
    const { container, unmount } = render(<TripPerks L={TH} />);
    expect(screen.getByText('สำหรับทริปของคุณ')).toBeTruthy();
    expect(screen.getByText('For your trip')).toBeTruthy();
    expect(screen.getByText('ออนไลน์ได้ทันทีที่เครื่องลง')).toBeTruthy();
    expect(screen.getByText('Online the moment you land')).toBeTruthy();
    expect(container.querySelectorAll('.ktrip-sub small').length).toBe(4);
    unmount();
    const en = render(<TripPerks L={(s) => s} />);
    expect(en.container.querySelectorAll('.ktrip-sub small').length).toBe(0);
  });
  it('commission line stays visible; photo credit sits behind the info button', () => {
    render(<TripPerks L={(s) => s} />);
    expect(document.getElementById('tripDisclosure')!.textContent).toContain('Kring may earn a small commission');
    expect(screen.queryByText(/Wikimedia/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Trusted travel partners' }));
    expect(screen.getByText(/Photos: Wikimedia Commons/)).toBeTruthy();
  });
});
