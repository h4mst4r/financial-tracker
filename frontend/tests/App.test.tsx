import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from '../src/App'

test('App renders without crashing', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Financial Tracker' })).toBeInTheDocument()
})
