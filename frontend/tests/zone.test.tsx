import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Zone } from '../src/components/primitives/Zone'

describe('Zone', () => {
  it('is neutral + solid by default', () => {
    const { getByTestId } = render(<Zone data-testid="z">x</Zone>)
    const z = getByTestId('z')
    expect(z.className).toContain('border-border')
    expect(z.className).toContain('bg-surface')
    expect(z.className).not.toContain('border-dashed')
  })

  it('renders a dashed border when border="dashed"', () => {
    const { getByTestId } = render(
      <Zone data-testid="z" border="dashed">
        x
      </Zone>,
    )
    expect(getByTestId('z').className).toContain('border-dashed')
  })

  it('error tone uses the §4 error hue', () => {
    const { getByTestId } = render(
      <Zone data-testid="z" tone="error">
        x
      </Zone>,
    )
    const z = getByTestId('z')
    expect(z.className).toContain('border-border-error')
    expect(z.className).toContain('bg-error-fill')
    expect(z.className).toContain('text-error')
  })

  it('dimmed applies container opacity (placeholder)', () => {
    const { getByTestId } = render(
      <Zone data-testid="z" dimmed>
        x
      </Zone>,
    )
    expect(getByTestId('z').className).toContain('opacity-60')
  })

  it('active applies the §6 solid accent-primary drop highlight, overriding the tone', () => {
    const { getByTestId } = render(
      <Zone data-testid="z" tone="neutral" active>
        x
      </Zone>,
    )
    const z = getByTestId('z')
    expect(z.className).toContain('ring-primary')
    expect(z.className).toContain('bg-primary-muted')
    expect(z.className).not.toContain('bg-surface') // resting tone is overridden while active
  })

  it('forwards ref and passes through className + children', () => {
    let el: HTMLDivElement | null = null
    const { getByText } = render(
      <Zone
        ref={(n) => {
          el = n
        }}
        className="custom-marker"
      >
        hello
      </Zone>,
    )
    expect(getByText('hello')).toBeTruthy()
    expect(el).not.toBeNull()
    expect(el!.className).toContain('custom-marker')
  })
})
