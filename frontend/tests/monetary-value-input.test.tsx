import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MonetaryValueInput } from '../src/components/primitives/MonetaryValueInput'

function renderMv(over: Partial<Parameters<typeof MonetaryValueInput>[0]> = {}) {
  const onAmountChange = vi.fn()
  const onCurrencyChange = vi.fn()
  render(
    <MonetaryValueInput
      amount="14.99"
      currency="USD"
      currencyOptions={['SGD', 'USD', 'EUR']}
      onAmountChange={onAmountChange}
      onCurrencyChange={onCurrencyChange}
      {...over}
    />,
  )
  return { onAmountChange, onCurrencyChange }
}

describe('MonetaryValueInput', () => {
  test('amount edits emit the raw string (Decimal on the wire, never a float)', () => {
    const { onAmountChange } = renderMv()
    fireEvent.change(screen.getByDisplayValue('14.99'), { target: { value: '20.50' } })
    expect(onAmountChange).toHaveBeenCalledWith('20.50')
  })

  test('currency selector emits the picked code', () => {
    const { onCurrencyChange } = renderMv()
    fireEvent.click(screen.getByRole('button', { name: 'USD' }))
    fireEvent.click(screen.getByRole('option', { name: 'EUR' }))
    expect(onCurrencyChange).toHaveBeenCalledWith('EUR')
  })
})
