// Shared OKLab + WCAG colour math for the design-token contrast guards (ramp-derivation,
// emphasis-disabled). It mirrors the CSS `color-mix(in oklab, …)` + WCAG-contrast the tokens are
// authored with, re-derived INDEPENDENTLY of src/theme/colour.ts on purpose: the guards must not trust
// the implementation they verify, so this is a test-only re-derivation, never a `src` import.
//
// Two luminance/mix paths are exposed because the two guards verify different things and must keep their
// existing numbers: the ramp guard stays in OKLab tuple space at full precision (matching the browser's
// `color-mix(in oklab)`), while the emphasis guard round-trips through an 8-bit hex (`color-mix` resolved
// to a concrete swatch). Don't collapse them — the quantization difference is intentional.

export type Oklab = [number, number, number]

/** #rgb / #rrggbb → [r, g, b] in 0..255. */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** sRGB channel (0..1) → linear-light. */
export const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4

/** Linear-light channel → sRGB 0..255 int (gamut-clamped). */
export const linearToSrgb255 = (c: number): number => {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(v * 255)))
}

export function hexToOklab(hex: string): Oklab {
  const [r, g, b] = hexToRgb(hex).map((v) => srgbToLinear(v / 255)) as [number, number, number]
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ]
}

/** OKLab → linear-light sRGB triple (shared by the hex round-trip and the luminance path). */
function oklabToLinearRgb([L, a, b]: Oklab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

export function oklabToHex(lab: Oklab): string {
  const [r, g, b] = oklabToLinearRgb(lab)
  return '#' + [r, g, b].map((v) => linearToSrgb255(v).toString(16).padStart(2, '0')).join('')
}

/** color-mix(in oklab, A, B f%) — f is the fraction (0..1) of B. Stays in OKLab (no sRGB round-trip). */
export function mixOklab(A: Oklab, B: Oklab, f: number): Oklab {
  return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]
}

/** color-mix(in oklab, a, b p%) resolved to a concrete hex (p in 0..100; 8-bit quantized). */
export function mixHexOklab(a: string, b: string, p: number): string {
  return oklabToHex(mixOklab(hexToOklab(a), hexToOklab(b), p / 100))
}

/** WCAG relative luminance of an OKLab colour (full precision, gamut-clamped — no hex round-trip). */
export function luminanceFromOklab(lab: Oklab): number {
  const [r, g, b] = oklabToLinearRgb(lab)
  const cl = (v: number) => Math.max(0, Math.min(1, v))
  return 0.2126 * cl(r) + 0.7152 * cl(g) + 0.0722 * cl(b)
}

/** WCAG relative luminance of a hex colour (sRGB). */
export function luminanceFromHex(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * srgbToLinear(r / 255) + 0.7152 * srgbToLinear(g / 255) + 0.0722 * srgbToLinear(b / 255)
}

/** Contrast ratio from two relative luminances (order-independent). */
export function contrastFromLuminance(l1: number, l2: number): number {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}
