import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemePicker } from '../src/components/primitives/ThemePicker'
import { THEME_OPTIONS } from '../src/theme/palettes'

describe('ThemePicker', () => {
  test('renders the selected theme label in the trigger', () => {
    render(<ThemePicker value="retro" onChange={() => {}} />)
    expect(screen.getByText('Retro 70s')).toBeTruthy()
  })

  test('opens to all theme options and calls onChange with the picked id', () => {
    const onChange = vi.fn()
    render(<ThemePicker value="base" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /base \(auto\)/i }))

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(THEME_OPTIONS.length)

    fireEvent.click(screen.getByRole('option', { name: /game boy/i }))
    expect(onChange).toHaveBeenCalledWith('gameboy')
  })

  test('does not open when disabled', () => {
    render(<ThemePicker value="base" onChange={() => {}} disabled />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
