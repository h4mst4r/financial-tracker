import React, { useState, useEffect, useRef, useCallback } from 'react';

interface TooltipProps {
  content: React.ReactNode;
  /** Hover-enter delay in ms. Applied via CSS transition-delay. Default: 200 */
  delay?: number;
  children: React.ReactNode;
}

/**
 * CSS-primary tooltip with viewport boundary awareness.
 *
 * Visibility is driven by CSS `group-hover` and `group-focus-within` on the
 * wrapper — no JS timers or show/hide state. The `delay` prop maps directly to
 * CSS `transition-delay` so the browser handles the animation entirely.
 *
 * Positioning uses JS to clamp the tooltip within the viewport on both axes:
 *  - Horizontal: when the trigger is near an edge, the tooltip shifts so it
 *    stays fully visible instead of being centred and overflowing.
 *  - Vertical: if the trigger is near the top edge and there's insufficient
 *    space above, the tooltip automatically flips to render below the trigger.
 *
 * The only JS involvement is:
 *  - Computing clamped position (horizontal + vertical flip) on hover/focus.
 *  - Resetting the `dismissed` flag when the user re-hovers / re-focuses
 *    after pressing Escape (so the tooltip can reappear naturally).
 *  - Listening for the Escape key to set `dismissed = true`, which overrides
 *    the CSS-driven opacity via a forced `!opacity-0` class.
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  delay = 0,
  children,
}) => {
  // `dismissed` is only true after the user presses Escape.
  // It resets automatically on the next hover/focus so the tooltip
  // can reappear without any extra interaction.
  const [dismissed, setDismissed] = useState(false);
  const [offsetStyle, setOffsetStyle] = useState<React.CSSProperties | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDismissed(true);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  // Calculate clamped position (horizontal + vertical flip) when the wrapper
  // becomes visible (i.e., on hover/focus). This runs once per show, not continuously.
  const calculatePosition = useCallback(() => {
    if (!wrapperRef.current || !tooltipRef.current) return;

    const wrapperRect = wrapperRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;
    const gap = 8; // mb-2 / mt-2

    // --- Horizontal clamp ---
    let left = wrapperRect.left + wrapperRect.width / 2;
    const minLeft = padding + tooltipRect.width / 2;
    const maxLeft = viewportWidth - padding - tooltipRect.width / 2;
    if (left < minLeft) left = minLeft;
    else if (left > maxLeft) left = maxLeft;

    // --- Vertical flip ---
    // Default: above trigger. Check if there's enough space above.
    const spaceAbove = wrapperRect.top - gap;
    const spaceBelow = viewportHeight - wrapperRect.bottom - gap;
    const showBelow = spaceAbove < tooltipRect.height && spaceBelow >= spaceAbove;

    // Convert viewport-relative centre to a CSS left value (relative to wrapper)
    const relativeLeft = left - wrapperRect.left;
    setOffsetStyle({
      left: `${relativeLeft}px`,
      // Store placement decision so the render can switch classes
      __showBelow: showBelow,
    });
  }, []);

  const resetDismissed = () => {
    setDismissed(false);
    // Recalculate position on each show (wrapper may have moved)
    // Use rAF to ensure tooltip is measurable (opacity transition hasn't collapsed it)
    requestAnimationFrame(calculatePosition);
  };

  // Determine placement from calculated offset (default: above)
  const showBelow = offsetStyle?.__showBelow === true;
  const placementClasses = showBelow ? 'top-full mt-2' : 'bottom-full mb-2';

  const arrowStyle: React.CSSProperties = showBelow
    ? {
          bottom: '100%',
          borderBottom: '6px solid var(--color-border-strong)',
          borderTop: 'none',
        }
    : {
          top: '100%',
          borderTop: '6px solid var(--color-border-strong)',
          borderBottom: 'none',
        };

  return (
    <div
      ref={wrapperRef}
      className="relative inline-flex group/tooltip"
      onMouseEnter={resetDismissed}
      onFocus={resetDismissed}
    >
      {children}

      {/* Tooltip bubble — always in DOM; CSS opacity controls visibility */}
      <div
        ref={tooltipRef}
        role="tooltip"
        aria-hidden={dismissed || undefined}
        className={[
          // Position
          'absolute z-tooltip left-1/2 -translate-x-1/2',
          placementClasses,
          // Sizing & shape
          'w-max max-w-tooltip px-3 py-2 rounded-md',
          // Typography & colour
          'text-xs text-text whitespace-normal break-words',
          'bg-surface-overlay border border-border-strong shadow-lg',
          // Non-interactive by default
          'pointer-events-none select-none',
          // CSS-driven visibility: hidden by default, shown on hover/focus
          'opacity-0 transition-opacity duration-fast',
          !dismissed && 'group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100',
          // Escape override — force-hide even if group is still hovered
          dismissed && '!opacity-0',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          transitionDelay: `${delay}ms`,
          // Override left/translate when we have a clamped position
          ...(offsetStyle ? { left: offsetStyle.left, transform: 'none' } : {}),
        }}
      >
        {content}

        {/* CSS triangle arrow */}
        <span
          className="absolute left-1/2 -translate-x-1/2"
          aria-hidden="true"
          style={{
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            ...arrowStyle,
            // When clamped, centre arrow on the trigger instead
            ...(offsetStyle
              ? { left: offsetStyle.left, transform: 'translateX(-50%)' }
              : {}),
          }}
        />
      </div>
    </div>
  );
};
