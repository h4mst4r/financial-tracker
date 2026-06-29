import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input, Dropdown, SegmentedControl, Checkbox, Button } from '../src/components/primitives'

// Story 5f-5 — Emphasis & Disabled Cleanup. Two guards:
//  1. §3a disabled wiring — every control routes through the ONE `disabled` utility (no opacity).
//  2. §2 faint stop — the new emphasis token is solved to the 3:1 sub-floor (distinct from muted's 4.5:1
//     floor). jsdom can't compute color-mix, so the value is guarded with the same OKLab-mix + WCAG-contrast
//     math the CSS `color-mix(in oklab, …)` token uses (mirrors theme/colour.ts).

describe('§3a disabled — one utility, no opacity (B14/L5)', () => {
  const dropOpts = [{ value: 'a', label: 'A' }]

  it('Input disabled carries the `disabled` utility, never opacity', () => {
    const { container } = render(<Input disabled />)
    const input = container.querySelector('input')!
    expect(input.className).toContain('disabled')
    expect(input.className).not.toMatch(/opacity-\d/)
  })

  it('Dropdown disabled trigger carries the `disabled` utility', () => {
    render(<Dropdown value="a" options={dropOpts} onChange={vi.fn()} disabled />)
    const trigger = screen.getByRole('button')
    expect(trigger.className).toContain('disabled')
    expect(trigger.className).not.toMatch(/opacity-\d/)
  })

  it('SegmentedControl disabled segments carry the `disabled` utility', () => {
    render(
      <SegmentedControl
        value="a"
        options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]}
        onChange={vi.fn()}
        disabled
      />,
    )
    expect(screen.getByRole('button', { name: 'A' }).className).toContain('disabled')
  })

  it('Checkbox disabled carries the `disabled` utility on the box', () => {
    const { container } = render(<Checkbox checked={false} onChange={vi.fn()} disabled aria-label="cb" />)
    const box = container.querySelector('span')! // the box span (first span in the label)
    expect(box.className).toContain('disabled')
  })

  it('Button disabled overrides the variant fill via the `disabled` utility (not opacity)', () => {
    render(<Button variant="primary" disabled>Go</Button>)
    const btn = screen.getByRole('button', { name: 'Go' })
    expect(btn.className).toContain('disabled')
    expect(btn.className).not.toMatch(/opacity-\d/)
    expect(btn).toBeDisabled()
  })
})

describe('§2 faint stop — solved to the 3:1 sub-floor (distinct from muted 4.5:1)', () => {
  // OKLab mix matching CSS `color-mix(in oklab, pole, surface e%)`; WCAG contrast on sRGB luminance.
  const hexToRgb = (h: string): [number, number, number] => {
    const n = parseInt(h.replace('#', ''), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
  const unlin = (c: number) => {
    const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
    return Math.max(0, Math.min(255, Math.round(v * 255)))
  }
  const toOklab = (hex: string): [number, number, number] => {
    const [r, g, b] = hexToRgb(hex).map((v) => lin(v)) as [number, number, number]
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ]
  }
  const fromOklab = ([L, A, B]: [number, number, number]): string => {
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
    const R = unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
    const G = unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
    const Bb = unlin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
    return '#' + [R, G, Bb].map((v) => v.toString(16).padStart(2, '0')).join('')
  }
  const mix = (a: string, b: string, p: number) => {
    const oa = toOklab(a)
    const ob = toOklab(b)
    const t = p / 100
    return fromOklab([oa[0] + (ob[0] - oa[0]) * t, oa[1] + (ob[1] - oa[1]) * t, oa[2] + (ob[2] - oa[2]) * t])
  }
  const relLum = (hex: string) => {
    const [r, g, b] = hexToRgb(hex)
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  }
  const contrast = (a: string, b: string) => {
    const la = relLum(a)
    const lb = relLum(b)
    const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
    return (hi + 0.05) / (lo + 0.05)
  }

  // base-dark: --text-pole #fff over --color-surface = mix(--ramp-lo #080817, --ramp-hi #4f5070, --f-surface 22%).
  const pole = '#ffffff'
  const surface = mix('#080817', '#4f5070', 22)
  const E_MUTED = 46 // --e-text-muted (the 4.5:1 floor)
  const E_FAINT = 63 // --e-text-faint (the 3:1 sub-floor)

  it('muted clears the §0.11 4.5:1 floor', () => {
    expect(contrast(mix(pole, surface, E_MUTED), surface)).toBeGreaterThanOrEqual(4.5)
  })

  it('faint lands at the 3:1 sub-floor — below the muted floor, not below 2.7', () => {
    const c = contrast(mix(pole, surface, E_FAINT), surface)
    expect(c).toBeLessThan(4.5)
    expect(c).toBeGreaterThanOrEqual(2.7)
    expect(c).toBeLessThanOrEqual(3.3)
  })

  it('faint is strictly fainter than muted (lower contrast)', () => {
    expect(contrast(mix(pole, surface, E_FAINT), surface)).toBeLessThan(
      contrast(mix(pole, surface, E_MUTED), surface),
    )
  })
})
