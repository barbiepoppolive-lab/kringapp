/** 20 Nov revamp (display only): one language at a time for place + language labels.
 *  Areas come from the database in English; in Thai mode we show the Thai name for known Bangkok areas, else the original. */
const AREA_TH: Record<string, string> = {
  bangkok: 'กรุงเทพฯ', 'bang kapi': 'บางกะปิ', 'pathum wan': 'ปทุมวัน', pathumwan: 'ปทุมวัน', siam: 'สยาม', sukhumvit: 'สุขุมวิท', silom: 'สีลม', sathorn: 'สาทร', sathon: 'สาทร',
  ari: 'อารีย์', 'thong lo': 'ทองหล่อ', thonglor: 'ทองหล่อ', ekkamai: 'เอกมัย', 'khao san': 'ข้าวสาร', 'phra nakhon': 'พระนคร', 'old town': 'เมืองเก่า', chinatown: 'เยาวราช',
  yaowarat: 'เยาวราช', 'bang rak': 'บางรัก', 'khlong toei': 'คลองเตย', 'huai khwang': 'ห้วยขวาง', 'din daeng': 'ดินแดง', ratchathewi: 'ราชเทวี', 'phaya thai': 'พญาไท',
  chatuchak: 'จตุจักร', 'lat phrao': 'ลาดพร้าว', 'bang na': 'บางนา', prawet: 'ประเวศ', 'bang kho laem': 'บางคอแหลม', 'khlong san': 'คลองสาน', thonburi: 'ธนบุรี',
  'bang sue': 'บางซื่อ', 'wang thonglang': 'วังทองหลาง', 'suan luang': 'สวนหลวง', 'phra khanong': 'พระโขนง', 'watthana': 'วัฒนา', 'nonthaburi': 'นนทบุรี',
  'samut prakan': 'สมุทรปราการ', 'pattaya': 'พัทยา', 'phuket': 'ภูเก็ต', 'chiang mai': 'เชียงใหม่', thailand: 'ประเทศไทย',
};
const LANG_TH: Record<string, string> = { TH: 'ไทย', EN: 'อังกฤษ', ZH: 'จีน', HI: 'ฮินดี', JA: 'ญี่ปุ่น', KO: 'เกาหลี', FR: 'ฝรั่งเศส', DE: 'เยอรมัน', RU: 'รัสเซีย', ES: 'สเปน', IT: 'อิตาลี', MY: 'มลายู', VI: 'เวียดนาม', LO: 'ลาว', MM: 'พม่า' };
const LANG_EN: Record<string, string> = { TH: 'Thai', EN: 'English', ZH: 'Chinese', HI: 'Hindi', JA: 'Japanese', KO: 'Korean', FR: 'French', DE: 'German', RU: 'Russian', ES: 'Spanish', IT: 'Italian', MY: 'Malay', VI: 'Vietnamese', LO: 'Lao', MM: 'Burmese' };

const isThai = () => { try { return document.documentElement.lang === 'th'; } catch { return false; } };

export function rvArea(area: string | null | undefined): string {
  const a = (area || '').trim();
  if (!a || !isThai()) return a;
  return AREA_TH[a.toLowerCase()] || a;
}

export function rvLangs(codes: string[] | null | undefined, max = 2): string {
  const th = isThai();
  return (codes || []).slice(0, max).map((c) => { const k = c.toUpperCase(); return (th ? LANG_TH[k] : LANG_EN[k]) || c; }).join(' · ');
}
