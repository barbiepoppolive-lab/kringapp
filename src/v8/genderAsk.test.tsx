import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
vi.mock('./v5Kx', () => ({ kxSetGender: vi.fn(async (g: string, s: boolean) => ({ gender: g, show_gender: s })) }));
import { kxSetGender } from './v5Kx';
import { GenderAskSheet } from './V5GenderAsk';

describe('r16b: ask "I am" on open when the card has none', () => {
  it('no Prefer not to say, no Later; save needs a pick; then saves with show off', async () => {
    const onSaved = vi.fn();
    render(<GenderAskSheet L={(s) => s} toast={() => {}} onSaved={onSaved} />);
    expect(document.querySelector('[data-gender="none"]')).toBeNull();
    expect(document.querySelector('.kpo-later')).toBeNull();
    fireEvent.click(document.getElementById('genderAskSave')!);
    expect(kxSetGender).not.toHaveBeenCalled();
    expect(document.getElementById('kxGenderNote')!.className).toContain('kx-gmiss');
    fireEvent.click(document.querySelector('[data-gender="female"]')!);
    fireEvent.click(document.getElementById('genderAskSave')!);
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith('female', false));
    expect(kxSetGender).toHaveBeenCalledWith('female', false);
  });
});
