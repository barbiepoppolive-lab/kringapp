import { describe, expect, it } from 'vitest';
import { NOT_YET_CHIPS, NOT_YET_GROUPS, NOT_YET_MAX, NOT_YET_RULE_BREAKS, chipsFromReasons, notYetEnglish, notYetNote } from './notYet';
import { REEL_CHIPS } from './adminApp';
import { isNotYetNote, reviewNoteText } from '../v8/kxLogic';

describe('Not yet chips', () => {
  it('has 4 headings incl. rule breaks, 17 tips, unique ids', () => {
    expect(NOT_YET_GROUPS.map((g) => g.title)).toEqual(['How it looks', 'What’s in it', 'Will people watch']);
    expect(NOT_YET_CHIPS).toHaveLength(17);
    expect(new Set(NOT_YET_CHIPS.map((c) => c.id)).size).toBe(17);
    expect(NOT_YET_MAX).toBe(3);
  });
  it('every Thai message ends with ครับ and is on one line', () => {
    for (const c of NOT_YET_CHIPS) {
      expect(c.th.trim().endsWith('ครับ'), c.id).toBe(true);
      expect(c.th).not.toMatch(/\n/); expect(c.en).not.toMatch(/\n/);
    }
  });
  it('every rule-break chip opens a real Hide reason', () => {
    for (const l of NOT_YET_RULE_BREAKS) expect(REEL_CHIPS.some((c) => c[0] === l), l).toBe(true);
    for (const c of REEL_CHIPS) expect((c[2] + '\n' + c[1]).length).toBeLessThanOrEqual(200);
  });
  it('preselects from the Autopilot reasons', () => {
    expect(chipsFromReasons(['too dark', 'blurry']).tips).toEqual(['dark', 'blurry']);
    expect(chipsFromReasons(['no person in it', 'no place shown', 'filmed at home', 'very short']).tips).toEqual(['noperson', 'noplace', 'home']);
    expect(chipsFromReasons(['black bars']).tips).toEqual(['sideways']);
    expect(chipsFromReasons(['looks copied (@someone)'])).toEqual({ tips: [], ruleBreak: 'Not their own clip' });
    expect(chipsFromReasons(['screen recording']).ruleBreak).toBe('Not their own clip');
    expect(chipsFromReasons(null)).toEqual({ tips: [], ruleBreak: null });
  });
  it('builds a Thai + English note, keeping an edited English on one line', () => {
    const n = notYetNote(['dark', 'noperson']);
    const [th, en] = n.split('\n');
    expect(th).toContain('มืด'); expect(en).toBe(notYetEnglish(['dark', 'noperson']));
    expect(notYetNote(['dark'], 'Hi\nthere').split('\n')).toEqual([NOT_YET_CHIPS[0].th, 'Hi there']);
    expect(notYetNote(['dark']).length * 2 + 200).toBeLessThan(1900);
  });
});

describe('member side', () => {
  const note = '⏳ รีลของคุณดีแล้วนะครับ\n⏳ Your Reel looks great.';
  it('spots a Not yet note and shows one language without the ⏳', () => {
    expect(isNotYetNote(note)).toBe(true);
    expect(isNotYetNote('รีลนี้\nThis Reel')).toBe(false);
    expect(reviewNoteText(note, 'th')).toBe('รีลของคุณดีแล้วนะครับ');
    expect(reviewNoteText(note, 'en')).toBe('Your Reel looks great.');
    expect(reviewNoteText('plain', 'en')).toBe('plain');
  });
});
