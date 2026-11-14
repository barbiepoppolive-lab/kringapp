import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FirstReelChip, ReelNudgeSheet, markReelNudgeSeen, setReelNudgeLater, shouldShowReelNudge, showFirstReelChip } from './V5ReelNudge';

describe('first-Reel nudge after the card is saved', () => {
  beforeEach(() => localStorage.clear());

  it('shows once per member, never to a member who already has a Reel', () => {
    expect(shouldShowReelNudge('u1', false)).toBe(true);
    markReelNudgeSeen('u1');
    expect(shouldShowReelNudge('u1', false)).toBe(false);
    expect(shouldShowReelNudge('u2', false)).toBe(true);   // per member
    expect(shouldShowReelNudge('u3', true)).toBe(false);
    expect(shouldShowReelNudge('', false)).toBe(false);
  });

  it('Later turns on the Me-tab chip until the member posts', () => {
    expect(showFirstReelChip('u1', false)).toBe(false);
    setReelNudgeLater('u1', true);
    expect(showFirstReelChip('u1', false)).toBe(true);
    expect(showFirstReelChip('u1', true)).toBe(false);     // posted: chip gone for good
    expect(showFirstReelChip('u1', false)).toBe(false);
  });

  it('has Post / Later / Rules, merit wording only, and calls back', () => {
    const onPost = vi.fn(); const onLater = vi.fn();
    render(<ReelNudgeSheet poster="/p.jpg" onPost={onPost} onLater={onLater} />);
    const txt = document.body.textContent || '';
    expect(txt).toContain('โพสต์รีลแรกไว้ก่อนเลย');
    expect(txt).toContain('฿4,000');
    expect(txt).not.toMatch(/lucky|draw|chance|ลุ้น|จับรางวัล|โชค/i);
    expect(screen.getByText('กติกา · Rules').getAttribute('href')).toBe('/rules/');
    fireEvent.click(screen.getByText('โพสต์รีล · Post a Reel')); expect(onPost).toHaveBeenCalled();
    fireEvent.click(screen.getByText('ไว้ทีหลัง · Later')); expect(onLater).toHaveBeenCalled();
  });

  it('chip opens the post flow', () => {
    const onPost = vi.fn();
    render(<FirstReelChip onPost={onPost} />);
    fireEvent.click(screen.getByRole('button')); expect(onPost).toHaveBeenCalled();
  });
});
