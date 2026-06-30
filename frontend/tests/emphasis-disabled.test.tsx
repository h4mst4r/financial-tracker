import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input, Dropdown, SegmentedControl, Checkbox, Button } from '../src/components/primitives'
import { mixHexOklab, luminanceFromHex, contrastFromLuminance } from './helpers/oklab'

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
  // OKLab mix matching CSS `color-mix(in oklab, pole, surface e%)` resolved to a concrete swatch, then
  // WCAG contrast on its sRGB luminance — the shared test-only re-derivation (tests/helpers/oklab.ts).
  const mix = mixHexOklab
  const contrast = (a: string, b: string) =>
    contrastFromLuminance(luminanceFromHex(a), luminanceFromHex(b))

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
