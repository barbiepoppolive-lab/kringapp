/** Feed top: the text switch "Reels · Ask a Thai" (final.html variant A). Small and eager; the Ask a Thai screen itself loads on first tap. */
import React from 'react';
import './askThai.css';

/** The text switch on top of the Feed (final.html variant A): Reels · Ask a Thai. */
export const AskSwitch: React.FC<{ L: (en: string) => string; mode: 'reels' | 'ask'; onMode: (m: 'reels' | 'ask') => void; dot?: boolean }> = ({ L, mode, onMode, dot }) => (
  <div className="at-sw" role="tablist" aria-label={L('Feed')}>
    <button type="button" role="tab" aria-selected={mode === 'reels'} className={mode === 'reels' ? 'on' : ''} onClick={() => onMode('reels')}>{L('Reels')}</button>
    <button type="button" role="tab" aria-selected={mode === 'ask'} className={mode === 'ask' ? 'on' : ''} onClick={() => onMode('ask')}>
      {L('Ask a Thai')}{dot && mode !== 'ask' && <i className="at-dot" aria-hidden="true" />}
    </button>
  </div>
);
