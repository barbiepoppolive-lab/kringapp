/**
 * Bottom tab bar (Feed · People · Deals · Me).
 * Inactive: grey rounded line icons. Active: the icon fills with the Kring pink→violet gradient,
 * white inner glyph, soft glow pill, white label.
 * Each active icon carries its own gradient <defs> and uses it through SVG attributes (not CSS url()),
 * so the gradient renders the same in Chrome, Safari/WebKit and Firefox, also from a bundled stylesheet.
 */
import React from 'react';

export type DockTab = 'feed' | 'people' | 'deals' | 'me';
export const DOCK_TABS: DockTab[] = ['feed', 'people', 'deals', 'me'];

const PINK = '#FF4FA3';
const VIOLET = '#7A5CFF';

export const DockIcon: React.FC<{ id: DockTab; on: boolean }> = ({ id, on }) => {
  const gid = `kdg-${id}`;
  const body = on ? `url(#${gid})` : 'none';
  const line = on ? `url(#${gid})` : 'currentColor';
  const ink = on ? '#fff' : 'currentColor';
  return (
    <svg viewBox="0 0 24 24" className="dk-ic" aria-hidden="true" focusable="false">
      {on && (
        <defs>
          <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="21" y2="21">
            <stop offset="0" stopColor={PINK} />
            <stop offset="1" stopColor={VIOLET} />
          </linearGradient>
        </defs>
      )}
      {id === 'feed' && (
        <>
          <rect x="3.75" y="3.25" width="16.5" height="17.5" rx="5.25" fill={body} stroke={line} />
          <path d="M10.1 8.75v6.5c0 .62.68.99 1.2.66l4.9-3.25a.8.8 0 0 0 0-1.32l-4.9-3.25c-.52-.33-1.2.04-1.2.66Z" fill={on ? ink : 'none'} stroke={on ? 'none' : ink} />
        </>
      )}
      {id === 'people' && (
        <>
          <path d="M15.4 4.6a3.4 3.4 0 0 1 0 6.6M17.9 14.2c1.9.6 3.1 2.2 3.4 4.4.1.6-.3 1.1-.9 1.1h-1.2" fill="none" stroke={line} />
          <circle cx="9.25" cy="8.1" r="3.6" fill={body} stroke={line} />
          <path d="M2.85 18.9c.6-3.2 3.2-5.3 6.4-5.3s5.8 2.1 6.4 5.3c.1.5-.3.95-.85.95H3.7c-.55 0-.95-.45-.85-.95Z" fill={body} stroke={line} />
        </>
      )}
      {id === 'deals' && (
        <>
          <path d="M2.5 8.25a3.25 3.25 0 0 1 3.25-3.25h12.5a3.25 3.25 0 0 1 3.25 3.25v1.3a2.45 2.45 0 0 0 0 4.9v1.3a3.25 3.25 0 0 1-3.25 3.25H5.75a3.25 3.25 0 0 1-3.25-3.25v-1.3a2.45 2.45 0 0 0 0-4.9Z" fill={body} stroke={line} />
          <path d="M9.5 14.75l5-5.5" fill="none" stroke={ink} />
          <circle cx="9.75" cy="9.6" r="1.2" fill={ink} stroke="none" />
          <circle cx="14.25" cy="14.4" r="1.2" fill={ink} stroke="none" />
        </>
      )}
      {id === 'me' && (
        <>
          <circle cx="12" cy="12" r="9.25" fill={body} stroke={line} />
          <circle cx="12" cy="9.9" r="3.15" fill="none" stroke={ink} />
          <path d="M6.6 18.25c1.25-2.05 3.15-3.2 5.4-3.2s4.15 1.15 5.4 3.2" fill="none" stroke={ink} />
        </>
      )}
    </svg>
  );
};

export const KDock: React.FC<{ tab: string; labels: Record<DockTab, string>; onTap: (t: DockTab) => void }> = ({ tab, labels, onTap }) => (
  <nav className="dock" aria-label="Primary navigation">
    {DOCK_TABS.map((id) => {
      const on = tab === id;
      return (
        <button key={id} type="button" className={on ? 'active' : ''} data-tab={id} aria-current={on ? 'page' : undefined} onClick={() => onTap(id)}>
          <span className="dk-pill"><DockIcon id={id} on={on} /></span>
          <span className="dk-lb">{labels[id]}</span>
        </button>
      );
    })}
  </nav>
);
