/**
 * "Not yet" for Reels (20 Nov, founder): a kind, coaching no. Up to 3 tip chips, grouped; the member gets the tips in
 * their language (Thai ends with ครับ), the Reel stays visible to them only, and it is not a strike. The server (0163)
 * adds the Founding ฿100 line when their chance is still open and marks each language line with ⏳.
 * Rule-break chips are not tips: they send the founder to Hide instead.
 */
export type NotYetChip = { id: string; label: string; en: string; th: string };
export type NotYetGroup = { title: string; chips: NotYetChip[] };

export const NOT_YET_MAX = 3;

export const NOT_YET_GROUPS: NotYetGroup[] = [
  { title: 'How it looks', chips: [
    { id: 'dark', label: 'Too dark', en: 'Your Reel looks great, it’s just a bit too dark to see. Try filming in daylight or under bright lights.', th: 'รีลของคุณดีแล้วนะครับ แต่ยังมืดไปหน่อยจนมองไม่ค่อยเห็น ลองถ่ายตอนกลางวันหรือที่ที่มีไฟสว่างดูนะครับ' },
    { id: 'blurry', label: 'Blurry or shaky', en: 'So close! Hold your phone steady and wipe the lens — a sharp video gets far more views.', th: 'เกือบแล้วครับ! ลองถือมือถือให้นิ่งและเช็ดเลนส์ก่อนถ่าย วิดีโอที่คมชัดจะมีคนดูเยอะขึ้นมากครับ' },
    { id: 'sideways', label: 'Sideways', en: 'Turn your phone upright — Kring Reels fill the whole screen.', th: 'ลองถือมือถือแนวตั้งนะครับ รีลบนกริ๊ง! จะได้เต็มจอสวย ๆ ครับ' },
    { id: 'sound', label: 'Hard to hear', en: 'We couldn’t quite hear you. Find a quieter spot or hold the phone a little closer when you talk.', th: 'เสียงยังได้ยินไม่ค่อยชัดครับ ลองหามุมที่เงียบขึ้น หรือถือมือถือใกล้ตัวอีกนิดตอนพูดนะครับ' },
    { id: 'filters', label: 'Heavy filters', en: 'Your real look works best — try it with fewer filters and effects.', th: 'ลุคธรรมชาติของคุณดีที่สุดแล้วครับ ลองใช้ฟิลเตอร์หรือเอฟเฟกต์ให้น้อยลงดูนะครับ' },
  ] },
  { title: 'What’s in it', chips: [
    { id: 'noperson', label: 'No person in it', en: 'Nice place! Now put yourself in it — people follow people on Kring.', th: 'สถานที่สวยมากครับ! ลองให้ตัวคุณอยู่ในคลิปด้วยนะครับ บนกริ๊ง! คนชอบติดตามคนครับ' },
    { id: 'noplace', label: 'No place shown', en: 'We’d love to see where you are — show the spot and pin the place.', th: 'อยากเห็นว่าคุณอยู่ที่ไหนครับ ลองถ่ายให้เห็นสถานที่และปักหมุดด้วยนะครับ' },
    { id: 'home', label: 'At home / indoors', en: 'Take us out! Reels from a real Bangkok spot do best.', th: 'พาเราออกไปข้างนอกกันครับ! รีลจากสถานที่จริงในกรุงเทพฯ จะได้ผลดีที่สุดครับ' },
    { id: 'selfie', label: 'Only a selfie', en: 'Cute! Now show us what’s around you too.', th: 'น่ารักมากครับ! ลองให้เห็นบรรยากาศรอบ ๆ ตัวด้วยนะครับ' },
    { id: 'slideshow', label: 'Photo slideshow', en: 'Kring loves real video — film a short clip at the spot instead of photos.', th: 'กริ๊ง! ชอบวิดีโอจริงครับ ลองถ่ายคลิปสั้น ๆ ที่สถานที่แทนการใช้รูปนิ่งนะครับ' },
    { id: 'short', label: 'Too short', en: 'Give us a bit more — 10 to 30 seconds tells the story.', th: 'ขอยาวขึ้นอีกนิดครับ ประมาณ 10–30 วินาทีจะเล่าเรื่องได้ดีที่สุดครับ' },
    { id: 'long', label: 'Too long / slow', en: 'Trim it to the best 30 seconds — shorter keeps people watching.', th: 'ลองตัดเหลือช่วงที่ดีที่สุดสัก 30 วินาทีนะครับ คลิปสั้นลงคนจะดูจนจบครับ' },
  ] },
  { title: 'Will people watch', chips: [
    { id: 'slowstart', label: 'Slow start', en: 'Start with your best moment — you have 3 seconds before people scroll past.', th: 'ลองเปิดด้วยช่วงที่ดีที่สุดนะครับ คนตัดสินใจภายใน 3 วินาทีแรกว่าจะดูต่อไหมครับ' },
    { id: 'nothing', label: 'Nothing happens', en: 'Show what’s fun here — the view, the drink, the people, you trying it.', th: 'ลองโชว์ว่าที่นี่สนุกยังไงครับ วิว เครื่องดื่ม ผู้คน หรือตัวคุณกำลังลองอยู่ก็ได้ครับ' },
    { id: 'notalk', label: 'No talking', en: 'Say hi and tell us why you like this place — your voice makes it yours.', th: 'ลองทักทายและเล่าหน่อยว่าทำไมถึงชอบที่นี่นะครับ เสียงของคุณจะทำให้รีลเป็นของคุณจริง ๆ ครับ' },
    { id: 'musiconly', label: 'Just music + scenery', en: 'Lovely vibe! Add yourself or a short story so people stay to the end.', th: 'บรรยากาศดีมากครับ! ลองใส่ตัวคุณหรือเรื่องสั้น ๆ เข้าไปด้วย คนจะได้ดูจนจบครับ' },
    { id: 'ad', label: 'Feels like an ad', en: 'Show your own experience, not a sales pitch.', th: 'ลองเล่าประสบการณ์ของคุณเองนะครับ แทนการโฆษณาขายของครับ' },
  ] },
];

/** Rule breaks: these are not tips, they open Hide (label = a REEL_CHIPS label). */
export const NOT_YET_RULE_BREAKS = ['Not their own clip', 'Not a real Bangkok spot', 'Fake engagement', 'Not right for Kring'];

export const NOT_YET_CHIPS: NotYetChip[] = NOT_YET_GROUPS.flatMap((g) => g.chips);
export const FOUNDING_LINE = { en: 'Post a new one anytime — your Founding ฿100 chance is still open.', th: 'โพสต์รีลใหม่ได้ตลอดนะครับ สิทธิ์ ฿100 Founding Local ของคุณยังอยู่ครับ' };

/** Autopilot reasons → tip chip ids (and rule breaks it spotted). */
export function chipsFromReasons(reasons: readonly string[] | null | undefined): { tips: string[]; ruleBreak: string | null } {
  const tips: string[] = [];
  let ruleBreak: string | null = null;
  const add = (id: string) => { if (!tips.includes(id)) tips.push(id); };
  for (const r0 of reasons || []) {
    const r = r0.toLowerCase();
    if (/copied|stock video|ai-made|screen recording|@\w/.test(r)) { ruleBreak = 'Not their own clip'; continue; }
    if (/too dark|a bit dark/.test(r)) add('dark');
    if (/blurry|a bit soft/.test(r)) add('blurry');
    if (/no person/.test(r)) add('noperson');
    if (/no place/.test(r)) add('noplace');
    if (/black bars|sideways/.test(r)) add('sideways');
    if (/filmed at home|at home|indoors/.test(r)) add('home');
    if (/very short|too short/.test(r)) add('short');
  }
  return { tips: tips.slice(0, NOT_YET_MAX), ruleBreak };
}

export function chipById(id: string): NotYetChip | undefined { return NOT_YET_CHIPS.find((c) => c.id === id); }

/** The English the founder previews (one line). */
export function notYetEnglish(ids: readonly string[]): string {
  return ids.map(chipById).filter((c): c is NotYetChip => !!c).map((c) => c.en).join(' ');
}
/** "Thai\nEnglish" sent to kr8_admin_review_reel('not_yet'); the English may be the founder's edit (kept on one line). */
export function notYetNote(ids: readonly string[], editedEn?: string): string {
  const cs = ids.map(chipById).filter((c): c is NotYetChip => !!c);
  const th = cs.map((c) => c.th).join(' ');
  const en = (editedEn ?? cs.map((c) => c.en).join(' ')).replace(/\s*\n\s*/g, ' ').trim();
  return `${th}\n${en}`;
}

