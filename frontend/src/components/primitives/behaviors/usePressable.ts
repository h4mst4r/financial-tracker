import { type KeyboardEvent, type MouseEvent, type SyntheticEvent } from 'react'

// usePressable — the headless press behavior (UX "Behaviors": Pressable owns
// "press · focus · disabled · keyboard-activate"). It centralises disabled-gated activation, the shared
// press-scale + disabled class fragments, and — for a NON-native host (a `<span role="button">` rather
// than a `<button>`) — the role/tabIndex/Enter-Space wiring a clickable element otherwise hand-rolls.
// Native `<button>` skins (Button, Toggle, SegmentedControl segments) gate their `onClick` through this
// and reuse the class fragments; the browser supplies the rest of the press semantics.

// The §13 press-scale and the disabled treatment live here as the single source (the B10 press-scale token
// promotion is a later 5F story). DISABLED_CLASS is the §3a `disabled` utility (5f-5): a relative
// surface-mix + faint text + not-allowed (NOT opacity, which bleeds the bg + breaks the floor, B14/L5).
export const PRESS_SCALE = 'active:scale-[0.97] transition-transform duration-press'
export const DISABLED_CLASS = 'disabled'

export interface UsePressableOptions {
  disabled?: boolean
  /** Activation handler (click, or Enter/Space on a host). Receives the originating event so a host can
   *  e.g. `stopPropagation()` (the ContextMenu trigger inside a clickable row). */
  onPress?: (e?: SyntheticEvent) => void
  /** Set true when the host element is NOT a native button — adds role/tabIndex/keyboard activation. */
  host?: boolean
}

export interface HostPressableProps {
  role: 'button'
  tabIndex: number
  onClick: (e: MouseEvent) => void
  onKeyDown: (e: KeyboardEvent) => void
  'aria-disabled': true | undefined
}

export interface NativePressableProps {
  onClick: (e: MouseEvent) => void
}

export function usePressable(opts: UsePressableOptions & { host: true }): HostPressableProps
export function usePressable(opts: UsePressableOptions & { host?: false }): NativePressableProps
export function usePressable(opts: UsePressableOptions): HostPressableProps | NativePressableProps {
  const { disabled, onPress, host } = opts
  const activate = (e?: SyntheticEvent) => {
    if (!disabled) onPress?.(e)
  }

  if (host) {
    return {
      role: 'button',
      tabIndex: disabled ? -1 : 0,
      onClick: (e) => activate(e),
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          activate(e)
        }
      },
      'aria-disabled': disabled || undefined,
    }
  }

  return { onClick: (e) => activate(e) }
}
