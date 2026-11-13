import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sheet, PushedPage, Tray, InlineExpand } from '../components/ui/Sheet';
import { haptic, canHaptic } from '../lib/haptics';
import tokens from '../design/tokens.json';

describe('UXP4-01 & UXP4-02: Motion Tokens, Haptics & Universal Sheet Primitive', () => {
  it('UXP4-01: defines all 4 durations, 3 curves, and the shared z-layer scale (KRING FIX1: page 70 < sheet 80 < island 90 < overlay 100) in tokens.json', () => {
    expect(tokens.motion).toEqual({
      press: '90ms',
      fast: '160ms',
      sheet: '220ms',
      page: '280ms',
      spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
      out: 'cubic-bezier(0.2, 0, 0, 1)',
      in: 'cubic-bezier(0.4, 0, 1, 1)',
    });
    expect(tokens.z).toEqual({
      tab: 10,
      sticky: 20,
      tray: 30,
      pushed: 40,
      dock: 50,
      page: 70,
      sheet: 80,
      island: 90,
      overlay: 100,
      toast: 110,
    });
    // Wei 5 — every sheet must sit above any full-screen page.
    expect(tokens.z.sheet).toBeGreaterThan(tokens.z.page);
  });

  it('UXP4-01: haptic helper supports all named patterns safely in jsdom', () => {
    expect(typeof canHaptic()).toBe('boolean');
    expect(() => {
      haptic('tap');
      haptic('select');
      haptic('sheet');
      haptic('clink');
      haptic('success');
      haptic('warning');
      haptic('error');
      haptic('combo');
      haptic('jackpot');
    }).not.toThrow();
  });

  it('UXP4-02: Sheet opens at 60% detent, toggles to 92% on grabber tap, and closes on Escape / backdrop / drag > 96px', () => {
    const onClose = vi.fn();
    render(
      <Sheet
        open={true}
        onClose={onClose}
        title="Treat Envelope"
        subtitle="100% refundable if plans change"
        footer={<button type="button">Primary Gold Action</button>}
        testId="test-sheet"
      >
        <div>Sheet body content</div>
      </Sheet>
    );

    const sheet = screen.getByTestId('test-sheet');
    expect(sheet).toHaveAttribute('data-detent', '60%');
    expect(screen.getByText('Treat Envelope')).toBeInTheDocument();
    expect(screen.getByText('Primary Gold Action')).toBeInTheDocument();

    // Toggle detent via grabber
    fireEvent.click(screen.getByTestId('test-sheet-grabber'));
    expect(sheet).toHaveAttribute('data-detent', '92%');

    // Drag down > 96px to dismiss (from 60% detent)
    fireEvent.click(screen.getByTestId('test-sheet-grabber'));
    expect(sheet).toHaveAttribute('data-detent', '60%');

    const dragHandle = screen.getByTestId('test-sheet-drag-handle');
    fireEvent.mouseDown(dragHandle, { clientY: 100 });
    fireEvent.mouseMove(dragHandle, { clientY: 220 });
    fireEvent.mouseUp(dragHandle, { clientY: 220 });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Escape key closes sheet
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    // Backdrop click closes sheet
    fireEvent.click(screen.getByTestId('test-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('UXP4-02: PushedPage, Tray, and InlineExpand render and handle close/back cleanly', () => {
    const onBack = vi.fn();
    render(
      <div>
        <PushedPage open={true} onBack={onBack} title="Verify Gate" testId="test-pushed">
          <p>Pushed content</p>
        </PushedPage>
        <Tray open={true} testId="test-tray">
          <p>Tray content</p>
        </Tray>
        <InlineExpand open={true} testId="test-expand">
          <p>Expanded content</p>
        </InlineExpand>
      </div>
    );

    expect(screen.getByTestId('test-pushed')).toBeInTheDocument();
    expect(screen.getByTestId('test-tray')).toBeInTheDocument();
    expect(screen.getByTestId('test-expand')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('test-pushed-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
