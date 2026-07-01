import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Avatar } from '../src/components/primitives/Avatar'

// FRONTEND-AUDIT B9 — the avatar initials (and the "+N" overflow count) render at the one legible ratio
// locked in UX §8: font-size = ×0.40 of the avatar size. Guard the ratio so it can't drift back to the
// old inconsistent 0.38/0.4 split. size=100 makes the expected px exact (40) with no rounding ambiguity.

describe('Avatar — initials font size = ×0.40 of the avatar size (UX §8, FRONTEND-AUDIT B9)', () => {
  it('person initials size at the locked ratio', () => {
    render(<Avatar name="Ben Ten" size={100} />)
    const el = screen.getByRole('img', { name: 'Ben Ten' })
    expect(el.style.fontSize).toBe('40px') // 100 × 0.40
  })

  it('"+N" overflow count uses the same ratio', () => {
    render(<Avatar overflow={3} size={100} />)
    const el = screen.getByRole('img', { name: '3 more' })
    expect(el.style.fontSize).toBe('40px') // 100 × 0.40
  })
})
