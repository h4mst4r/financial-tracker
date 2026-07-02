import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Tag } from 'lucide-react'
import { Badge, type BadgeVariant } from '../src/components/primitives/Badge'

// Direct Badge coverage (variants + the §5 entity variant). The Badge+Dot / Badge+Icon slot
// integration is covered in dot.test.tsx ("Badge slots").

describe('Badge — variants (§4 semantic + neutral/outline)', () => {
  it('maps each variant to its class set', () => {
    const cases: Array<[BadgeVariant, string]> = [
      ['neutral', 'bg-surface-active'],
      ['outline', 'border-border-strong'],
      ['success', 'bg-success-fill'],
      ['warning', 'bg-warning-fill'],
      ['info', 'bg-info-fill'],
      ['error', 'bg-error-fill'],
    ]
    for (const [variant, cls] of cases) {
      const { getByText, unmount } = render(<Badge variant={variant}>X</Badge>)
      expect(getByText('X').className, `variant ${variant}`).toContain(cls)
      unmount()
    }
  })

  it('a semantic/neutral Badge sets no --entity-colour', () => {
    render(<Badge variant="success">Paid</Badge>)
    expect(screen.getByText('Paid').style.getPropertyValue('--entity-colour')).toBe('')
  })
})

describe('Badge — §5 entity variant (§153/§751)', () => {
  it('renders the entity-axis fill + floor-safe text off a resolved --entity-colour, no raw hex on the text', () => {
    render(<Badge entityColor="#8b5cf6">Groceries</Badge>)
    const el = screen.getByText('Groceries')
    // Entity chip = entity-axis utilities (fill + floor-safe text), not a semantic variant class.
    expect(el.className).toContain('bg-entity-fill-calm')
    expect(el.className).toContain('text-entity-fg')
    expect(el.className).not.toContain('bg-surface-active') // did NOT fall back to neutral
    // The per-instance colour rides on --entity-colour (resolved via useEntityColour; on a
    // non-immersive theme that is the input hex) — never a raw inline text colour.
    expect(el.style.getPropertyValue('--entity-colour')).toMatch(/^#[0-9a-f]{3,6}$/i)
    expect(el.style.color).toBe('')
  })

  it('entityColor overrides variant and still renders an icon slot', () => {
    const { container } = render(
      <Badge variant="success" entityColor="#22c55e" icon={Tag}>
        Tagged
      </Badge>,
    )
    const el = screen.getByText('Tagged')
    expect(el.className).toContain('bg-entity-fill-calm')
    expect(el.className).not.toContain('bg-success-fill') // entity wins over the semantic variant
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
