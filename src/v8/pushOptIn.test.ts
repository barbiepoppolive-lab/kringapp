import { describe, expect, it } from 'vitest';
import { OPTIN_GAP_MS, optInDue, optInVariant } from './push';
import { optInTx } from './V5PushOptIn';
import { TASK_ORDER, TX } from './v5Tasks';

describe('r14 notification opt-in', () => {
  it('only offers when notifications are not on, not blocked and possible here', () => {
    expect(optInVariant('off')).toBe('ok');
    expect(optInVariant('ios-install')).toBe('ios-install');
    expect(optInVariant('inapp')).toBe('inapp');
    expect(optInVariant('on')).toBeNull();
    expect(optInVariant('denied')).toBeNull();
    expect(optInVariant('unsupported')).toBeNull();
  });
  it('at most once per 3 days per device', () => {
    const now = 1_800_000_000_000;
    expect(optInDue(null, now)).toBe(true);
    expect(optInDue(now - OPTIN_GAP_MS + 1, now)).toBe(false);
    expect(optInDue(now - OPTIN_GAP_MS, now)).toBe(true);
  });
  it('one language at a time, founder copy', () => {
    expect(optInTx('th').title).toBe('อยากรู้ทันทีไหมว่ารีลผ่านแล้ว?');
    expect(optInTx('th').on).toBe('เปิดการแจ้งเตือน');
    expect(optInTx('en').title).toBe('Want to know the moment your Reel is approved?');
    expect(optInTx('en').later).toBe('Later');
    expect(/[฀-๿]/.test(Object.values(optInTx('en')).join(' '))).toBe(false);
  });
});
describe('m233 photo of the day', () => {
  it('sits right after the post task with its own copy', () => {
    expect(TASK_ORDER.slice(0, 2)).toEqual(['post', 'photo']);
    expect(TX.en.postS).toBe('Reel +5 · or photo +3 · once a day');
    expect(TX.th.postS).toBe('รีล +5 · หรือรูป +3 · วันละ 1 ครั้ง');
    expect(TX.en.photoS).toBe('A photo from your day, once a day · +2');
    expect(TX.th.photoS).toBe('รูปจากวันของคุณ วันละ 1 รูป · +2');
  });
});
