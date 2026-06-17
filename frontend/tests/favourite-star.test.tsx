import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FavouriteStar } from '../src/components/primitives/FavouriteStar'

describe('FavouriteStar', () => {
  it('off: outline gold star, aria-pressed=false, "Favourite" label', () => {
    const { container } = render(<FavouriteStar favourite={false} onToggle={() => {}} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveAccessibleName('Favourite')
    // gold in both states (§2.3: distinction is fill, not colour); off is the outline (fill="none")
    expect(button.className).toContain('text-favourite')
    expect(button.className).not.toContain('text-text-muted')
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'none')
  })

  it('on: solid gold star, aria-pressed=true, "Unfavourite" label', () => {
    const { container } = render(<FavouriteStar favourite onToggle={() => {}} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveAccessibleName('Unfavourite')
    expect(button.className).toContain('text-favourite')
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
  })

  it('aria-label overrides the default in either state', () => {
    render(<FavouriteStar favourite aria-label="Pin to top" onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveAccessibleName('Pin to top')
  })

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn()
    render(<FavouriteStar favourite={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('stops propagation so a toggle never fires an ancestor click handler', () => {
    const onToggle = vi.fn()
    const parentClick = vi.fn()
    render(
      <div onClick={parentClick}>
        <FavouriteStar favourite={false} onToggle={onToggle} />
      </div>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(parentClick).not.toHaveBeenCalled()
  })

  it('carries no literal hex — colour flows through the token utilities (AC2)', () => {
    const { container } = render(<FavouriteStar favourite onToggle={() => {}} />)
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('passes data-testid through to the button', () => {
    render(<FavouriteStar favourite={false} onToggle={() => {}} data-testid="entity-card-favourite" />)
    expect(screen.getByTestId('entity-card-favourite')).toBeInTheDocument()
  })

  it('respects a custom size on the star glyph', () => {
    const { container } = render(<FavouriteStar favourite={false} onToggle={() => {}} size={24} />)
    expect(container.querySelector('svg')).toHaveAttribute('width', '24')
  })
})
