import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { BaseEntity, EntityListResponse } from '../types/entity'

// The single server-state path for entity CRUD (ARCH §6.4). Built on TanStack Query — never
// useState/useEffect for server data; only `showArchived` (a UI flag) lives in React state, and it
// is part of the query key so flipping it refetches. Every method calls the shared `api` verbs
// (api/client.ts: CSRF, dev token, 401-redirect, RFC-7807 ApiError) — never a raw fetch.

export interface EntityManagerConfig {
  /** Seeds the query key (`['entity-type', filters]`, §6.4), e.g. 'accounts'. */
  entityType: string
  /** REST root, e.g. '/api/accounts'. */
  basePath: string
}

export interface EntityManager<T extends BaseEntity> {
  items: T[]
  total: number
  isLoading: boolean
  /** A create/update mutation is in-flight — gates the modal's Save so it can't double-fire (UX §6). */
  isSaving: boolean
  isError: boolean
  error: unknown
  refetch: () => void
  showArchived: boolean
  setShowArchived: (value: boolean) => void
  create: (data: unknown) => Promise<T>
  update: (id: string, data: unknown) => Promise<T>
  archive: (id: string) => Promise<T>
  restore: (id: string) => Promise<T>
  deletePermanently: (id: string) => Promise<void>
  duplicate: (id: string) => Promise<T>
  detectDuplicate: (candidate: unknown) => Promise<{ candidates: T[] }>
}

export function useEntityManager<T extends BaseEntity>(
  config: EntityManagerConfig,
): EntityManager<T> {
  const { entityType, basePath } = config
  const queryClient = useQueryClient()
  const [showArchived, setShowArchived] = useState(false)

  const list = useQuery({
    queryKey: [entityType, { includeArchived: showArchived }],
    queryFn: async () => {
      const url = showArchived ? `${basePath}?include_archived=true` : basePath
      const res = await api.get<EntityListResponse<T>>(url)
      return res.data
    },
  })

  // Invalidate by the entityType prefix so every filter variant (archived/not) refetches.
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [entityType] })

  const createMutation = useMutation({
    mutationFn: async (data: unknown) => (await api.post<T>(basePath, data)).data,
    onSuccess: invalidate,
  })
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: unknown }) =>
      (await api.patch<T>(`${basePath}/${id}`, data)).data,
    onSuccess: invalidate,
  })
  const archiveMutation = useMutation({
    mutationFn: async (id: string) => (await api.post<T>(`${basePath}/${id}/archive`)).data,
    onSuccess: invalidate,
  })
  const restoreMutation = useMutation({
    mutationFn: async (id: string) => (await api.post<T>(`${basePath}/${id}/restore`)).data,
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({
    // A 409 (has_dependencies) propagates as the thrown ApiError — the UI offers archive (§4.10).
    mutationFn: async (id: string) => {
      await api.delete<void>(`${basePath}/${id}`)
    },
    onSuccess: invalidate,
  })
  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => (await api.post<T>(`${basePath}/${id}/duplicate`)).data,
    onSuccess: invalidate,
  })
  // detectDuplicate is a read on save (Transaction/RecurringPayment, §4.10) — no cache mutation.
  const detectMutation = useMutation({
    mutationFn: async (candidate: unknown) =>
      (await api.post<{ candidates: T[] }>(`${basePath}/detect-duplicate`, candidate)).data,
  })

  return {
    items: list.data?.items ?? [],
    total: list.data?.total ?? 0,
    isLoading: list.isLoading,
    isSaving: createMutation.isPending || updateMutation.isPending,
    isError: list.isError,
    error: list.error,
    refetch: () => void list.refetch(),
    showArchived,
    setShowArchived,
    create: (data) => createMutation.mutateAsync(data),
    update: (id, data) => updateMutation.mutateAsync({ id, data }),
    archive: (id) => archiveMutation.mutateAsync(id),
    restore: (id) => restoreMutation.mutateAsync(id),
    deletePermanently: (id) => deleteMutation.mutateAsync(id),
    duplicate: (id) => duplicateMutation.mutateAsync(id),
    detectDuplicate: (candidate) => detectMutation.mutateAsync(candidate),
  }
}
