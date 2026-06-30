import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MoreVertical } from 'lucide-react'
import { Button, Icon } from '../src/components/primitives'
import { PRESS_SCALE, DISABLED_CLASS } from '../src/components/primitives/behaviors/usePressable'

// Story 5F.9 — the seven-variant Button (filled/outline/ghost/danger/text/link/icon) + the value-preserving
// primary→filled / secondary→outline rename. These guard (a) that the rename is value-preserving (filled
// still carries the old `primary` fill, outline the old `secondary` surface), (b) the new variants' locked
// signatures, and (c) that the §13 press-scale / §3a disabled append survives on every variant.

function classOf(name: string) {
  return screen.getByRole('button', { name }).className
}

describe('Button — seven-variant set (5F.9)', () => {
  it('filled is the value-preserving rename of primary (accent fill + on-primary text)', () => {
    render(<Button variant="filled">Filled</Button>)
    const cls = classOf('Filled')
    expect(cls).toContain('bg-primary')
    expect(cls).toContain('text-on-primary')
    expect(cls).toContain('h-control')
  })

  it('outline is the value-preserving rename of secondary (raised surface + border)', () => {
    render(<Button variant="outline">Outline</Button>)
    const cls = classOf('Outline')
    expect(cls).toContain('bg-surface-raised')
    expect(cls).toContain('border')
    expect(cls).toContain('h-control')
  })

  it('filled is the default variant', () => {
    render(<Button>Default</Button>)
    const cls = classOf('Default')
    expect(cls).toContain('bg-primary')
    expect(cls).toContain('text-on-primary')
  })

  it('text is a neutral borderless text button (frame, no border)', () => {
    render(<Button variant="text">Text</Button>)
    const cls = classOf('Text')
    expect(cls).toContain('h-control')
    expect(cls).toContain('bg-transparent')
    expect(cls).not.toContain('border')
  })

  it('link is a frameless accent hyperlink (no frame, accent text, hover underline)', () => {
    render(<Button variant="link">Link</Button>)
    const cls = classOf('Link')
    expect(cls).toContain('text-accent')
    expect(cls).toContain('underline-offset-2')
    expect(cls).not.toContain('h-control')
    expect(cls).not.toContain('px-md')
  })

  it('icon is a bare, size-to-child affordance (centered + p-2xs hit-area, no control-height square, no set colour)', () => {
    render(
      <Button variant="icon" aria-label="More">
        <Icon icon={MoreVertical} size={16} />
      </Button>,
    )
    const cls = classOf('More')
    expect(cls).toContain('inline-flex')
    expect(cls).toContain('p-2xs')
    expect(cls).not.toContain('h-control')
    expect(cls).not.toContain('aspect-square')
    // Colour comes from the caller / inherited currentColor — the variant pins no text-* colour.
    expect(cls).not.toContain('text-text-strong')
    expect(cls).not.toContain('text-accent')
  })

  it('an enabled button carries the §13 press-scale; a disabled one carries the §3a disabled treatment', () => {
    render(
      <>
        <Button variant="filled">Enabled</Button>
        <Button variant="filled" disabled>
          Off
        </Button>
      </>,
    )
    expect(classOf('Enabled')).toContain(PRESS_SCALE)
    const off = classOf('Off')
    expect(off).toContain(DISABLED_CLASS)
    expect(off).not.toContain('active:scale-[0.97]')
    expect(off).not.toMatch(/opacity-\d/)
  })

  it('renders all seven variants (smoke)', () => {
    render(
      <>
        <Button variant="filled">f</Button>
        <Button variant="outline">o</Button>
        <Button variant="ghost">g</Button>
        <Button variant="danger">d</Button>
        <Button variant="text">t</Button>
        <Button variant="link">l</Button>
        <Button variant="icon" aria-label="i">
          <Icon icon={MoreVertical} size={16} />
        </Button>
      </>,
    )
    for (const name of ['f', 'o', 'g', 'd', 't', 'l', 'i']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })
})
