// Pure sparkline geometry (no React) — kept out of MiniSparkline.tsx so that component file exports
// only its component (Fast Refresh), while these helpers stay independently unit-testable.

export const VB_W = 120
export const VB_H = 40
export const PAD = 4 // vertical breathing room so the stroke / end-dot aren't clipped at the viewBox edge
export const MAX_POINTS = 12

export interface Pt {
  x: number
  y: number
}

export const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Map a value window to viewBox coords (y inverted: higher value = higher on screen). A flat series
 * (max === min) sits at mid-height — no divide-by-zero.
 */
export function sparkPoints(values: number[], w = VB_W, h = VB_H, pad = PAD): Pt[] {
  const n = values.length
  if (n === 0) return []
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min
  const innerH = h - pad * 2
  return values.map((v, i) => {
    const x = n > 1 ? (i * w) / (n - 1) : w / 2
    const t = span === 0 ? 0.5 : (v - min) / span
    return { x: round2(x), y: round2(h - pad - t * innerH) }
  })
}
