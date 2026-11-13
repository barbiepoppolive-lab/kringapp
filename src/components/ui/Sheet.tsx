import React, { useEffect, useRef, useState, useCallback } from 'react';
import { haptic } from '../../lib/haptics';
import { useBackEntry } from '../../lib/backStack';
import '../../styles/shell.css';

export type SheetDetent = '60%' | '92%' | 'auto';

/* Atlas 3D · "glass sheets materialise from the tap point". One passive capture listener remembers the last
   pointerdown; sheets (and the full-screen guide) opened within 900 ms grow from that x position. */
let lastTap: { x: number; y: number; t: number } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      lastTap = { x: Math.round(e.clientX), y: Math.round(e.clientY), t: Date.now() };
    },
    { capture: true, passive: true },
  );
}
/** The last tap position if it happened in the last 900 ms (else null). */
export function getTapOrigin(): { x: number; y: number } | null {
  if (!lastTap || Date.now() - lastTap.t > 900) return null;
  return { x: lastTap.x, y: lastTap.y };
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerRight?: React.ReactNode;
  initialDetent?: SheetDetent;
  detents?: ('60%' | '92%')[];
  footer?: React.ReactNode;
  testId?: string;
  closeTestId?: string;
  ariaLabel?: string;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * UXP4-02 — Universal Chon! Bottom Sheet Primitive ("Chon! Final Design" Container #3)
 *
 * Rules enforced:
 * - Two layers deep max (Layer 2 container at `--z-sheet: 80`, always above full-screen pages at `--z-page: 70`)
 * - Detents: `60%` (thumb-zone default) and `92%` (expanded full sheet), or `'auto'`
 * - Drag-to-dismiss thresholds: downward drag > 96px OR velocity > 0.55 px/ms dismisses;
 *   upward drag > 48px expands from 60% -> 92%; grabber tap toggles 60% <-> 92%.
 * - Closes on: backdrop tap, Escape key, 44x44 close button, or drag-to-dismiss.
 * - Uses `.m-sheet-up` (`backwards` fill-mode) so no residual CSS transform traps fixed children.
 */
export const Sheet: React.FC<SheetProps> = ({
  open,
  onClose,
  title,
  subtitle,
  headerRight,
  initialDetent = '60%',
  detents = ['60%', '92%'],
  footer,
  testId = 'chon-sheet',
  closeTestId,
  ariaLabel,
  className = '',
  bodyClassName = '',
  children,
}) => {
  const [activeDetent, setActiveDetent] = useState<SheetDetent>(initialDetent);
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const dragStartYRef = useRef<number | null>(null);
  const dragStartTimeRef = useRef<number>(0);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [tapX, setTapX] = useState<number | null>(() => getTapOrigin()?.x ?? null);
  useBackEntry(open, onClose, { id: testId || 'chon-sheet', priority: 100 });

  useEffect(() => {
    if (open) {
      setActiveDetent(initialDetent);
      setDragOffsetY(0);
      setIsDragging(false);
      setTapX(getTapOrigin()?.x ?? null);
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        previousFocusRef.current = document.activeElement;
      }
      haptic('sheet');
    } else if (previousFocusRef.current) {
      try {
        previousFocusRef.current.focus();
      } catch {
        // ignore focus restoration errors in detached DOM nodes
      }
      previousFocusRef.current = null;
    }
  }, [open, initialDetent]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        e.preventDefault();
        e.stopPropagation();
        haptic('tap');
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleDragStart = useCallback((clientY: number) => {
    dragStartYRef.current = clientY;
    dragStartTimeRef.current = performance.now();
    setIsDragging(true);
  }, []);

  const handleDragMove = useCallback((clientY: number) => {
    if (dragStartYRef.current === null) return;
    const deltaY = clientY - dragStartYRef.current;
    // Allow subtle upward resistance (-36px) and full downward drag
    const clamped = deltaY < 0 ? Math.max(-36, deltaY * 0.4) : deltaY;
    setDragOffsetY(clamped);
  }, []);

  const handleDragEnd = useCallback(
    (clientY: number) => {
      if (dragStartYRef.current === null) return;
      const deltaY = clientY - dragStartYRef.current;
      const elapsed = Math.max(1, performance.now() - dragStartTimeRef.current);
      const velocity = deltaY / elapsed; // px/ms

      dragStartYRef.current = null;
      setIsDragging(false);
      setDragOffsetY(0);

      // Upward drag > 48px expands from 60% to 92% if supported
      if (deltaY < -48 && detents.includes('92%') && activeDetent !== '92%') {
        haptic('select');
        setActiveDetent('92%');
        return;
      }

      // If at 92% detent and dragged down moderately (48px..110px) with low velocity, step down to 60%
      if (
        activeDetent === '92%' &&
        detents.includes('60%') &&
        deltaY > 48 &&
        deltaY <= 110 &&
        velocity <= 0.55
      ) {
        haptic('select');
        setActiveDetent('60%');
        return;
      }

      // Dismiss threshold: drag > 96px OR downward flick velocity > 0.55 px/ms
      if (deltaY > 96 || velocity > 0.55) {
        haptic('sheet');
        onClose();
      }
    },
    [activeDetent, detents, onClose]
  );

  const toggleDetent = useCallback(() => {
    if (detents.length < 2) return;
    haptic('select');
    setActiveDetent((prev) => (prev === '60%' ? '92%' : '60%'));
  }, [detents]);

  if (!open) return null;

  const maxHeightStyle =
    activeDetent === '92%'
      ? '92dvh'
      : activeDetent === '60%'
        ? '60dvh'
        : '88dvh';

  return (
    <div
      className="fixed inset-0 flex flex-col justify-end m-fade"
      style={{
        zIndex: 'var(--z-sheet, 80)',
        backgroundColor: 'var(--overlay)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          haptic('tap');
          onClose();
        }
      }}
      data-testid={`${testId}-backdrop`}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || (typeof title === 'string' ? title : 'Bottom sheet')}
        data-testid={testId}
        data-detent={activeDetent}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: maxHeightStyle,
          transform: dragOffsetY !== 0 ? `translateY(${dragOffsetY}px)` : undefined,
          ...(tapX !== null ? ({ '--sh-ox': `${tapX}px` } as React.CSSProperties) : null),
          transition: isDragging
            ? 'none'
            : 'max-height var(--motion-sheet, 220ms) var(--motion-spring, cubic-bezier(0.22, 1, 0.36, 1)), transform var(--motion-sheet, 220ms) var(--motion-spring, cubic-bezier(0.22, 1, 0.36, 1))',
        }}
        className={`ux-sheet w-full max-w-[430px] mx-auto c-surface-1 rounded-t-[20px] flex flex-col overflow-hidden ${tapX !== null ? 'sh-materialise' : 'm-sheet-up'} ${className}`}
      >
        {/* Grabber & Header Zone (touch/pointer drag target) */}
        <div
          data-testid={`${testId}-drag-handle`}
          onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
          onTouchMove={(e) => handleDragMove(e.touches[0].clientY)}
          onTouchEnd={(e) => {
            const touch = e.changedTouches[0];
            if (touch) handleDragEnd(touch.clientY);
          }}
          onMouseDown={(e) => handleDragStart(e.clientY)}
          onMouseMove={(e) => {
            if (isDragging) handleDragMove(e.clientY);
          }}
          onMouseUp={(e) => {
            if (isDragging) handleDragEnd(e.clientY);
          }}
          className="ux-sheet-head ux-surface-glass shrink-0 select-none cursor-grab active:cursor-grabbing pt-2 pb-2.5 px-4"
        >
          {/* Grabber Pill */}
          <div className="flex justify-center mb-2">
            <button
              type="button"
              data-testid={`${testId}-grabber`}
              aria-label="Toggle sheet height"
              onClick={toggleDetent}
              className="ux-grabber bg-[var(--line-strong)] hover:bg-[var(--text-3)] transition-colors"
            />
          </div>

          {(title || subtitle || headerRight) && (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                {title && (
                  <h2 className="text-[15px] font-semibold c-text-1 truncate leading-snug">
                    {title}
                  </h2>
                )}
                {subtitle && (
                  <p className="text-[13px] c-text-3 truncate mt-0.5">{subtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {headerRight}
                <button
                  type="button"
                  data-testid={closeTestId || `${testId}-close`}
                  aria-label="Close"
                  onClick={() => {
                    haptic('tap');
                    onClose();
                  }}
                  className="ux-sheet-close min-w-[36px] min-h-[36px] px-2.5 rounded-full c-surface-2 c-text-2 hover:c-text-1 text-xs font-semibold flex items-center justify-center m-press"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Sheet Body */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 kf-stagger ${bodyClassName}`}
        >
          {children}
        </div>

        {/* Sticky Thumb-Zone Footer (Bottom 40% Rule) */}
        {footer && (
          <div
            data-testid={`${testId}-footer`}
            className="shrink-0 px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t c-line c-surface-1"
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Container #2: Pushed Page (`--z-pushed: 40`, `.m-page-push`)
 */
export const PushedPage: React.FC<{
  open: boolean;
  onBack: () => void;
  title: React.ReactNode;
  rightSlot?: React.ReactNode;
  testId?: string;
  children: React.ReactNode;
}> = ({ open, onBack, title, rightSlot, testId = 'pushed-page', children }) => {
  useBackEntry(open, onBack, { id: testId || 'pushed-page', priority: 70 });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onBack]);

  if (!open) return null;

  return (
    <div
      data-testid={testId}
      style={{ zIndex: 'var(--z-pushed, 40)' }}
      className="fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] c-surface-0 flex flex-col overflow-hidden m-page-push"
    >
      <header className="shrink-0 h-12 px-3 border-b c-line c-surface-1 flex items-center justify-between gap-2">
        <button
          type="button"
          data-testid={`${testId}-back`}
          onClick={() => {
            haptic('tap');
            onBack();
          }}
          className="min-h-[36px] px-2.5 rounded-lg c-surface-2 border c-line text-xs font-semibold c-text-1 flex items-center gap-1.5 m-press"
        >
          <span aria-hidden="true">←</span>
          <span>Back</span>
        </button>
        <div className="min-w-0 flex-1 text-center text-[15px] font-semibold c-text-1 truncate">
          {title}
        </div>
        <div className="shrink-0 flex items-center justify-end min-w-[60px]">{rightSlot}</div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
    </div>
  );
};

/**
 * Container #4: Inline / Composer Tray (`--z-tray: 30`, `.m-tray-rise`)
 */
export const Tray: React.FC<{
  open: boolean;
  onClose?: () => void;
  testId?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ open, testId = 'chon-tray', className = '', children }) => {
  if (!open) return null;
  return (
    <div
      data-testid={testId}
      style={{ zIndex: 'var(--z-tray, 30)' }}
      className={`c-surface-1 border-t c-line m-tray-rise ${className}`}
    >
      {children}
    </div>
  );
};

/**
 * Container #6: Inline Expand (`.m-inline-expand`)
 */
export const InlineExpand: React.FC<{
  open: boolean;
  testId?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ open, testId = 'inline-expand', className = '', children }) => {
  if (!open) return null;
  return (
    <div data-testid={testId} className={`m-inline-expand ${className}`}>
      {children}
    </div>
  );
};

export default Sheet;
