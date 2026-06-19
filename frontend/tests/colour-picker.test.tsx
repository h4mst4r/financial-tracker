import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ColourPicker } from '../src/components/primitives/ColourPicker'

function renderPicker(over: Partial<Parameters<typeof ColourPicker>[0]> = {}) {
  const onChange = vi.fn()
  const onVividChange = vi.fn()
  render(
    <ColourPicker
      value="#3b82f6"
      onChange={onChange}
      vivid={false}
      onVividChange={onVividChange}
      {...over}
    />,
  )
  return { onChange, onVividChange }
}

describe('ColourPicker', () => {
  test('opens the panel and picks a palette swatch', () => {
    const { onChange } = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /3b82f6/i }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('#8b5cf6'))
    expect(onChange).toHaveBeenCalledWith('#8b5cf6')
  })

  test('Hex tab commits a valid hex only', () => {
    const { onChange } = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /3b82f6/i }))
    fireEvent.click(screen.getByText('Hex'))
    const input = screen.getByPlaceholderText('#3b82f6')
    fireEvent.change(input, { target: { value: '#abc' } }) // incomplete → no commit
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '#aabbcc' } })
    expect(onChange).toHaveBeenCalledWith('#aabbcc')
  })

  test('Hex tab exposes a native colour-wheel input', () => {
    const { onChange } = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /3b82f6/i }))
    fireEvent.click(screen.getByText('Hex'))
    const wheel = screen.getByLabelText('Colour wheel') as HTMLInputElement
    expect(wheel.type).toBe('color')
    fireEvent.change(wheel, { target: { value: '#10b981' } })
    expect(onChange).toHaveBeenCalledWith('#10b981')
  })

  test('vivid toggle flips the per-instance flag', () => {
    const { onVividChange } = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /3b82f6/i }))
    fireEvent.click(screen.getByLabelText('Vivid fill'))
    expect(onVividChange).toHaveBeenCalledWith(true)
  })

  test('does not open when disabled', () => {
    renderPicker({ disabled: true })
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
