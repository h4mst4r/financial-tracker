import { useMemo } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Dropdown } from '../primitives/Dropdown'
import { useAuthStore } from '../../stores/authStore'
import { useAlertStore } from '../../stores/alertStore'
import { api } from '../../api/client'
import { NATIVE_DISPLAY, colourForCode } from '../../lib/currency'
import type { Person } from '../../types/auth'
import type { Currency } from '../../types/currency'
import type { ListResponse } from '../../types/household'

/** Topbar display-currency picker (UX §8.4, Story 4.9, FR-CU-004). Offers **Native** (each figure in
 *  its own account currency) plus every household display-active currency; the pick persists per-person
 *  via `PATCH /api/profile` and refreshes the global person (so every consumer — the accounts hero now,
 *  Dashboard/Transactions later — re-renders). The Household/Individual + member controls of the §8.4
 *  ViewContextSwitcher are Story 9.7 — NOT built here (P0). */
export function DisplayCurrencyPicker() {
  const person = useAuthStore((s) => s.currentPerson)
  const setCurrentPerson = useAuthStore((s) => s.setCurrentPerson)
  const pushToast = useAlertStore((s) => s.pushToast)

  // Same query key as the Currencies/Profile pages so it shares the cache.
  const { data: currencies } = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => (await api.get<ListResponse<Currency>>('/api/currencies')).data,
  })

  const save = useMutation({
    mutationFn: async (next: string) =>
      (await api.patch<Person>('/api/profile', { displayCurrency: next })).data,
    onSuccess: (updated) => {
      setCurrentPerson(updated)
      pushToast({ message: 'Display currency updated', variant: 'success' })
    },
  })

  // Native first, then each display-active currency as its code in its own colour (§0.1 anti-rainbow —
  // identity is the tinted code, not a dot). searchText carries the code for the (future) filter.
  const options = useMemo(() => {
    const active = (currencies?.items ?? []).filter((c) => c.is_display_active)
    return [
      { value: NATIVE_DISPLAY, label: 'Native', searchText: 'native' },
      ...active.map((c) => ({
        value: c.code,
        label: (
          <span style={{ color: c.colour ?? colourForCode(c.code) }}>{c.code}</span>
        ),
        searchText: c.code,
      })),
    ]
  }, [currencies])

  // AppShell only mounts in-household, so currentPerson is non-null; guard defensively.
  if (!person) return null

  return (
    <Dropdown
      id="topbar-display-currency"
      value={person.displayCurrency}
      options={options}
      onChange={(next) => save.mutate(next)}
    />
  )
}
