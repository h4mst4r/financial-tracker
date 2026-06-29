import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContextMenu } from '../src/components/primitives/ContextMenu'

// Part II · L16 — Gestures: every action has a control + KEYBOARD path (owner: integration test, not a
// checklist). The behaviors are unit-tested in behaviors.test.tsx; this asserts the path survives at the
// COMPOSED-component level on the app's most common action surface — the ⋮ ContextMenu. A pointer-only
// menu (open on click, pick by mouse) would pass a render test but fail this: here the whole interaction
// is driven by the keyboard (open → rove → activate → dismiss), proving the gesture has a keyboard twin.

function renderMenu() {
  const edit = vi.fn()
  const remove = vi.fn()
  render(
    <ContextMenu
      trigger={<span>Actions</span>}
      items={[
        { label: 'Edit', onClick: edit },
        { label: 'Delete', onClick: remove, destructive: true },
      ]}
    />,
  )
  // The trigger composes usePressable host → role="button", keyboard-activatable.
  const trigger = screen.getByRole('button', { name: 'Actions' })
  return { edit, remove, trigger }
}

describe('Part II · L16 — the ⋮ menu is fully keyboard-operable (control + keyboard path)', () => {
  it('opens from the keyboard (Enter on the trigger), not only on mouse click', () => {
    const { trigger } = renderMenu()
    expect(screen.queryByText('Edit')).toBeNull()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('roves with ArrowDown and activates the highlighted row with Enter, then closes', () => {
    const { edit, trigger } = renderMenu()
    fireEvent.click(trigger) // open
    fireEvent.keyDown(document, { key: 'ArrowDown' }) // highlight first actionable row
    fireEvent.keyDown(document, { key: 'Enter' }) // activate it
    expect(edit).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Edit')).toBeNull() // closed after activation
  })

  it('dismisses on Escape', () => {
    const { trigger } = renderMenu()
    fireEvent.click(trigger)
    expect(screen.getByText('Delete')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Delete')).toBeNull()
  })
})
