import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { KringAppV8 } from './KringAppV8';

// QA-50 (12 Nov): Escape closes the open sheet; ?lang= opens the app in that language and is remembered.
describe('QA-50 fixes', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/app/');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('Escape closes an open sheet', async () => {
    render(<KringAppV8 />);
    fireEvent.click(screen.getByRole('button', { name: 'Me' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]);
    expect(document.querySelectorAll('.v8-sheet').length).toBeGreaterThan(0);
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(document.querySelectorAll('.v8-sheet').length).toBe(0);
  });

  it('?lang=th wins over a saved English choice and is saved', () => {
    localStorage.setItem('kr8_lang', 'en');
    window.history.replaceState({}, '', '/app/?lang=th');
    render(<KringAppV8 />);
    expect(screen.getByRole('button', { name: 'ผู้คน' })).toBeTruthy();
    expect(localStorage.getItem('kr8_lang')).toBe('th');
    expect(document.documentElement.lang).toBe('th');
  });

  it('an unknown ?lang= is ignored', () => {
    localStorage.setItem('kr8_lang', 'en');
    window.history.replaceState({}, '', '/app/?lang=xx');
    render(<KringAppV8 />);
    expect(screen.getByRole('button', { name: 'People' })).toBeTruthy();
    expect(localStorage.getItem('kr8_lang')).toBe('en');
  });
});
