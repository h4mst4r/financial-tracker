import { describe, it, expect, vi } from 'vitest'
import { useRef, useState } from 'react'
import { render, screen, fireEvent, renderHook } from '@testing-library/react'
import { usePressable } from '../src/components/primitives/behaviors/usePressable'
import { useField } from '../src/components/primitives/behaviors/useField'
import { useMenu } from '../src/components/primitives/behaviors/useMenu'
import { usePopover } from '../src/components/primitives/behaviors/usePopover'

// Headless coverage for the four interaction behaviors (UX "Behaviors", L0). The 13 recomposed
// primitives exercise these end-to-end; these tests pin each behavior's contract in isolation.

/* ── usePressable ── */

describe('usePressable', () => {
  it('host mode: role/tabIndex + Enter/Space activate', () => {
    const onPress = vi.fn()
    const { result } = renderHook(() => usePressable({ host: true, onPress }))
    expect(result.current.role).toBe('button')
    expect(result.current.tabIndex).toBe(0)
    result.current.onKeyDown({ key: 'Enter', preventDefault: vi.fn() } as never)
    result.current.onKeyDown({ key: ' ', preventDefault: vi.fn() } as never)
    expect(onPress).toHaveBeenCalledTimes(2)
  })

  it('host mode: disabled removes from tab order and blocks activation', () => {
    const onPress = vi.fn()
    const { result } = renderHook(() => usePressable({ host: true, disabled: true, onPress }))
    expect(result.current.tabIndex).toBe(-1)
    expect(result.current['aria-disabled']).toBe(true)
    result.current.onClick({} as never)
    result.current.onKeyDown({ key: 'Enter', preventDefault: vi.fn() } as never)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('native mode: returns a disabled-gated onClick only', () => {
    const onPress = vi.fn()
    const { result, rerender } = renderHook(
      ({ disabled }: { disabled: boolean }) => usePressable({ disabled, onPress }),
      { initialProps: { disabled: false } },
    )
    expect('role' in result.current).toBe(false)
    result.current.onClick({} as never)
    expect(onPress).toHaveBeenCalledTimes(1)
    rerender({ disabled: true })
    result.current.onClick({} as never)
    expect(onPress).toHaveBeenCalledTimes(1) // gated — no further calls
  })
})

/* ── useField ── */

describe('useField', () => {
  it('gates change while disabled and emits while enabled', () => {
    const onChange = vi.fn()
    const { result, rerender } = renderHook(
      ({ disabled }: { disabled: boolean }) => useField<string>({ onChange, disabled }),
      { initialProps: { disabled: false } },
    )
    result.current.change('a')
    expect(onChange).toHaveBeenCalledWith('a')
    rerender({ disabled: true })
    result.current.change('b')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('uses the supplied id, else a stable generated one', () => {
    const withId = renderHook(() => useField<string>({ id: 'given' }))
    expect(withId.result.current.fieldId).toBe('given')
    const auto = renderHook(() => useField<string>({}))
    expect(auto.result.current.fieldId).toBeTruthy()
  })
})

/* ── useMenu ── */

function MenuHarness({ onActivate, onClose }: { onActivate: (i: number) => void; onClose: () => void }) {
  const { activeIndex, onKeyDown } = useMenu({ itemCount: 3, onActivate, onClose })
  return (
    <div data-testid="menu" tabIndex={0} onKeyDown={onKeyDown}>
      active:{activeIndex}
    </div>
  )
}

describe('useMenu', () => {
  it('rolls the active index with arrows (clamped), activates on Enter, closes on Escape', () => {
    const onActivate = vi.fn()
    const onClose = vi.fn()
    render(<MenuHarness onActivate={onActivate} onClose={onClose} />)
    const el = screen.getByTestId('menu')
    expect(el.textContent).toContain('active:-1')
    fireEvent.keyDown(el, { key: 'ArrowDown' }) // -1 → 0
    fireEvent.keyDown(el, { key: 'ArrowDown' }) // 0 → 1
    expect(el.textContent).toContain('active:1')
    fireEvent.keyDown(el, { key: 'ArrowUp' }) // 1 → 0
    fireEvent.keyDown(el, { key: 'ArrowUp' }) // clamps at 0
    expect(el.textContent).toContain('active:0')
    fireEvent.keyDown(el, { key: 'Enter' })
    expect(onActivate).toHaveBeenCalledWith(0)
    fireEvent.keyDown(el, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not activate when no row is highlighted', () => {
    const onActivate = vi.fn()
    render(<MenuHarness onActivate={onActivate} onClose={vi.fn()} />)
    fireEvent.keyDown(screen.getByTestId('menu'), { key: 'Enter' })
    expect(onActivate).not.toHaveBeenCalled()
  })
})

/* ── usePopover ── */

function PopoverHarness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true)
  const containRef = useRef<HTMLDivElement>(null)
  usePopover({
    open,
    onClose: () => {
      setOpen(false)
      onClose()
    },
    containRef,
  })
  return (
    <div>
      <button>outside</button>
      {open && (
        <div ref={containRef} data-testid="panel">
          <button>inside</button>
        </div>
      )}
    </div>
  )
}

describe('usePopover', () => {
  it('dismisses on Escape', () => {
    const onClose = vi.fn()
    render(<PopoverHarness onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('dismisses on an outside press but NOT on a press inside the contain element', () => {
    const onClose = vi.fn()
    render(<PopoverHarness onClose={onClose} />)
    fireEvent.mouseDown(screen.getByText('inside')) // inside the panel — stays open
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(screen.getByText('outside')) // outside — dismisses
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
