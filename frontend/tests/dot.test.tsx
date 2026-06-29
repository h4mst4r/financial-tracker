import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Tag } from 'lucide-react'
import { Dot } from '../src/components/primitives/Dot'
import { Badge } from '../src/components/primitives/Badge'

describe('Dot', () => {
  it('maps each §4 tone to its solid fill utility', () => {
    const cases: Array<[Parameters<typeof Dot>[0]['tone'], string]> = [
      ['positive', 'bg-success-solid'],
      ['warning', 'bg-warning-solid'],
      ['critical', 'bg-error-solid'],
      ['info', 'bg-info-solid'],
      ['neutral', 'bg-border-strong'],
      ['accent', 'bg-accent-solid'],
    ]
    for (const [tone, cls] of cases) {
      const { getByTestId, unmount } = render(<Dot data-testid="d" tone={tone} />)
      expect(getByTestId('d').className, `tone ${tone}`).toContain(cls)
      unmount()
    }
  })

  it('is a round circle', () => {
    const { getByTestId } = render(<Dot data-testid="d" tone="info" />)
    expect(getByTestId('d').className).toContain('rounded-full')
  })

  it('a legend series colour applies via inline style and skips the tone utility', () => {
    const { getByTestId } = render(<Dot data-testid="d" color="#a855f7" />)
    const d = getByTestId('d')
    expect(d.style.backgroundColor).toBe('rgb(168, 85, 247)')
    expect(d.className).not.toContain('bg-success-solid')
  })
})

describe('Badge slots (line 393)', () => {
  it('renders a leading status Dot tinted to the variant when dot is set', () => {
    const { container } = render(
      <Badge variant="success" dot>
        Paid
      </Badge>,
    )
    const dot = container.querySelector('.rounded-full')
    expect(dot).not.toBeNull()
    expect(dot!.className).toContain('bg-success-solid') // success variant → positive dot
  })

  it('renders a leading icon glyph when icon is set', () => {
    const { container } = render(
      <Badge variant="neutral" icon={Tag}>
        Tag
      </Badge>,
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
