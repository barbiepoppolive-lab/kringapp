import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { claimedCount, fmt, leftCount, readyCount, resetsIn, streakDays, taskState, TX, type TasksToday } from './v5Tasks';

const day: TasksToday = {
  on: true, day: '2026-11-20', verified: true, max: 6, rings_today: 1, streak: [false, true, true, false, true, true, true],
  tasks: [
    { id: 'ask', rings: 3, done: true, claimed: false },
    { id: 'say', rings: 2, soon: true },
    { id: 'vote', rings: 1, done: false, claimed: false },
    { id: 'watch', rings: 1, done: false, claimed: false, progress: 2, goal: 3 },
    { id: 'open', rings: 1, done: true, claimed: true },
  ],
};

describe('daily tasks logic (0171)', () => {
  it('states: soon / done / claim / go', () => {
    expect(taskState({ id: 'say', rings: 2, soon: true })).toBe('soon');
    expect(taskState({ id: 'open', rings: 1, done: true, claimed: true })).toBe('done');
    expect(taskState({ id: 'ask', rings: 3, done: true })).toBe('claim');
    expect(taskState({ id: 'vote', rings: 1 })).toBe('go');
  });
  it('counts only doable tasks ("Say it in Thai" is coming soon)', () => {
    expect(claimedCount(day)).toBe(1);
    expect(readyCount(day)).toBe(1);
    expect(leftCount(day)).toBe(3);
  });
  it('streak: consecutive days ending today, or yesterday when today is not claimed yet', () => {
    expect(streakDays(day.streak)).toBe(3);
    expect(streakDays([true, true, true, true, true, true, false])).toBe(6);
    expect(streakDays([false, false, false, false, false, false, false])).toBe(0);
    expect(streakDays(undefined)).toBe(0);
  });
  it('resets-in and text formatting', () => {
    expect(resetsIn('2026-11-20T17:00:00Z', Date.parse('2026-11-20T11:48:00Z'))).toEqual({ h: 5, m: 12 });
    expect(fmt(TX.en.of, 2, 4)).toBe('2 of 4');
    expect(fmt(TX.th.of, 2, 4)).toBe('2 จาก 4');
  });
  it('Thai strings exist for every English key (one language at a time)', () => {
    for (const k of Object.keys(TX.en)) expect((TX.th as Record<string, unknown>)[k], k).toBeTruthy();
  });
  it('migration: claims need a face check, one claim per task per day, 6 Rings max, board counts task Rings, UNDO restores', () => {
    const m = readFileSync('supabase/migrations/0171_daily_tasks.sql', 'utf8');
    expect(m).toMatch(/KR8_TASK_FACE/);
    expect(m).toMatch(/on conflict \(member_id, reason, ref_id\) do nothing/);
    expect(m).toMatch(/reason = 'task'/);
    expect(m).toMatch(/\('task_ask', 3\), \('task_vote', 1\), \('task_watch', 1\), \('task_open', 1\)/);
    expect(m).toMatch(/0\.9/);
    const u = readFileSync('supabase/migrations/0171_daily_tasks_UNDO.sql', 'utf8');
    for (const f of ['kr8_week_board', 'kr8_member_rings']) expect(u).toMatch(new RegExp(`function public\\.${f}\\(`));
    expect(u).toMatch(/not valid/);
  });
});
