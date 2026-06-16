import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Pencil } from 'lucide-react'
import { EntityCard } from '../src/components/entity'

describe('EntityCard (story 1.9b)', () => {
  it('renders name, hero, and meta slots', () => {
    render(<EntityCard name="DBS Multiplier" hero="S$ 12,840" meta="bank · SGD" />)
    expect(screen.getByText('DBS Multiplier')).toBeInTheDocument()
    expect(screen.getByText('S$ 12,840')).toBeInTheDocument()
    expect(screen.getByText('bank · SGD')).toBeInTheDocument()
  })

  it('applies the calm fill by default and sets --entity-colour inline', () => {
    render(<EntityCard name="Calm" colour="#6366f1" />)
    const card = screen.getByTestId('entity-card')
    expect(card).toHaveClass('bg-entity-fill-calm')
    expect(card).not.toHaveClass('bg-entity-fill-vivid')
    expect(card.style.getPropertyValue('--entity-colour')).toBe('#6366f1')
    // Calm keeps the normal text colour (no contrast-aware override).
    expect(card).toHaveClass('text-text-primary')
  })

  it('applies the vivid fill with contrast-aware text + on-colour variable', () => {
    render(<EntityCard name="Vivid" colour="#6366f1" vivid />)
    const card = screen.getByTestId('entity-card')
    expect(card).toHaveClass('bg-entity-fill-vivid')
    expect(card).toHaveClass('text-on-entity')
    // contrastText picks white for the dark indigo fill.
    expect(card.style.getPropertyValue('--entity-on-colour')).toBe('#ffffff')
  })

  it('shows a pressed solid star when favourited and toggles without opening the card', () => {
    const onToggleFavourite = vi.fn()
    const onClick = vi.fn()
    render(
      <EntityCard name="Star" favourite onToggleFavourite={onToggleFavourite} onClick={onClick} />,
    )
    const star = screen.getByTestId('entity-card-favourite')
    expect(star).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(star)
    expect(onToggleFavourite).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('opens via the stretched body button', () => {
    const onClick = vi.fn()
    render(<EntityCard name="Open me" onClick={onClick} />)
    fireEvent.click(screen.getByTestId('entity-card-open'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders the archived treatment (opacity, dashed border, badge)', () => {
    render(<EntityCard name="Old Vault" archived />)
    const card = screen.getByTestId('entity-card')
    expect(card).toHaveClass('opacity-60')
    expect(card).toHaveClass('border-dashed')
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })

  it('renders the selected treatment (offset ring + corner check)', () => {
    render(<EntityCard name="Selected" selected />)
    const card = screen.getByTestId('entity-card')
    expect(card).toHaveClass('ring-accent')
    expect(screen.getByTestId('entity-card-check')).toBeInTheDocument()
  })

  it('renders a ⋮ context menu only when menuItems are supplied', () => {
    const { rerender } = render(<EntityCard name="No menu" />)
    expect(screen.queryByLabelText('Actions')).not.toBeInTheDocument()

    rerender(
      <EntityCard
        name="With menu"
        menuItems={[{ label: 'Edit', icon: Pencil, onClick: vi.fn() }]}
      />,
    )
    expect(screen.getByLabelText('Actions')).toBeInTheDocument()
  })
})
