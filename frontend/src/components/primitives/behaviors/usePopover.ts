import { useEffect, useRef, type RefObject } from 'react'

// usePopover — the headless overlay behavior (UX "Behaviors", L0). Owns the interaction every overlay
// otherwise hand-rolls: outside-click + Escape dismissal, and (for the modal tier) focus-trap +
// scroll-lock + focus-return + initial focus. The *look* (backdrop, panel chrome, anchoring) stays in
// the skin; the behavior owns nothing visual.
//
// Two positioning modes share this one behavior:
//   • anchored (no portal) — Dropdown/DatePicker/ColourPicker/EmojiIconPicker/ThemePicker render the
//     panel as a `position:absolute` sibling inside a `relative` wrapper; `containRef` = that wrapper.
//   • portalled — Modal/ContextMenu render through <Portal>; `containRef` = the floating panel itself.
//
// Stable-effect-identity contract: the dismiss/trap effect depends only on `open`. `onClose` and the
// dynamic `dismissOnEscape` gate are read through refs, so a parent re-render (e.g. typing into a child
// input that hands us a fresh `onClose` closure) does NOT tear down and re-run the effect — which would
// otherwise yank focus back into the panel mid-type. This preserves the original Modal fix.

// jsdom-safe focusable selector: filter at the selector level (`:not([disabled]):not([hidden])`) and
// drop `aria-hidden` — NOT via `offsetParent`, which jsdom always reports null, breaking the trap in
// tests. (Lifted verbatim from the original Modal hand-roll.)
const FOCUSABLE_SELECTOR =
  'button:not([disabled]):not([hidden]), [href]:not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"]):not([hidden])'

export interface UsePopoverOptions {
  open: boolean
  onClose: () => void
  /** Element whose bounds define "inside" for outside-click dismissal (the anchored wrapper, or the
   *  portalled panel). Required when `dismissOnOutsideClick` is on. */
  containRef?: RefObject<HTMLElement | null>
  /** A second "inside" element — used when the panel is portalled so its trigger lives in a separate
   *  DOM subtree (a press on the trigger must not count as outside). */
  triggerRef?: RefObject<HTMLElement | null>
  /** Close when a press lands outside `containRef`. Default true. Modal turns this OFF — its backdrop
   *  click is handled by the skin (with the press-started-on-backdrop drag guard). */
  dismissOnOutsideClick?: boolean
  /** Close on Escape. Default true. May be dynamic (Modal's `dismissible`) — read fresh each keypress. */
  dismissOnEscape?: boolean
  /** Escape-specific close (e.g. also return focus to the trigger). Defaults to `onClose`. Lets a skin
   *  refocus the trigger on Escape WITHOUT also refocusing on an outside-click dismissal. */
  onEscape?: () => void
  /** Trap Tab focus within `panelRef` and move initial focus into it on open (modal tier). */
  trapFocus?: boolean
  /** Lock body scroll while open (modal tier). */
  lockScroll?: boolean
  /** Restore focus to the previously-focused element on close (modal tier). */
  returnFocus?: boolean
  /** The floating panel — focus-trap boundary + initial-focus target. Required when `trapFocus`. */
  panelRef?: RefObject<HTMLElement | null>
}

export function usePopover({
  open,
  onClose,
  containRef,
  triggerRef,
  dismissOnOutsideClick = true,
  dismissOnEscape = true,
  onEscape,
  trapFocus = false,
  lockScroll = false,
  returnFocus = false,
  panelRef,
}: UsePopoverOptions) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape
  const escGateRef = useRef(dismissOnEscape)
  escGateRef.current = dismissOnEscape
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    if (returnFocus) previousFocus.current = document.activeElement as HTMLElement
    const originalOverflow = lockScroll ? document.body.style.overflow : ''
    if (lockScroll) document.body.style.overflow = 'hidden'

    // Move initial focus into the panel (modal tier). The 50ms defer lets the entrance frame settle
    // before focusing so the panel is in the DOM and not mid-transition.
    const focusTimer =
      trapFocus && panelRef
        ? setTimeout(() => panelRef.current?.focus({ preventScroll: true }), 50)
        : undefined

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && escGateRef.current) {
        ;(onEscapeRef.current ?? onCloseRef.current)()
        return
      }
      if (trapFocus && e.key === 'Tab' && panelRef?.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((n) => n.getAttribute('aria-hidden') !== 'true')
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last?.focus()
          }
        } else if (document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      // "Inside" = the contain element (anchored wrapper / portalled panel) plus an optional trigger in
      // a separate subtree. Close only when the press lands outside every declared inside-element.
      const insides = [containRef?.current, triggerRef?.current].filter(Boolean) as Node[]
      if (insides.length > 0 && !insides.some((el) => el.contains(target))) onCloseRef.current()
    }

    document.addEventListener('keydown', handleKey)
    if (dismissOnOutsideClick) document.addEventListener('mousedown', handleMouseDown)

    return () => {
      if (focusTimer) clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKey)
      if (dismissOnOutsideClick) document.removeEventListener('mousedown', handleMouseDown)
      if (lockScroll) document.body.style.overflow = originalOverflow
      if (returnFocus) previousFocus.current?.focus()
    }
    // Only `open` drives setup/teardown; onClose + the Escape gate are read via refs (see header note).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
