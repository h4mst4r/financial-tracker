import { describe, it, expect, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { useAppearance } from '../src/theme/useAppearance'
import { useThemeStore } from '../src/stores/themeStore'

function Harness() {
  useAppearance()
  return null
}

beforeEach(() => {
  act(() => useThemeStore.setState({ theme: 'base', font: 'base', reduceMotion: false }))
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-font')
  document.documentElement.removeAttribute('data-reduce-motion')
})

describe('useAppearance', () => {
  it('applies a non-base theme as data-theme', () => {
    render(<Harness />)
    act(() => useThemeStore.getState().setTheme('retro'))
    expect(document.documentElement.dataset.theme).toBe('retro')
  })

  it("resolves 'base' to base-dark (cleared attribute) when the OS is not light", () => {
    render(<Harness />)
    act(() => useThemeStore.getState().setTheme('gameboy'))
    expect(document.documentElement.dataset.theme).toBe('gameboy')
    act(() => useThemeStore.getState().setTheme('base'))
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('applies the font via data-font and clears it for base', () => {
    render(<Harness />)
    act(() => useThemeStore.getState().setFont('mono'))
    expect(document.documentElement.dataset.font).toBe('mono')
    act(() => useThemeStore.getState().setFont('base'))
    expect(document.documentElement.dataset.font).toBeUndefined()
  })

  it('applies data-reduce-motion="true" when setReduceMotion(true)', () => {
    render(<Harness />)
    act(() => useThemeStore.getState().setReduceMotion(true))
    expect(document.documentElement.dataset.reduceMotion).toBe('true')
  })

  it('clears data-reduce-motion when setReduceMotion(false)', () => {
    render(<Harness />)
    act(() => useThemeStore.getState().setReduceMotion(true))
    expect(document.documentElement.dataset.reduceMotion).toBe('true')
    act(() => useThemeStore.getState().setReduceMotion(false))
    expect(document.documentElement.dataset.reduceMotion).toBeUndefined()
  })

  it('setAppearance sets theme, font, and reduceMotion together', () => {
    render(<Harness />)
    act(() => useThemeStore.getState().setAppearance('retro', 'mono', true))
    expect(document.documentElement.dataset.theme).toBe('retro')
    expect(document.documentElement.dataset.font).toBe('mono')
    expect(document.documentElement.dataset.reduceMotion).toBe('true')
  })
})
