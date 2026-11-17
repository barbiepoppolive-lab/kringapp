import { describe, expect, it } from 'vitest';
import { HELP_BANNED, HELP_CHIPS, HELP_FAQS, HELP_TEAM_PROMISE, faqById, matchHelp, normHelp } from './helpFaq';
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
  it('the team promise is 1 hour, and every Thai team line ends politely (ครับ, never ค่ะ)', () => {
    expect(HELP_TEAM_PROMISE.th).toBe('ทีมงานตอบภายใน 1 ชั่วโมง');
    expect(HELP_TEAM_PROMISE.en).toBe('The team replies within 1 hour');
    const all = [...HELP_FAQS.flatMap((f) => [f.aTh, f.qTh]), ...Object.values(HELP_UI).map((v) => v[0])].join(' ');
    expect(all).not.toMatch(/ค่ะ|คะ(\s|$)/);
    expect(HELP_UI.greet[0]).toMatch(/ครับ$/);
    expect(HELP_UI.notSure[0]).toMatch(/ครับ$/);
  });
  it('no banned words anywhere member-facing (FAQs, chips, helper UI)', () => {
    const texts = [...HELP_FAQS.flatMap((f) => [f.qTh, f.qEn, f.aTh, f.aEn, f.chipTh || '', f.chipEn || '']),
      ...Object.values(HELP_UI).flat(), HELP_TEAM_PROMISE.th, HELP_TEAM_PROMISE.en];
    for (const t of texts) for (const w of HELP_BANNED) {
      const re = /^[a-z ]+$/.test(w) ? new RegExp(`\\b${w}`, 'i') : new RegExp(w);
      expect(re.test(t), `"${w}" in: ${t}`).toBe(false);
    }
  });
});
