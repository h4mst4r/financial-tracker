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
    expect(screen.getByRole('button', { name: /11-06-2026/ })).toBeTruthy()
  })

  test('opens the calendar and picks a day → ISO value out', () => {
    const { onChange } = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /11-06-2026/ }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('15 June 2026'))
    expect(onChange).toHaveBeenCalledWith('2026-06-15')
  })

  test('keyboard: arrow + Enter selects relative to the cursor', () => {
    const { onChange } = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /11-06-2026/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'ArrowRight' }) // 11 → 12
    fireEvent.keyDown(dialog, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('2026-06-12')
  })

  test('does not open when disabled', () => {
    renderPicker({ disabled: true })
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
