import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MonetaryValue, DateValue, NumberValue } from '../src/components/primitives'

// §7 locked format: symbol prefix + space, comma/dot, currency minor-units, leading − (U+2212),
// null → — at muted. The atoms own the format so no figure is hand-formatted at a call site (L11).

describe('MonetaryValue (§7)', () => {
  it('renders symbol prefix + space, comma thousands, dot decimal, 2dp fiat', () => {
    const { container } = render(<MonetaryValue amount="1234.5" currency="SGD" symbol="S$" />)
    expect(container.textContent).toBe('S$ 1,234.50')
  })

  it('uses the currency Intl minor-units (JPY → 0dp)', () => {
    const { container } = render(<MonetaryValue amount="2500" currency="JPY" symbol="¥" />)
    expect(container.textContent).toBe('¥ 2,500')
  })

  it('falls back to the ISO narrow symbol when none is given', () => {
    const { container } = render(<MonetaryValue amount="10" currency="EUR" />)
    expect(container.textContent).toBe('€ 10.00')
  })

  it('renders a leading − (U+2212), never a hyphen or parentheses', () => {
    const { container } = render(<MonetaryValue amount="-84.2" currency="SGD" symbol="S$" />)
    expect(container.textContent).toBe('−S$ 84.20')
    expect(container.textContent).not.toContain('-') // not a hyphen-minus
    expect(container.textContent).not.toContain('(')
  })

  it('shows a leading + for positives only with showSign', () => {
    const plain = render(<MonetaryValue amount="1250" currency="SGD" symbol="S$" />)
    expect(plain.container.textContent).toBe('S$ 1,250.00')
    const signed = render(<MonetaryValue amount="1250" currency="SGD" symbol="S$" showSign />)
    expect(signed.container.textContent).toBe('+S$ 1,250.00')
  })

  it('applies text-error / text-success by sign when signColour is set', () => {
    const out = render(<MonetaryValue amount="-5" currency="SGD" symbol="S$" signColour />)
    expect(out.container.querySelector('.text-error')).not.toBeNull()
    const inflow = render(<MonetaryValue amount="5" currency="SGD" symbol="S$" signColour />)
    expect(inflow.container.querySelector('.text-success')).not.toBeNull()
  })

  it('does not colour without signColour', () => {
    const { container } = render(<MonetaryValue amount="-5" currency="SGD" symbol="S$" />)
    expect(container.querySelector('.text-error')).toBeNull()
  })

  it('columnar variant carries the mono/tabular utility; hero does not', () => {
    const col = render(<MonetaryValue amount="5" currency="SGD" symbol="S$" variant="columnar" />)
    expect(col.container.querySelector('.monetary-value')).not.toBeNull()
    const hero = render(<MonetaryValue amount="5" currency="SGD" symbol="S$" variant="hero" />)
    expect(hero.container.querySelector('.monetary-value')).toBeNull()
  })

  it('renders the dual cross-currency form with one arrow', () => {
    const { container } = render(
      <MonetaryValue amount="500" currency="SGD" symbol="S$" dual={{ amount: '568', currency: 'NZD', symbol: 'NZ$' }} />,
    )
    expect(container.textContent).toBe('S$ 500.00 → NZ$ 568.00')
    expect(container.textContent!.match(/→/g)).toHaveLength(1)
  })

  it('renders null as — at text-muted', () => {
    const { container } = render(<MonetaryValue amount={null} currency="SGD" />)
    expect(container.textContent).toBe('—')
    expect(container.querySelector('.text-text-muted')).not.toBeNull()
  })
})

describe('DateValue (§7)', () => {
  it('honours an explicit display format', () => {
    expect(render(<DateValue iso="2026-06-29" format="YYYY-MM-DD" />).container.textContent).toBe('2026-06-29')
    expect(render(<DateValue iso="2026-06-29" format="DD-MM-YYYY" />).container.textContent).toBe('29-06-2026')
    expect(render(<DateValue iso="2026-06-29" format="MM-DD-YYYY" />).container.textContent).toBe('06-29-2026')
  })

  it('renders null as — at text-muted', () => {
    const { container } = render(<DateValue iso={null} />)
    expect(container.textContent).toBe('—')
    expect(container.querySelector('.text-text-muted')).not.toBeNull()
  })
})

describe('NumberValue (§7)', () => {
  it('formats with comma thousands and fixed decimals', () => {
    expect(render(<NumberValue value={12345} />).container.textContent).toBe('12,345')
    expect(render(<NumberValue value="2.5" decimals={1} suffix="%" />).container.textContent).toBe('2.5%')
  })

  it('renders a leading − and applies sign colour', () => {
    const { container } = render(<NumberValue value="-3.4" decimals={1} signColour showSign />)
    expect(container.textContent).toBe('−3.4')
    expect(container.querySelector('.text-error')).not.toBeNull()
  })

  it('renders null as — at text-muted', () => {
    const { container } = render(<NumberValue value={null} />)
    expect(container.textContent).toBe('—')
    expect(container.querySelector('.text-text-muted')).not.toBeNull()
  })
})
