/**
 * 17 Nov: EVERY reject in admin (face checks, Reels, venues, reports / Ask BKK, Same person? Refuse, Reel history Hide)
 * opens the same reason sheet: ready chips, an editable text, and a send button that stays visible (sticky) on a 390 px phone.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.join(__dirname, 'adminApp.ts'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'admin2.css'), 'utf8');

describe('admin reject reason sheet', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="app"></div>'; });
  it('opens with chips, fills the text from a chip, and sends Thai + English', async () => {
    const m = await import('./adminApp');
    let sent = '';
    let done = 0;
    m.rejectSheet('Why not?', 'The member sees this reason.', m.REEL_CHIPS, 't1', async (why) => { sent = why; }, () => { done += 1; });
    const sheet = document.getElementById('t1Sheet')!;
    expect(sheet).toBeTruthy();
    const chips = sheet.querySelectorAll('.chips2 button');
    expect(chips.length).toBe(m.REEL_CHIPS.length);
    const go = document.getElementById('t1Send') as HTMLButtonElement;
    expect(go.classList.contains('rs-go')).toBe(true);
    expect(go.compareDocumentPosition(sheet.querySelector('textarea')!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();   // send is the last thing
    (chips[1] as HTMLButtonElement).click();
    expect((document.getElementById('t1Why') as HTMLTextAreaElement).value).toBe(m.REEL_CHIPS[1][1]);
    go.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toBe(`${m.REEL_CHIPS[1][2]}\n${m.REEL_CHIPS[1][1]}`);
    expect(done).toBe(1);
    expect(document.getElementById('t1Sheet')).toBeNull();
  });
  it('the send button is sticky so it stays on screen at 390 px', () => {
    expect(css).toMatch(/\.sheet \.stack\.rs \.rs-go \{ position: sticky; bottom: 0;/);
  });
  it('every reject / hide / remove / refuse action goes through rejectSheet (no one-tap rejects left)', () => {
    const lines = src.split('\n');
    const hits = lines.filter((l) => /btn\([^)]*\[(?:ic\('(?:x|eyeoff|trash)'\), )?'(Reject|Hide|Remove|Refuse)'\]/.test(l));
    expect(hits.length).toBeGreaterThanOrEqual(5);
    for (const l of hits) expect(l.includes('rejectSheet(') || l.includes('act.refuse(') || l.includes("set('hidden'") || /const reject = btn\(/.test(l) || /kr8_admin_unaward/.test(l) /* undo of an admin's own award, not a member-facing reject */, l.trim()).toBe(true);
    // the ones that delegate: Refuse → rejectSheet, history Hide → rejectSheet, venue reject → rejectSheet
    expect(src).toMatch(/refuse: \(h, giveBack\) => rejectSheet\(/);
    expect(src).toMatch(/s === 'hidden'\s*\n\s*\/\/[^\n]*\n\s*\? \(\) => rejectSheet\('Why hide\?'/);
    expect(src).toMatch(/reject\.onclick = \(\) => rejectSheet\(/);
    expect(src).toMatch(/btn\('out-bad big', \[ic\('trash'\), 'Remove'\], \(\) => rejectSheet\('Why remove\?'/);
    expect(src).toMatch(/btn\('out-bad big', \[ic\('x'\), 'Reject'\], \(\) => rejectSheet\('Why not\?', 'The member sees this reason\.', FACE_CHIPS/);
  });
});
