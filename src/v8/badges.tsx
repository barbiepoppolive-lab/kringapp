/**
 * m211 (25 Nov 2026) profile badges. Founder: "I want previous week winner to have a tag in their profile,
 * alongwith founding local badge on Otop and Pich."
 *  · last week's board (kr8_profile.last_week): "🏆 #3 · Week 47" for 1-3, "🏅 #5 · Week 47" for 4-8
 *  · team-granted badges (kr8_profile.badges): 'founding_local' → "🌟 Founding Local"
 * Small tinted text pills on one line under the name. No border, no glow. One language per screen (own table, all 6 languages).
 */
import './badges.css';

export interface V5LastWeek { rank: number; week: string; week_no?: number | null }

const TX: Record<string, { week: string; founding: string }> = {
  en: { week: '#{0} · Week {1}', founding: 'Founding Local' },
  th: { week: 'อันดับ {0} · สัปดาห์ที่ {1}', founding: 'รุ่นบุกเบิก' },
  zh: { week: '第 {0} 名 · 第 {1} 周', founding: '创始会员' },
  hi: { week: '#{0} · सप्ताह {1}', founding: 'फ़ाउंडिंग लोकल' },
  ja: { week: '{0}位 · 第{1}週', founding: '創設メンバー' },
  ko: { week: '{0}위 · {1}주차', founding: '창립 멤버' },
};

/** ISO week number of a 'YYYY-MM-DD' Monday (only used if the server did not send week_no). */
export function isoWeek(day: string): number | null {
  const t = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const y0 = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - y0) / 86400000 + 1) / 7);
}

export interface BadgePill { key: string; icon: string; text: string; kind: 'gold' | 'win' | 'star' }

export function badgePills(lang: string, badges: string[] | null | undefined, lastWeek: V5LastWeek | null | undefined): BadgePill[] {
  const tx = TX[lang] || TX.en;
  const out: BadgePill[] = [];
  const r = lastWeek && Number.isInteger(lastWeek.rank) ? lastWeek.rank : 0;
  if (r >= 1 && r <= 8) {
    const wk = lastWeek?.week_no ?? isoWeek(lastWeek?.week || '');
    if (wk) out.push({ key: 'week', icon: r <= 3 ? '🏆' : '🏅', text: tx.week.replace('{0}', String(r)).replace('{1}', String(wk)), kind: r <= 3 ? 'gold' : 'win' });
  }
  if ((badges || []).includes('founding_local')) out.push({ key: 'founding_local', icon: '🌟', text: tx.founding, kind: 'star' });
  return out;
}

/** The pills row under a member's name (profile + Me). Nothing at all when the member has no badge. */
export function ProfileBadges(props: { lang: string; badges?: string[] | null; lastWeek?: V5LastWeek | null; id?: string }) {
  const pills = badgePills(props.lang, props.badges, props.lastWeek);
  if (!pills.length) return null;
  return (
    <div className="kb-row" id={props.id}>
      {pills.map((b) => <span key={b.key} className={`kb-pill kb-${b.kind}`} data-badge={b.key}><span aria-hidden="true">{b.icon}</span>{b.text}</span>)}
    </div>
  );
}

/** The tiny icons after a name on a People card: 🏆 (last week 1-3), 🏅 (4-8), 🌟 (Founding Local). */
export function cardBadgeIcons(badges: string[] | null | undefined, lastRank: number | null | undefined): string {
  const r = lastRank || 0;
  return `${r >= 1 && r <= 3 ? '🏆' : r >= 4 && r <= 8 ? '🏅' : ''}${(badges || []).includes('founding_local') ? '🌟' : ''}`;
}
