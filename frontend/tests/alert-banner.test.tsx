import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AlertBanner } from '../src/components/primitives/AlertBanner'

/* AlertBanner (UX §18 / Containers) — the `stale` data-state surface. Consumes a §4 tone → §3 tint +
   §11 registry glyph; body text = §2 default. No raw hue/lucide at the call site. */

describe('AlertBanner', () => {
  it('renders the body text', () => {
    render(<AlertBanner tone="warning">Rates may be out of date</AlertBanner>)
    expect(screen.getByText('Rates may be out of date')).toBeInTheDocument()
  })

  it('warning tone (= stale) renders the §3 warning tint + a status glyph', () => {
    const { container } = render(<AlertBanner tone="warning">stale</AlertBanner>)
    const banner = container.firstElementChild as HTMLElement
    expect(banner.className).toContain('bg-warning-fill')
    expect(banner.className).toContain('text-warning')
    // The §11 STATUS_ICON glyph renders (icon carries the tone colour via currentColor).
    expect(banner.querySelector('svg')).not.toBeNull()
  })

  it('info tone renders the info tint', () => {
    const { container } = render(<AlertBanner tone="info">note</AlertBanner>)
    expect((container.firstElementChild as HTMLElement).className).toContain('bg-info-fill')
  })

  it('neutral tone carries no glyph (STATUS_ICON.neutral is null)', () => {
    const { container } = render(<AlertBanner tone="neutral">plain</AlertBanner>)
    const banner = container.firstElementChild as HTMLElement
    expect(banner.className).toContain('bg-surface-active')
    expect(banner.querySelector('svg')).toBeNull()
  })

  it('body uses §2 default (not the tone colour) for legibility on the tint', () => {
    render(<AlertBanner tone="warning">body</AlertBanner>)
    // The body wrapper carries text-text-default, overriding the container's tone colour.
    expect(screen.getByText('body').className).toContain('text-text-default')
  })

  it('renders an optional title (§2 strong) and a trailing action', () => {
    render(
      <AlertBanner tone="warning" title="Heads up" action={<button>Retry</button>}>
        body
      </AlertBanner>,
    )
    expect(screen.getByText('Heads up').className).toContain('text-text-strong')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('uses radius-md (matches the bible #alertbanner) — no raw hex/opacity', () => {
    const { container } = render(<AlertBanner tone="warning">x</AlertBanner>)
    const cls = (container.firstElementChild as HTMLElement).className
    expect(cls).toContain('rounded-md')
    expect(cls).not.toMatch(/#[0-9a-fA-F]{3,6}/)
    expect(cls).not.toMatch(/opacity-/)
  })
})
