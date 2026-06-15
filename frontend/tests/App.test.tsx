import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import App from '../src/App'

test('App renders without crashing', () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  )
  expect(screen.getByRole('heading', { name: 'Financial Tracker' })).toBeInTheDocument()
})
