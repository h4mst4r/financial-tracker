// Hand-rolled colour maths for the theming engine — no dependencies, all pure.
// Two distinct lightness measures live here on purpose: OKLab L* drives the immersive
// ramp-slot index; WCAG relative luminance drives contrast. Do not conflate them.

import { PALETTES, type ResolvedThemeId } from './palettes'

const LIGHT = '#ffffff'
const DARK = '#0a0a0a' // softer than pure black; still passes the floor

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

// sRGB channel (0..1) → linear-light
const lin = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** OKLab L* (perceptual lightness, 0..1) — for the immersive ramp index. */
export function oklabLightness(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => lin(v / 255)) as [number, number, number]
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  return 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
}

/** WCAG relative luminance — for contrast (distinct from OKLab L*). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => lin(v / 255)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

const textCache = new Map<string, typeof LIGHT | typeof DARK>()

/** White vs dark text by whichever has the higher WCAG ratio against `bg`. Memoized. */
export function contrastText(bg: string): typeof LIGHT | typeof DARK {
  const cached = textCache.get(bg)
  if (cached) return cached
  const result = contrastRatio(LIGHT, bg) >= contrastRatio(DARK, bg) ? LIGHT : DARK
  textCache.set(bg, result)
  return result
}

// per-channel linear interpolation in sRGB — good enough for the floor step
function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  const ch = (x: number, y: number): number => Math.round(x + (y - x) * t)
  return rgbToHex(ch(ar, br), ch(ag, bg), ch(ab, bb))
}

const floorCache = new Map<string, { fill: string; text: typeof LIGHT | typeof DARK }>()

/**
 * Pick text via contrastText; if it still fails the floor, step the FILL away from the
 * text pole (toward the opposite extreme) until contrast passes. Memoized by `${bg}|${large}`.
 */
export function enforceFloor(bg: string, opts?: { large?: boolean }): { fill: string; text: typeof LIGHT | typeof DARK } {
  const large = opts?.large ?? false
  const key = `${bg}|${large}`
  const cached = floorCache.get(key)
  if (cached) return cached
  const floor = large ? 3 : 4.5
  const text = contrastText(bg)
  // Mix fill toward the opposite pole of the chosen text — DARK (#0a0a0a) is the
  // consistent dark pole (softer than pure black, still passes the floor).
  const opposite = text === LIGHT ? DARK : LIGHT
  let fill = bg
  let steps = 0
  while (contrastRatio(text, fill) < floor && steps < 8) {
    fill = mixHex(fill, opposite, 0.08)
    steps++
  }
  const result = { fill, text }
  floorCache.set(key, result)
  return result
}

/**
 * Effective background of a calm fill: the entity colour composited over the surface at
 * the calm alpha (same 0.14 as the CSS `bg-entity-fill-calm` utility). Vivid fill = the
 * colour itself (no composite). Use the result as the `bg` arg to contrastText/enforceFloor.
 */
export function compositeCalm(entityHex: string, surfaceHex: string, alpha = 0.14): string {
  const [er, eg, eb] = hexToRgb(entityHex)
  const [sr, sg, sb] = hexToRgb(surfaceHex)
  const ch = (e: number, s: number): number => Math.round(e * alpha + s * (1 - alpha))
  return rgbToHex(ch(er, sr), ch(eg, sg), ch(eb, sb))
}

/** Stable FNV-1a string hash → unsigned int, for the collision nudge. */
export function hashEntityId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function findFreeSlot(start: number, n: number, taken: Set<number>, dir: number): number {
  // Alternate directions each iteration so edge slots (near 0 or n-1) don't
  // waste a full pass searching only outward.
  for (let d = 1; d < n; d++) {
    const first = dir === 1 ? start + d : start - d
    if (first >= 0 && first < n && !taken.has(first)) return first
    const second = dir === 1 ? start - d : start + d
    if (second >= 0 && second < n && !taken.has(second)) return second
  }
  return start // ramp full — fall back to the natural slot
}

/**
 * Immersive remap: map an entity's own colour onto the active palette's tint ramp by OKLab
 * lightness. Non-immersive palettes return the hex unchanged. Pass a shared `takenSlots` set
 * when rendering many entities together so colliding entities deterministically separate.
 */
export function remapEntityColour(
  hex: string,
  entityId: string,
  theme: ResolvedThemeId,
  takenSlots?: Set<number>,
): string {
  const palette = PALETTES[theme]
  if (!palette.immersive || !palette.tintRamp) return hex
  const ramp = palette.tintRamp
  const n = ramp.length
  let idx = Math.round((1 - oklabLightness(hex)) * (n - 1))
  idx = Math.max(0, Math.min(n - 1, idx))
  if (takenSlots) {
    if (takenSlots.has(idx)) {
      idx = findFreeSlot(idx, n, takenSlots, hashEntityId(entityId) % 2 === 0 ? 1 : -1)
    }
    takenSlots.add(idx)
  }
  return ramp[idx]
}
