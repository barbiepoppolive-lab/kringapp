import { describe, expect, it } from 'vitest';
import { coveredByKeyboard } from './keyboardFocus';
describe('P · keyboard never covers the box being typed in', () => {
  it('a box at the bottom of an 844 px screen is covered when the keyboard leaves 500 px', () => {
    expect(coveredByKeyboard({ top: 760, bottom: 800 }, 0, 500)).toBe(true);
    expect(coveredByKeyboard({ top: 300, bottom: 340 }, 0, 500)).toBe(false);
  });
});
