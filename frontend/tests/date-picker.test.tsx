import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DatePicker } from '../src/components/primitives/DatePicker'

function renderPicker(over: Partial<Parameters<typeof DatePicker>[0]> = {}) {
  const onChange = vi.fn()
  render(<DatePicker value="2026-06-11" onChange={onChange} {...over} />)
  return { onChange }
}

describe('DatePicker', () => {
  test('renders the ISO value through the per-person display format (default DD-MM-YYYY)', () => {
    renderPicker()
    // The value lives in the typeable input (UX line 437), not a button label.
    expect(screen.getByDisplayValue('11-06-2026')).toBeTruthy()
  })

  test('opens the calendar via the Calendar-icon button and picks a day → ISO value out', () => {
    const { onChange } = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('15 June 2026'))
    expect(onChange).toHaveBeenCalledWith('2026-06-15')
  })

  test('typing a valid date parses to ISO and fires onChange (line 437)', () => {
    const { onChange } = renderPicker()
    fireEvent.change(screen.getByDisplayValue('11-06-2026'), { target: { value: '20-06-2026' } })
    expect(onChange).toHaveBeenCalledWith('2026-06-20')
  })

  test('typing an unparseable string does not fire onChange', () => {
    const { onChange } = renderPicker()
    fireEvent.change(screen.getByDisplayValue('11-06-2026'), { target: { value: 'not-a-date' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  test('keyboard: arrow + Enter selects relative to the cursor', () => {
    const { onChange } = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
    // The roving keyboard handler lives on the day grid (a11y: role="grid" supports it; focus rests on
    // the cursor day button and arrow keys bubble up to the grid).
    const grid = screen.getByRole('grid')
    fireEvent.keyDown(grid, { key: 'ArrowRight' }) // 11 → 12
    fireEvent.keyDown(grid, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('2026-06-12')
  })

  test('the calendar button does not open when disabled', () => {
    renderPicker({ disabled: true })
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
