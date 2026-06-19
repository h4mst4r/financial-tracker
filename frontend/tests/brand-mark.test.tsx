import { render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { BrandMark } from '../src/components/BrandMark'
import { branding } from '../src/config/branding'

// `branding.mark` is undefined in MVP; restore that after any test that sets it (white-label path).
afterEach(() => {
  branding.mark = undefined
})

test('renders the gradient placeholder when branding.mark is unset (MVP default)', () => {
  render(<BrandMark />)
  const el = screen.getByTestId('brand-mark')
  expect(el.tagName).toBe('SPAN')
  expect(el.className).toContain('brand-gradient')
})

test('renders an <img> from branding.mark when set (white-label provision)', () => {
  branding.mark = '/logo.png'
  render(<BrandMark />)
  const el = screen.getByTestId('brand-mark')
  expect(el.tagName).toBe('IMG')
  expect(el).toHaveAttribute('src', '/logo.png')
  // Decorative — must not duplicate the adjacent wordmark for screen readers.
  expect(el).toHaveAttribute('alt', '')
})
