import { useState, useEffect, useCallback, useRef } from 'react';

export interface FloatingPosition {
  top: number;
  left: number;
  width: number;
}

export interface FloatingPositionOptions {
  /** Vertical gap between trigger bottom and panel top. Default: 4 */
  gap?: number;
  /**
   * Minimum panel width in pixels. When provided, the hook will clamp the
   * horizontal position so the panel never overflows the viewport edges.
   * Without this, the panel is positioned at the trigger's left edge with
   * no boundary awareness.
   */
  panelMinWidth?: number;
  /**
   * Horizontal padding from the viewport edge. Default: 8 (2 on each side).
   */
  viewportPadding?: number;
}

/**
 * Tracks the viewport-relative position of a trigger element so a portal-rendered
 * floating panel stays anchored to it during scroll and resize.
 *
 * Uses requestAnimationFrame to batch updates — one DOM read per frame maximum,
 * which eliminates the per-event jitter of raw scroll listener setState calls.
 *
 * When `panelMinWidth` is provided, the returned `left` value is clamped so the
 * panel never extends beyond the viewport's left or right edge (with padding).
 *
 * Usage:
 *   const triggerRef = useRef<HTMLButtonElement>(null);
 *   const panelPos = useFloatingPosition(triggerRef, isOpen, { panelMinWidth: 180 });
 *
 *   {isOpen && panelPos && createPortal(
 *     <div className="fixed z-dropdown" style={panelPos}>...</div>,
 *     document.body
 *   )}
 */
export function useFloatingPosition(
  triggerRef: React.RefObject<HTMLElement | null>,
  open: boolean,
  options: number | FloatingPositionOptions = 4,
): FloatingPosition | null {
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const rafRef = useRef<number | null>(null);

  // Normalise options
  const gap = typeof options === 'number' ? options : options.gap ?? 4;
  const panelMinWidth = typeof options === 'number' ? undefined : options.panelMinWidth;
  const viewportPadding = typeof options === 'number' ? 8 : options.viewportPadding ?? 8;

  const readRect = useCallback((): FloatingPosition | null => {
    if (!triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    let left = rect.left;

    // Clamp horizontally so panel stays within viewport
    if (panelMinWidth) {
      const minLeft = viewportPadding / 2;
      const maxLeft = window.innerWidth - panelMinWidth - viewportPadding / 2;
      left = Math.max(minLeft, Math.min(left, maxLeft));
    }

    return { top: rect.bottom + gap, left, width: rect.width };
  }, [triggerRef, gap, panelMinWidth, viewportPadding]);

  // rAF-throttled updater — used for scroll and resize events
  const scheduleUpdate = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const pos = readRect();
      if (pos) setPosition(pos);
    });
  }, [readRect]);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    // Synchronous initial placement — works in jsdom (tests) and avoids a
    // one-frame flash on first render in the browser.
    const initial = readRect();
    if (initial) setPosition(initial);

    // Smooth rAF-throttled tracking for scroll and resize
    window.addEventListener('scroll', scheduleUpdate, true);
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      window.removeEventListener('scroll', scheduleUpdate, true);
      window.removeEventListener('resize', scheduleUpdate);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [open, readRect, scheduleUpdate]);

  return position;
}
