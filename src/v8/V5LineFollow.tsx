/* 25 Nov: "Follow Kring on LINE". Kring's LINE Official Account (@266jjwqh, "กริ๊ง! Kring") had 3 followers, so LINE broadcasts
   reached almost no one. One small sheet, once per phone: right after a new member's profile builder, or ≥10 s after an existing
   member opens the app with nothing else on screen. A permanent "Kring on LINE" row sits in Settings. */
import { v5LogClient } from './v5Live';
import './lineFollow.css';

export const LINE_FOLLOW_URL = 'https://line.me/R/ti/p/@266jjwqh';
const KEY = 'kr8_line_follow';

/** True once this phone has shown the sheet (or the member tapped a button). Storage blocked → treat as seen (never nag). */
export function lineFollowSeen(): boolean {
  try { return !!localStorage.getItem(KEY); } catch { return true; }
}
export function markLineFollowSeen(how: 'shown' | 'tap' | 'later'): void {
  try { localStorage.setItem(KEY, how); } catch { /* ignore */ }
}
export type LineFollowFrom = 'builder' | 'open' | 'settings';
export function logLineFollow(kind: 'tap' | 'dismiss', from: LineFollowFrom): void {
  v5LogClient(kind === 'tap' ? 'line_follow_tap' : 'line_follow_dismiss', from);
}

/** LINE app icon: white bubble with the green LINE word on a #06C755 tile. */
export function LineIcon(props: { size?: number }) {
  const s = props.size || 40;
  return (
    <svg className="klf-ic" viewBox="0 0 40 40" width={s} height={s} focusable="false" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#06C755" />
      <path fill="#fff" d="M20 8.2c-7.4 0-13.4 4.9-13.4 10.9 0 5.4 4.8 9.9 11.2 10.8.4.1 1 .3 1.2.7.1.3.1.9.1 1.3l-.2 1.1c-.1.3-.3 1.3 1.1.7 1.4-.6 7.5-4.4 10.2-7.6 1.9-2.1 2.8-4.2 2.8-6.6 0-6-6-10.9-13-10.9z" />
      <text x="20" y="21.6" textAnchor="middle" fill="#06C755" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="7" letterSpacing="-0.2">LINE</text>
    </svg>
  );
}

export function LineFollowSheet(props: { L: (k: string) => string; from: LineFollowFrom; onClose: () => void }) {
  const { L } = props;
  const later = () => { markLineFollowSeen('later'); logLineFollow('dismiss', props.from); props.onClose(); };
  return (
    <>
      <div className="sheet-backdrop" id="lineFollowBackdrop" onClick={later} />
      <div className="v8-sheet klf-sheet" id="lineFollow" data-from={props.from} role="dialog" aria-modal="true" aria-label={L('Get Kring news on LINE')}>
        <div className="grab" />
        <div className="klf-top">
          <LineIcon size={44} />
          <div className="klf-tx">
            <h3>{L('Get Kring news on LINE')}</h3>
            <p>{L('Weekly winners, new questions and invite tips, straight to your LINE.')}</p>
          </div>
        </div>
        <a className="klf-go" id="lineFollowGo" href={LINE_FOLLOW_URL} target="_blank" rel="noopener noreferrer"
          onClick={() => { markLineFollowSeen('tap'); logLineFollow('tap', props.from); setTimeout(props.onClose, 300); }}>
          {L('Add Kring on LINE')}
        </a>
        <button type="button" className="klf-later" id="lineFollowLater" onClick={later}>{L('Not now')}</button>
      </div>
    </>
  );
}
