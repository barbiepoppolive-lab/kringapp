/**
 * 0073 (17 Nov): the "Kring Team" account is a sender only. Members never browse it; in chats and Ask a Thai it shows as
 * "Kring Team · Official" (never "Thai Local"), and tapping it never opens a member profile. SQL rules are checked on the file.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { createAskApi, resetAskLocal, type AskPerson } from './askThai';
import { AskThaiView } from './V5AskThai';
import { V5_L } from './v5Strings';

const L = (en: string) => en;
const team: AskPerson = { id: 'team', name: 'Kring Team', photo: '/app/icon-192.png', local: false, official: true };
const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/0073_kr8_team_sender_only.sql'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, 'KringAppV8.tsx'), 'utf8');
const live = fs.readFileSync(path.join(__dirname, 'v5Live.ts'), 'utf8');

describe('Kring Team: Ask a Thai', () => {
  beforeEach(() => resetAskLocal());
  it('a post by the team shows "Kring Team" with the Official badge, not Thai Local', async () => {
    const api = createAskApi({ live: false, demo: false, me: () => team });
    await api.ask({ body: 'Songkran week: share your favourite water-fight spot 💦', area: 'Bangkok' });
    render(<div className="v8-app-root"><AskThaiView L={L} api={api} me={null} areas={['Bangkok']} areaLabel={(a) => a} need={(f) => f()} toast={() => {}} /></div>);
    await screen.findByText(/Songkran week/);
    expect(screen.getByText('Kring Team')).toBeTruthy();
    expect(document.querySelector('[data-official="1"]')?.textContent).toBe('Official');
    expect(screen.queryByText('Thai Local')).toBeNull();
    expect(V5_L.th.Official).toBe('ทางการ');
  });
});

describe('Kring Team: database rules (0073)', () => {
  it('the one gate (kr8_is_blocked) hides the team from members, keeps ghost mode and blocks', () => {
    const body = sql.slice(sql.indexOf('create or replace function public.kr8_is_blocked'), sql.indexOf('create or replace function public.kr8_team_ids'));
    expect(body).toMatch(/kr8_blocks where \(blocker = x and blocked = y\)/);
    expect(body).toMatch(/kr8_is_ghost\(case when auth\.uid\(\) = x then y else x end\)/);
    expect(body).toMatch(/kr8_is_team\(case when auth\.uid\(\) = x then y else x end\)/);
    expect(body).toMatch(/not public\.kr8_is_team\(auth\.uid\(\)\)/);        // the team itself still sees members
    expect(body).toMatch(/not public\.kr8_team_visible_here\(\)/);
  });
  it('chats and Ask a Thai stay open (the member can read and reply); People, profiles, search and boards do not', () => {
    const vis = sql.slice(sql.indexOf('create or replace function public.kr8_team_visible_here'), sql.indexOf('create or replace function public.kr8_is_blocked'));
    for (const p of ['/rpc/kr8_inbox', '/rpc/kr8_thread_messages', '/rpc/kr8_send_message', '/rpc/kr8_thread_translations', '/kr8_messages', '/kr8_threads']) expect(vis).toContain(`'${p}'`);
    expect(vis).toContain("like '/rpc/kr8\\_ask\\_%'");
    for (const p of ['kr8_people', 'kr8_profile', 'kr8_tag_candidates', 'kr8_weekly_ranking', 'kr8_top10', 'kr8_feed', 'kr8_follow_list', 'kr8_send_hello']) expect(vis).not.toContain(p);
  });
  it('admin counts and recruiters leave the team out; Ask a Thai marks it official', () => {
    expect(sql).toMatch(/kr8_admin_new_members_today[\s\S]*not public\.kr8_is_team\(m\.user_id\)/);
    expect(sql).toMatch(/kr8_admin_recruiters[\s\S]*and not public\.kr8_is_team\(m\.user_id\)/);
    expect(sql).toMatch(/'name', 'Kring Team', 'photo', null, 'local', false, 'official', true/);
  });
});

describe('Kring Team: app', () => {
  it('inbox marks team threads official (logo, "Official · ทางการ"), and tapping it never opens a member profile', () => {
    expect(live).toMatch(/const official = team\.has\(r0\.other_id\)/);
    expect(live).toContain("other_area: 'Official · ทางการ'");
    expect(app).toContain("(await v5TeamIds().catch(() => [] as string[])).includes(id)) { setSheet('official'); return; }");
    const sheet = app.slice(app.indexOf("{sheet === 'official' && ("), app.indexOf("{sheet === 'blocked' && ("));
    expect(sheet).toContain("{lang === 'th' ? 'ทางการ' : 'Official'}");   // T-390 P2-01: one language at a time
    expect(sheet.replace(/\/\/.*$/gm, '')).not.toMatch(/sayHi|openSayHi|Follow/);
  });
});
