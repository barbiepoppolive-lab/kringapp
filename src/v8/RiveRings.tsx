import React from 'react';

export type RingsState = 'idle' | 'spin' | 'collide' | 'celebrate';

interface RiveRingsProps {
  state?: RingsState;
  size?: number;
  calm?: boolean;
  className?: string;
}

/**
 * Official Kring dual-ring logo (#kr symbol from kringapp.com):
 * Blue ring left (#3440E0), pink ring right (#FF4FA3), glowing lens in the overlap
 * (viewBox 0 0 1024 1024, circles at cx 392 / 632, cy 512, r 225, stroke 60).
 */
export const RiveRings: React.FC<RiveRingsProps> = ({
  state = 'spin',
  size = 44,
  calm = false,
  className = '',
}) => {
  const animClass =
    calm || state === 'idle'
      ? ''
      : state === 'collide' || state === 'celebrate'
      ? 'kr-logo-collide'
      : 'kr-logo-breathe';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      className={`kr-logo-svg ${animClass} ${className}`.trim()}
      aria-hidden="true"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <use href="#kr" />
    </svg>
  );
};
