import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { KringAppV8 } from './KringAppV8';
import { validateFirstHelloMessage, formatTravellerCurrency } from './v8Data';
import { translateThaiLineToEnglish } from './v8I18n';

describe('Kring 6 Nov 2026 Locked Build (v8)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();   // 17 Nov: the tab is remembered across a refresh; each test is a fresh visit
    window.history.replaceState({}, '', '/app/');
    // Demo Reels (v2) play only while on screen; jsdom has no IntersectionObserver.
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
    // No network in tests: every Supabase / weather call returns an empty result.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('defaults to production mode with zero fake people, zero fake deals, and zero open sheets', async () => {
    render(<KringAppV8 />);
    expect(document.querySelectorAll('.v8-sheet').length).toBe(0);
    expect(document.body.textContent).not.toContain('9:41');
    expect(document.body.textContent).not.toContain('Nana Coffee Roasters');
    expect(document.body.textContent).not.toContain('Thong Smith');
    expect(screen.getByText(/Jodd Fairs Ratchada/i)).toBeTruthy();
    expect(screen.getByText(/Be the first in Bangkok today/i)).toBeTruthy();   // audit P2-2: not "Ari" for All Bangkok

    fireEvent.click(screen.getByRole('button', { name: 'People' }));
    expect(document.body.textContent).not.toContain('Fah, 26');
    expect(document.body.textContent).not.toContain('Rohan, 29');
    expect(await screen.findByText(/People appear here as they join/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Deals' }));
    expect(document.body.textContent).not.toContain('Nana Coffee Roasters');
    expect(screen.getByText(/More deals coming soon/i)).toBeTruthy();   // 17 Nov: Deals = trip partners + coming soon
  });

  it('17 Nov: a browser refresh keeps the tab', () => {
    const first = render(<KringAppV8 />);
    fireEvent.click(screen.getByRole('button', { name: 'Deals' }));
    first.unmount();   // = refresh
    render(<KringAppV8 />);
    expect(document.querySelector('[data-tab="deals"]')?.getAttribute('aria-current')).toBe('page');
  });

  it('17 Nov: ?tab= beats the remembered tab and is removed from the address after use', () => {
    sessionStorage.setItem('kr8-tab', 'deals');
    window.history.replaceState({}, '', '/app/?tab=people&src=pwa');
    render(<KringAppV8 />);
    expect(document.querySelector('[data-tab="people"]')?.getAttribute('aria-current')).toBe('page');
    expect(window.location.search).toBe('?src=pwa');
  });

  it('renders 4-tab dock (Feed, People, Deals, Me) and shows chat bubble on Feed & People only (NOT on Deals)', () => {
    render(<KringAppV8 />);
    expect(screen.getByRole('button', { name: 'Feed' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'People' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deals' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Me' })).toBeTruthy();

    // Chat bubble present on Feed
    expect(screen.getByLabelText('Messages')).toBeTruthy();

    // Switch to People -> chat bubble still present
    fireEvent.click(screen.getByRole('button', { name: 'People' }));
    expect(screen.getByLabelText('Messages')).toBeTruthy();

    // Switch to Deals -> chat bubble MUST NOT be present
    fireEvent.click(screen.getByRole('button', { name: 'Deals' }));
    expect(screen.queryByLabelText('Messages')).toBeNull();
  });

  it('supports People filters (Speaks, Who, Online now) with live count and removable chips in demo mode', async () => {
    window.history.replaceState({}, '', '/app/?demo=1');
    render(<KringAppV8 initialTab="people" />);
    // Demo people come from a lazy chunk (never in the production bundle).
    await screen.findAllByText(/Mint/);
    fireEvent.click(screen.getByText('Filter'));
    expect(screen.getByText('Filter people')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Travellers' }));
    const applyBtn = document.getElementById('applyFilterBtn');
    expect(applyBtn?.textContent).toContain('Show 7 people');
    fireEvent.click(applyBtn!);

    // Removable chip appears
    expect(document.querySelector('#activeChips .achip')?.textContent).toContain('Travellers');
  });

  it('enforces one-message rule and blocks external links, phone numbers, and LINE IDs in first hello', () => {
    expect(validateFirstHelloMessage('Hi! Want to grab coffee in Ari?').valid).toBe(true);
    expect(validateFirstHelloMessage('Check https://example.com').valid).toBe(false);
    expect(validateFirstHelloMessage('Call me at +66 81 234 5678').valid).toBe(false);
    expect(validateFirstHelloMessage('Add my LINE ID: @bkk_test').valid).toBe(false);
  });

  it('auto-translates Thai chat lines with English directly underneath', () => {
    const tr = translateThaiLineToEnglish(
      'บ่ายสองว่างไหมคะ ร้านนี้อยู่ซอยอารีย์ 2 เดินจาก BTS 3 นาทีเอง'
    );
    expect(tr).toBe('Are you free at 2pm? It is on Ari Soi 2, 3 min walk from BTS.');
  });

  it.skip('shows Ready to use card on Me ONLY after a deal is claimed (café treats hidden 17 Nov, DEALS_TRIP_ONLY)', async () => {
    window.history.replaceState({}, '', '/app/?demo=1');
    localStorage.setItem('kr8_signed_in', '1');
    render(<KringAppV8 initialTab="me" />);
    await screen.findAllByText(/Rohan/);

    // Before claiming, Ready to use card is NOT present
    expect(document.getElementById('readyCard')).toBeNull();

    // Go to Deals and claim hero deal
    fireEvent.click(screen.getByRole('button', { name: 'Deals' }));
    await waitFor(() => expect(document.getElementById('heroClaim')).toBeTruthy());
    const heroClaim = document.getElementById('heroClaim')!;
    fireEvent.click(heroClaim);
    expect(heroClaim.textContent).toContain('Claimed · show at counter');

    // Go back to Me -> Ready to use card is now visible
    fireEvent.click(screen.getByRole('button', { name: 'Me' }));
    expect(document.getElementById('readyCard')).toBeTruthy();
  });

  it('formats traveller currency under Baht prices cleanly', () => {
    expect(formatTravellerCurrency(140, 'INR')).toBe('≈ ₹343');
  });

  // ---- 7 Nov: no fake data in production mode (no ?demo=1) ----

  it('Me tab: a signed-out guest sees no fake identity, only the guest Kring card (locked 6 Nov calm luxe)', async () => {
    // Even a stale fake sign-in left in storage by an older preview must not create an identity.
    localStorage.setItem('kr8_signed_in', '1');
    localStorage.setItem('kr8_user', JSON.stringify({ name: 'Bangkok Explorer', tripDay: 1, tripTotalDays: 5 }));
    render(<KringAppV8 initialTab="me" />);
    const text = () => document.body.textContent || '';
    expect(text()).not.toContain('Bangkok Explorer');
    expect(text()).not.toMatch(/verified/i);
    expect(text()).not.toMatch(/Anchan Member/i);
    expect(text()).not.toMatch(/Level 1/i);
    expect(text()).not.toMatch(/Day 1 of 5/);
    expect(text()).not.toMatch(/Day \d+ of \d+/);
    expect(document.querySelector('#s-me img')).toBeNull();
    expect(screen.getByText(/YOUR KRING CARD/i)).toBeTruthy();
    expect(screen.getByText(/Sign in to say hi, claim treats and post/i)).toBeTruthy();

    const cta = screen.getByRole('button', { name: /Join the community now/i });
    fireEvent.click(cta);
    expect(document.getElementById('sh-signin')).toBeTruthy();
  });

  it('sign-in sheet never fakes success in production; it shows the honest 1 Dec waitlist', () => {
    render(<KringAppV8 initialTab="me" />);
    fireEvent.click(screen.getByRole('button', { name: /Join the community now/i }));
    expect(document.getElementById('sh-signin')).toBeTruthy();
    expect(screen.getByText(/Sign-in opens on 1 Dec · join the waitlist/i)).toBeTruthy();
    fireEvent.click(document.getElementById('waitlistJoinBtn')!);
    expect(document.getElementById('signinNotice')?.textContent).toBe('Enter a valid email first');
    expect(localStorage.getItem('kr8_signed_in')).toBeNull();
    // Still a guest after closing the sheet
    fireEvent.click(document.getElementById('backdrop')!);
    expect(screen.getByText(/YOUR KRING CARD/i)).toBeTruthy();
  });

  it('"Post a photo" composer opens empty with an "Add photo" picker (no stock photo)', () => {
    render(<KringAppV8 />);
    fireEvent.click(screen.getByLabelText('Create post'));
    fireEvent.click(screen.getByText('Post a photo or story'));
    const preview = document.getElementById('postPreview') as HTMLElement;
    expect(preview).toBeTruthy();
    expect(['', 'none']).toContain(preview.style.backgroundImage);
    expect(preview.innerHTML).not.toContain('data:image/jpeg');
    expect(document.getElementById('addPhotoPicker')?.textContent).toContain('Add photo');
    expect(screen.getByLabelText('Add photo')).toBeTruthy();
    expect((document.getElementById('shareNowBtn') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelectorAll('#sh-post img').length).toBe(0);
  });

  it('no "new since you left" banner on an empty feed, even after a refresh tap', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<KringAppV8 />);
    expect(document.body.textContent).not.toMatch(/new since you left/i);
    fireEvent.click(screen.getByRole('button', { name: 'Feed' })); // second tap on Feed = refresh
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(document.getElementById('newpill')).toBeNull();
    expect(document.body.textContent).not.toMatch(/new since you left/i);
    expect(document.body.textContent).not.toMatch(/6 new/);
  });

  it('shows the banner only with the real number of new rows', async () => {
    let feedCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('kr6_activities')) {
          feedCalls += 1;
          const rows =
            feedCalls === 1
              ? [{ id: 'a1', title: 'First real post' }]
              : [
                  { id: 'a3', title: 'Third real post' },
                  { id: 'a2', title: 'Second real post' },
                  { id: 'a1', title: 'First real post' },
                ];
          return new Response(JSON.stringify(rows), { status: 200 });
        }
        return new Response('[]', { status: 200 });
      })
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<KringAppV8 />);
    await screen.findByText('First real post');
    expect(document.getElementById('newpill')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Feed' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(document.getElementById('newpill')?.textContent).toContain('2 new since you left');
  });

  it('production mode renders no prototype people, venues, prices or stock photos on any tab', async () => {
    render(<KringAppV8 />);
    const banned = [
      'Fah', 'Rohan', 'Ton,', 'Nam,', 'Pim', 'Nana', 'Porcupine', 'Thong Smith', 'Peace Oriental',
      'Warehouse 30', 'Mumbai', 'Bangkok Explorer', '฿140', 'claimed today', 'KR-4821', '6 new',
    ];
    for (const tabName of ['Feed', 'People', 'Deals', 'Me']) {
      fireEvent.click(screen.getByRole('button', { name: tabName }));
      await act(async () => {});
      const text = document.body.textContent || '';
      for (const b of banned) expect(text, `${tabName} shows "${b}"`).not.toContain(b);
      expect(document.body.innerHTML).not.toContain('data:image/jpeg');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Me' }));
    fireEvent.click(screen.getByText(/Rewards and passport/i));
    expect(document.body.textContent).not.toMatch(/Nana|Thong Smith|coffee treat/);
  });

  it('public event filler slides expose "Who’s going? กริ๊ง!" buttons and #sh-choose uses real buttons', () => {
    render(<KringAppV8 />);
    const evButtons = document.querySelectorAll('button.v9-ev-btn');
    expect(evButtons.length).toBeGreaterThanOrEqual(3);
    expect(evButtons[0].textContent).toContain('Who’s going? กริ๊ง!');
    fireEvent.click(evButtons[0]);
    // 9 Nov test fix: a guest must sign in before posting "I’m going" (locked rule A3)
    expect(document.getElementById('sh-post')).toBeFalsy();
    expect(document.getElementById('sh-signin')).toBeTruthy();
    fireEvent.click(document.querySelector('#sh-signin .xbtn') as HTMLElement);
    fireEvent.click(screen.getByLabelText('Create post'));
    expect(document.querySelectorAll('#sh-choose button.choice').length).toBe(1);   // 15 Nov: "Ask BKK" removed
  });

  it('Deals placeholder shows no percentages or quiet-hours wording (9 Nov rule check)', () => {
    render(<KringAppV8 />);
    expect(document.body.textContent).not.toMatch(/\d+%|Quiet-hours/i);
  });
});
