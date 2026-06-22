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
    // Calm foreground is the entity-derived text (owner exec decision 2026-06-22 — calm is no longer the
    // neutral theme pole); children inherit this hue. Vivid swaps to the contrast pole (text-on-entity).
    expect(card).toHaveClass('text-entity-fg')
    expect(card).not.toHaveClass('text-text-primary')
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

  it('⋮ trigger tints to the entity colour on calm, and the on-entity pole on vivid', () => {
    // Every element on an entity surface tints to the instance colour (icons included) — no flat
    // neutral token. Calm: text-entity (the instance colour). Vivid: inherits the root on-entity pole,
    // muted via opacity (NOT text-text-secondary, which would render light-on-light on a light vivid
    // fill — the white-dots-on-cyan regression).
    const { rerender } = render(
      <EntityCard
        name="Calm"
        colour="#14b8a6"
        menuItems={[{ label: 'Edit', icon: Pencil, onClick: vi.fn() }]}
      />,
    )
    // Calm: entity-tinted, never the flat neutral token.
    expect(screen.getByLabelText('Actions')).toHaveClass('text-entity')
    expect(screen.getByLabelText('Actions')).not.toHaveClass('text-text-secondary')

    rerender(
      <EntityCard
        name="Vivid"
        colour="#14b8a6"
        vivid
        menuItems={[{ label: 'Edit', icon: Pencil, onClick: vi.fn() }]}
      />,
    )
    const trigger = screen.getByLabelText('Actions')
    // Vivid: inherits the root on-entity colour, muted via opacity — no fixed text token.
    expect(trigger).toHaveClass('opacity-70')
    expect(trigger).not.toHaveClass('text-text-secondary')
  })
})
