import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { EntityPreference } from '../types/entity'

// Per-person favourite + manual-sort persistence for any EntityCard list (FR-E-021). This IS server
// state (shared, refetched, invalidated) so it lives in TanStack Query — the opposite of useMultiSelect
// (ephemeral client selection state). Targets the canonical entity_preferences HTTP contract this story
// LOCKS; the backend router is implemented later (it needs `get_current_person` from the session, which
// arrives with auth in Epic 2). Every mutation invalidates the per-entityType query.
//
// CONTRACT LOCK — `person_id` is NEVER in a request body. The server derives it from the session and
// scopes the upsert to it (backend.md §2: never trust the body for scoping). That is the FR-E-021
// per-person-isolation guarantee. The client only sends { entity_type, entity_id, … }.

const BASE = '/api/entity-preferences'

export interface EntityPreferences {
  /** entity_id → its preference row (favourite + sort). */
  preferences: Map<string, EntityPreference>
  isLoading: boolean
  isError: boolean
  setFavourite: (entityId: string, isFavourite: boolean) => Promise<void>
  setSortOrder: (entityId: string, sortOrder: number) => Promise<void>
  reorder: (orderedIds: string[]) => Promise<void>
}

export function useEntityPreferences(entityType: string): EntityPreferences {
  const queryClient = useQueryClient()

  const list = useQuery({
    queryKey: ['entity-preferences', entityType],
    queryFn: async () => {
      const res = await api.get<{ items: EntityPreference[] }>(
        `${BASE}?entity_type=${encodeURIComponent(entityType)}`,
      )
      return res.data.items
    },
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['entity-preferences', entityType] })

  // CONTRACT LOCK — this is a PARTIAL upsert: `setFavourite` sends only `is_favourite`, `setSortOrder`
  // only `sort_order`. The backend MUST treat an omitted field as "leave unchanged" (upsert-MERGE, e.g.
  // COALESCE to the existing row) — NOT a full-row replace. A naive `PUT` that nulls omitted columns would
  // wipe the user's manual sort when they favourite an item (and reset the favourite when they reorder).
  const upsertMutation = useMutation({
    mutationFn: async (body: { entity_id: string; is_favourite?: boolean; sort_order?: number }) => {
      await api.put(BASE, { entity_type: entityType, ...body })
    },
    onSuccess: invalidate,
  })

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await api.put(`${BASE}/reorder`, { entity_type: entityType, ordered_ids: orderedIds })
    },
    onSuccess: invalidate,
  })

  const preferences = useMemo(() => {
    const map = new Map<string, EntityPreference>()
    for (const p of list.data ?? []) map.set(p.entity_id, p)
    return map
  }, [list.data])

  const setFavourite = useCallback(
    (entityId: string, isFavourite: boolean) =>
      upsertMutation.mutateAsync({ entity_id: entityId, is_favourite: isFavourite }),
    [upsertMutation],
  )
  const setSortOrder = useCallback(
    (entityId: string, sortOrder: number) =>
      upsertMutation.mutateAsync({ entity_id: entityId, sort_order: sortOrder }),
    [upsertMutation],
  )
  const reorder = useCallback(
    (orderedIds: string[]) => reorderMutation.mutateAsync(orderedIds),
    [reorderMutation],
  )

  return {
    preferences,
    isLoading: list.isLoading,
    isError: list.isError,
    setFavourite,
    setSortOrder,
    reorder,
  }
}
