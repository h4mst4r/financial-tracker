import { describe, expect, test } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMultiSelect } from '../src/hooks/useMultiSelect'

// Pure client-side selection state — no providers, no fetch.

describe('useMultiSelect', () => {
  test('starts empty', () => {
    const { result } = renderHook(() => useMultiSelect())
    expect(result.current.selectedCount).toBe(0)
    expect(result.current.hasSelection).toBe(false)
    expect(result.current.isSelected('a')).toBe(false)
  })

  test('toggle selects then deselects the same id', () => {
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.toggle('a'))
    expect(result.current.isSelected('a')).toBe(true)
    expect(result.current.selectedCount).toBe(1)
    expect(result.current.hasSelection).toBe(true)

    act(() => result.current.toggle('a'))
    expect(result.current.isSelected('a')).toBe(false)
    expect(result.current.selectedCount).toBe(0)
  })

  test('select is idempotent; deselect removes', () => {
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.select('a'))
    act(() => result.current.select('a'))
    expect(result.current.selectedCount).toBe(1)

    act(() => result.current.deselect('a'))
    expect(result.current.isSelected('a')).toBe(false)
  })

  test('selectAll replaces the selection; clear empties it', () => {
    const { result } = renderHook(() => useMultiSelect())

    act(() => result.current.selectAll(['a', 'b', 'c']))
    expect(result.current.selectedCount).toBe(3)
    expect(result.current.isSelected('a')).toBe(true)
    expect(result.current.isSelected('c')).toBe(true)

    act(() => result.current.clear())
    expect(result.current.selectedCount).toBe(0)
    expect(result.current.hasSelection).toBe(false)
  })

  test('selectedIds is a NEW Set reference on each change (so React re-renders)', () => {
    const { result } = renderHook(() => useMultiSelect())
    const before = result.current.selectedIds

    act(() => result.current.toggle('a'))
    expect(result.current.selectedIds).not.toBe(before)
  })
})
