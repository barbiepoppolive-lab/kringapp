/**
 * Board V2 "Compact" art (founder pick 18 Nov): crowns, podium discs, medals and the small icons.
 * All inline SVG/CSS (no images besides the one background), so the board stays light on cheap Android phones.
 * Ported from the mock's art.py; gradient ids are fixed per tone (same definitions everywhere, so sharing an id is safe).
 */

export type Tone = 'gold' | 'blue' | 'rose';
const CROWN: Record<Tone, [string, string, string]> = {
  gold: ['#FFF4BF', '#F6C445', '#B9800F'], blue: ['#E8F1FF', '#8FB6FF', '#3D63C8'], rose: ['#FFE3D2', '#FFA07A', '#C25A3A'],
};

export function Crown({ tone, w, cls }: { tone: Tone; w: number; cls?: string }) {
  const c = CROWN[tone], id = `bxcr-${tone}`;
  return (
    <svg className={cls} viewBox="0 0 50 36" width={w} height={Math.round(w * 0.72)} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c[0]} /><stop offset=".55" stopColor={c[1]} /><stop offset="1" stopColor={c[2]} /></linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c[1]} /><stop offset="1" stopColor={c[2]} /></linearGradient>
      </defs>
      <path d="M6 27 L3 9 L15 18 L25 4 L35 18 L47 9 L44 27 Z" fill={`url(#${id})`} stroke={c[0]} strokeWidth=".8" strokeLinejoin="round" />
      <rect x="5.5" y="26" width="39" height="7" rx="2.5" fill={`url(#${id}b)`} stroke={c[0]} strokeWidth=".6" />
      <circle cx="3" cy="8.5" r="2.6" fill={`url(#${id})`} /><circle cx="25" cy="3.6" r="2.8" fill={`url(#${id})`} /><circle cx="47" cy="8.5" r="2.6" fill={`url(#${id})`} />
      <circle cx="25" cy="29.5" r="2.2" fill="#FF3F9E" /><circle cx="15" cy="29.5" r="1.7" fill="#4FA3FF" /><circle cx="35" cy="29.5" r="1.7" fill="#4FA3FF" />
      <path d="M10 22 L9 13 L15 18 Z" fill="#fff" opacity=".35" /><path d="M22 15 L25 8 L27 14 Z" fill="#fff" opacity=".45" />
    </svg>
  );
}

type DiscTone = 'gold' | 'blue' | 'pink';
const DISC: Record<DiscTone, { rim: string; top0: string; top1: string; top2: string; side0: string; side1: string; glow: string; floor: string }> = {
  gold: { rim: '#FFD36B', top0: '#FFF6D6', top1: '#F4C24A', top2: '#B77A12', side0: '#8A5A0C', side1: '#2A1606', glow: '#FFB72E', floor: '#FF9E2E' },
  blue: { rim: '#73B8FF', top0: '#F0F6FF', top1: '#9CB8E8', top2: '#4A62B0', side0: '#2B3C86', side1: '#0D1236', glow: '#3D8BFF', floor: '#2F6BFF' },
  pink: { rim: '#FF86C8', top0: '#FFE6EE', top1: '#F4A08E', top2: '#B2486A', side0: '#7A1E52', side1: '#250A22', glow: '#FF3FB0', floor: '#FF2E9A' },
};
const f1 = (n: number) => Math.round(n * 10) / 10;

/** A thick round 3D platform seen from above (w = top width, h = side height). */
export function Disc({ tone, w, h }: { tone: DiscTone; w: number; h: number }) {
  const T = DISC[tone], u = `bxd-${tone}`;
  const ry = w * 0.17, pad = 30, W = w + pad * 2, H = ry * 2 + h + 44;
  const cx = W / 2, ty = ry + 8, x0 = cx - w / 2, x1 = cx + w / 2, by = ty + h;
  const side = `M${f1(x0)} ${f1(ty)} L${f1(x0)} ${f1(by)} A${f1(w / 2)} ${f1(ry)} 0 0 0 ${f1(x1)} ${f1(by)} L${f1(x1)} ${f1(ty)} Z`;
  const lip = `M${f1(x0)} ${f1(by)} A${f1(w / 2)} ${f1(ry)} 0 0 0 ${f1(x1)} ${f1(by)}`;
  return (
    <svg className="bx-disc" viewBox={`0 0 ${Math.round(W)} ${Math.round(H)}`} width={Math.round(W)} height={Math.round(H)} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${u}t`} cx=".5" cy=".38" r=".62"><stop offset="0" stopColor={T.top0} /><stop offset=".55" stopColor={T.top1} /><stop offset="1" stopColor={T.top2} /></radialGradient>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={T.side0} /><stop offset="1" stopColor={T.side1} /></linearGradient>
        <linearGradient id={`${u}h`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".22" stopColor="#fff" stopOpacity=".38" />
          <stop offset=".4" stopColor="#fff" stopOpacity=".02" /><stop offset=".78" stopColor="#fff" stopOpacity=".16" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <radialGradient id={`${u}f`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor={T.floor} stopOpacity=".8" /><stop offset="1" stopColor={T.floor} stopOpacity="0" /></radialGradient>
        <filter id={`${u}b3`} x="-20%" y="-100%" width="140%" height="300%"><feGaussianBlur stdDeviation="2.6" /></filter>
      </defs>
      <ellipse cx={cx} cy={f1(by + ry * 0.6)} rx={f1(w * 0.66)} ry={f1(ry * 1.5)} fill={`url(#${u}f)`} />
      <ellipse cx={cx} cy={f1(by + ry * 0.35)} rx={f1(w * 0.56)} ry={f1(ry * 1.02)} fill="none" stroke={T.rim} strokeWidth="1.2" opacity=".55" />
      <path d={side} fill={`url(#${u}s)`} />
      <path d={side} fill={`url(#${u}h)`} />
      <path d={lip} fill="none" stroke={T.rim} strokeWidth="5" opacity=".9" filter={`url(#${u}b3)`} />
      <path d={lip} fill="none" stroke="#fff" strokeWidth="1" opacity=".7" />
      <ellipse cx={cx} cy={f1(ty)} rx={f1(w / 2)} ry={f1(ry)} fill={`url(#${u}t)`} />
      <ellipse cx={cx} cy={f1(ty)} rx={f1((w / 2) * 0.78)} ry={f1(ry * 0.78)} fill="none" stroke="#fff" strokeWidth="1" opacity=".45" />
      <ellipse cx={cx} cy={f1(ty)} rx={f1(w / 2)} ry={f1(ry)} fill="none" stroke={T.glow} strokeWidth="7" opacity=".85" filter={`url(#${u}b3)`} />
      <ellipse cx={cx} cy={f1(ty)} rx={f1(w / 2)} ry={f1(ry)} fill="none" stroke={T.rim} strokeWidth="2.2" />
      <path d={`M${f1(cx - w * 0.36)} ${f1(ty - ry * 0.55)} A${f1((w / 2) * 0.8)} ${f1(ry * 0.8)} 0 0 1 ${f1(cx + w * 0.05)} ${f1(ty - ry * 0.8)}`}
        fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".85" filter={`url(#${u}b3)`} />
    </svg>
  );
}

/** Round numbered medal under a podium photo. */
export const Medal = ({ n }: { n: 1 | 2 | 3 }) => <i className={`bx-md m${n}`} aria-hidden="true">{n}</i>;

export const InfoIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="7.6" r="1.3" fill="currentColor" /></svg>
);
export const BackIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const ShareIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 12.5v5.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.5" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" /></svg>
);
export const PlusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
);
