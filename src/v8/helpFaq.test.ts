import { describe, expect, it } from 'vitest';
import { HELP_BANNED, HELP_CHIPS, HELP_FAQS, HELP_TEAM_PROMISE, faqAnswer, faqById, matchHelp, normHelp } from './helpFaq';
import { HELP_UI } from './V5Help';

/** each FAQ found by one Thai and one English phrasing that are NOT the FAQ's own question */
const PHRASINGS: Record<string, [string, string]> = {
  face_why: ['ทำไมต้องสแกนหน้าด้วย', 'why do I have to verify my face'],
  face_privacy: ['รูปหน้าฉันถูกเก็บไว้ไหม', 'is my face photo stored on your server?'],
  face_fail: ['สแกนหน้าไม่ผ่านเลย', 'my face check keeps failing'],
  face_taken: ['มันบอกว่าหน้าฉันอยู่ในบัญชีอื่น', 'app says my face is already used on another account'],
  rings_what: ['เก็บริงยังไง', 'how do rings work'],
  rings_line: ['ส่งลิงก์ในไลน์แล้วริงไม่เพิ่ม', "why didn't my LINE shares count"],
  prize_win: ['อยากชนะรางวัลต้องทำไง', 'how can I win something this week'],
  week_end: ['สัปดาห์นี้จบเมื่อไหร่', 'when is the end of the week'],
  reel_board: ['รีลฉันไม่ขึ้นบอร์ดเลย', "I can't see my reel on the leaderboard"],
  claim_how: ['จะรับรางวัลต้องกดตรงไหน', 'where do I claim my voucher'],
  code_late: ['กดรับไปแล้วยังไม่ได้รับโค้ดเลย', 'I claimed my prize but no code yet'],
  code_use: ['โค้ดนี้เอาไปใช้ยังไง', 'how do I redeem the code in TrueMoney'],
  links: ['ทำไมส่งลิ้งให้เพื่อนไม่ได้', "chat won't let me send a link"],
  hide_socials: ['อยากซ่อนไอจีจากคนอื่น', 'can people see my instagram, can I hide it'],
  report_block: ['มีคนคุกคามจะบล็อกยังไง', 'someone is harassing me, how to report them'],
  delete_data: ['อยากลบบัญชีทิ้ง', 'please remove my account and data'],
  change_profile: ['จะเปลี่ยนภาษาเป็นอังกฤษ', 'how to change the app language to English'],
  promo_off: ['ไม่อยากให้เอารีลไปโปรโมต', 'stop using my reels for promotion'],
};

describe('Kring Helper FAQ matcher', () => {
  it('has the 18 approved FAQs with unique ids and 6 chips', () => {
    expect(HELP_FAQS).toHaveLength(18);
    expect(new Set(HELP_FAQS.map((f) => f.id)).size).toBe(18);
    expect(HELP_CHIPS).toHaveLength(6);
    for (const id of HELP_CHIPS) expect(faqById(id)?.chipTh).toBeTruthy();
    expect(Object.keys(PHRASINGS).sort()).toEqual(HELP_FAQS.map((f) => f.id).sort());
  });
  for (const f of HELP_FAQS) {
    it(`finds ${f.id} by Thai and English phrasings, and by its own question + chip`, () => {
      const [th, en] = PHRASINGS[f.id];
      expect(matchHelp(th).faq?.id, th).toBe(f.id);
      expect(matchHelp(en).faq?.id, en).toBe(f.id);
      expect(matchHelp(f.qTh).faq?.id).toBe(f.id);
      expect(matchHelp(f.qEn).faq?.id).toBe(f.id);
      if (f.chipTh) expect(matchHelp(f.chipTh).faq?.id).toBe(f.id);
      const m = matchHelp(en);
      expect(m.similar.length).toBeGreaterThan(0);
      expect(m.similar.map((s) => s.id)).not.toContain(f.id);
    });
  }
  it('says "not sure" for an unrelated question', () => {
    expect(matchHelp('what is the weather like in Chiang Mai').faq).toBeNull();
    expect(matchHelp('').faq).toBeNull();
    expect(matchHelp('อากาศวันนี้เป็นยังไง').faq).toBeNull();
    expect(matchHelp('hello').similar.length).toBeGreaterThan(0);
  });
  it('normalises case, curly quotes and spacing', () => {
    expect(normHelp('  Why  DIDN’T it…  ')).toBe("why didn't it");
  });
  it('the team line keeps the founder 1-hour promise, and every Thai team line ends politely (ครับ, never ค่ะ)', () => {
    expect(HELP_TEAM_PROMISE.th).toBe('ทีมงานตอบกลับในแชทนี้ภายใน 1 ชั่วโมงครับ');
    expect(HELP_TEAM_PROMISE.en).toBe('The team replies in this chat within 1 hour');
    expect(`${HELP_TEAM_PROMISE.th} ${HELP_TEAM_PROMISE.en}`).toMatch(/1 ชั่วโมง.*1 hour/);   // founder 18 Nov: reply within an hour
    const all = [...HELP_FAQS.flatMap((f) => [f.aTh, f.qTh]), ...Object.values(HELP_UI).map((v) => v[0])].join(' ');
    expect(all).not.toMatch(/ค่ะ|คะ(\s|$)/);
    expect(HELP_UI.greet[0]).toMatch(/ครับ$/);
    expect(HELP_UI.notSure[0]).toMatch(/ครับ$/);
  });
  it('no banned words anywhere member-facing (FAQs, chips, helper UI)', () => {
    const texts = [...HELP_FAQS.flatMap((f) => [f.qTh, f.qEn, faqAnswer(f, true), faqAnswer(f, false), f.chipTh || '', f.chipEn || '']),
      ...Object.values(HELP_UI).flat(), HELP_TEAM_PROMISE.th, HELP_TEAM_PROMISE.en];
    for (const t of texts) for (const w of HELP_BANNED) {
      const re = /^[a-z ]+$/.test(w) ? new RegExp(`\\b${w}`, 'i') : new RegExp(w);
      expect(re.test(t), `"${w}" in: ${t}`).toBe(false);
    }
  });
});

describe('T-392 FAQ truth check: answers match the code', () => {
  const en = (id: string, r?: Record<string, number>) => faqAnswer(faqById(id)!, false, r);
  const th = (id: string, r?: Record<string, number>) => faqAnswer(faqById(id)!, true, r);
  it('prize_win: only the single best Reel counts (best_reels = 1), with the ladder, floor and Founding Local from the rules', () => {
    expect(en('prize_win')).toBe('Every week the top 8 on the board share ฿4,400 (฿1,500 for #1). You need at least 25 Rings, only your single best Reel of the week counts, and the Reel must be pinned to a Bangkok place. The first 50 members with an approved Reel also get ฿100 (Founding Local).');
    expect(th('prize_win')).toContain('นับเฉพาะรีลที่ดีที่สุดของคุณรีลเดียว');
    expect(th('prize_win')).toMatch(/ครับ$/);
    for (const t of [en('prize_win'), th('prize_win')]) expect(t).not.toMatch(/\{|best 2|2 รีล/);
  });
  it('prize_win follows a config change without a code edit', () => {
    const t = en('prize_win', { best_reels: 2, min_rings_for_paid_seat: 30, prize_4: 0, founding_on: 0 });
    expect(t).toContain('your best 2 Reels of the week count');
    expect(t).toContain('top 3 on the board share ฿3,000');
    expect(t).toContain('at least 30 Rings');
    expect(t).not.toContain('Founding Local');
    expect(th('prize_win', { best_reels: 2 })).toContain('นับ 2 รีลที่ดีที่สุดของคุณ');
  });
  it('"how much is the prize" finds prize_win', () => {
    expect(matchHelp('how much is the prize').faq?.id).toBe('prize_win');
    expect(matchHelp('รางวัลเท่าไหร่').faq?.id).toBe('prize_win');
  });
  it('face_privacy no longer says the photo never leaves the phone: one selfie can go to the team, then it is deleted', () => {
    const e = en('face_privacy'); const t = th('face_privacy');
    expect(e).not.toMatch(/^No\.|only a face code|not a picture/);
    expect(e).toMatch(/one selfie goes to our team/);
    expect(e).toMatch(/30 days after the review/);
    expect(e).toMatch(/delete your face data in Settings/);
    expect(t).not.toMatch(/^ไม่ครับ|ไม่ใช่รูปภาพ/);
    expect(t).toContain('เซลฟี่ 1 รูป');
    expect(t).toMatch(/ครับ$/);
  });
  it('delete_data says what the 1-year prize rule covers; code_late has no 24-hour promise', () => {
    expect(en('delete_data')).toMatch(/face codes and selfies/);
    expect(en('delete_data')).toMatch(/Founding Local prize twice/);
    expect(en('code_late')).not.toMatch(/24 hours|week’s results/);
    expect(th('code_late')).not.toMatch(/24 ชั่วโมง/);
    expect(en('code_use')).toContain('Copy link');
    expect(en('reel_board')).toContain('Feed-only');
  });
});
