import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ACTION_ICON } from '../../config/iconRegistry'
import { EMPTY_STATE } from '../../config/emptyStateRegistry'
import { statusTone, BADGE_VARIANT_FOR_TONE, badgeVariantForStatus } from '../../config/statusRegistry'
import { Input } from '../primitives/Input'
import { Label } from '../primitives/Label'
import { Dropdown } from '../primitives/Dropdown'
import { Toggle } from '../primitives/Toggle'
import { Button } from '../primitives/Button'
import { Badge, type BadgeVariant } from '../primitives/Badge'
import { Avatar } from '../primitives/Avatar'
import { Icon } from '../primitives/Icon'
import { Zone } from '../primitives/Zone'
import { Skeleton } from '../primitives/Skeleton'
import { EmptyState } from '../primitives/EmptyState'
import { ContextMenu, type ContextMenuEntry } from '../primitives/ContextMenu'
import { ConfirmationDialog } from '../primitives/ConfirmationDialog'
import { Modal } from '../primitives/Modal'
import { InviteModal } from './InviteModal'
import { useAuthStore } from '../../stores/authStore'
import { useAlertStore } from '../../stores/alertStore'
import { useLeaveHousehold, useDeleteHousehold } from '../../hooks/useMembershipExit'
import { api, ApiError } from '../../api/client'
import { TIMEZONE_OPTIONS } from '../../lib/timezones'
import { formatDateDisplay } from '../../lib/date'
import type { Household } from '../../types/auth'
import type { Currency } from '../../types/currency'
import type { Invitation, InvitationManage, ListResponse, Member } from '../../types/household'
import type { EntityListResponse } from '../../types/entity'
import type { FxProvider, FxProviderType } from '../../types/fxProvider'

const TZ_OPTIONS = TIMEZONE_OPTIONS

// Role is plain entity IDENTITY, not a §4 semantic/status badge — owner is the bordered `outline`,
// admin/member are `neutral`. These are neutral Badge variants (no semantic tone), so they stay a small
// local map; there is no registry/home to consume.
const ROLE_BADGE: Record<Member['role'], BadgeVariant> = {
  owner: 'outline',
  admin: 'neutral',
  member: 'neutral',
}

/**
 * Settings → Management tab (UX §5.2, FR-HH-002, Stories 2.5/2.6b/2.7/2.8/3.9). Household config
 * (name/timezone editable by the owner via the Story 2.4c `PATCH /api/household`; base-currency
 * change + recompute via Story 3.9 `POST /api/household/base-currency`), the Members roster (with the adaptive ⋮ — role/archive/remove/delete, Story
 * 2.8), the Invitations roster (admin/owner Invite + per-row actions, 2.6b), the Integrations panel
 * (FX rate providers — owner-editable, read-only for others, Story 3.6), and the Danger Zone (2.7).
 * The lists are bespoke token-styled layouts pending the Epic-5 Table primitive (D-TABLE).
 */
export function ManagementTab() {
  return (
    <div className="flex flex-col gap-xl">
      <HouseholdConfig />
      <MembersSection />
      <InvitationsSection />
      <IntegrationsSection />
      <DangerZone />
    </div>
  )
}

function HouseholdConfig() {
  const household = useAuthStore((s) => s.household)
  const role = useAuthStore((s) => s.currentPerson?.role)
  const setHousehold = useAuthStore((s) => s.setHousehold)
  const pushToast = useAlertStore((s) => s.pushToast)
  const queryClient = useQueryClient()
  const isOwner = role === 'owner'

  const [name, setName] = useState(household?.name ?? '')
  const [timezone, setTimezone] = useState(household?.timezone ?? 'Asia/Singapore')
  // The base-currency change is a confirm→commit action of its own (recompute warning), separate
  // from the name/timezone Save. `pendingBase` holds the picked code until the owner confirms.
  const [pendingBase, setPendingBase] = useState<string | null>(null)

  const { data: currencies } = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => (await api.get<ListResponse<Currency>>('/api/currencies')).data,
  })
  const currencyOptions = (currencies?.items ?? []).map((c) => ({
    value: c.code,
    label: `${c.code} (${c.symbol})`,
  }))

  const save = useMutation({
    mutationFn: async () => (await api.patch<Household>('/api/household', { name, timezone })).data,
    onSuccess: (updated) => {
      setHousehold(updated)
      pushToast({ message: 'Household settings saved', variant: 'success' })
    },
  })

  const changeBase = useMutation({
    mutationFn: async (baseCurrency: string) =>
      (await api.post<Household>('/api/household/base-currency', { baseCurrency })).data,
    onSuccess: (updated) => {
      setHousehold(updated)
      // Rates re-base on the server — drop the cached currency list so it refetches.
      queryClient.invalidateQueries({ queryKey: ['currencies'] })
      pushToast({ message: 'Base currency updated', variant: 'success' })
    },
    // The confirm dialog has already closed — surface a failure (e.g. no-rate-yet 400) instead of
    // leaving the owner with no feedback.
    onError: () => pushToast({ message: 'Could not change the base currency', variant: 'error' }),
  })

  const dirty = name !== household?.name || timezone !== household?.timezone

  return (
    <section className="flex flex-col gap-md">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-medium text-text-strong">Household</h2>
        {!isOwner && (
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <Icon icon={ACTION_ICON.locked} size={12} /> Owner only
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
        <div className="flex flex-col gap-2xs">
          <Label htmlFor="hh-name">Household name</Label>
          <Input
            id="hh-name"
            value={name}
            disabled={!isOwner}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2xs">
          <Label htmlFor="hh-timezone">Timezone</Label>
          <Dropdown
            id="hh-timezone"
            searchable
            value={timezone}
            options={TZ_OPTIONS}
            disabled={!isOwner}
            onChange={setTimezone}
          />
        </div>
        <div className="flex flex-col gap-2xs">
          <Label htmlFor="hh-base-currency">Base currency</Label>
          {/* Owner-editable base-currency change + recompute (Story 3.9, FR-CU-005); read-only for
              others. Picking a different code opens the recompute-warning confirm below. */}
          {isOwner && currencyOptions.length > 0 ? (
            <Dropdown
              id="hh-base-currency"
              value={household?.baseCurrency ?? ''}
              options={currencyOptions}
              onChange={(next) => {
                if (next !== household?.baseCurrency) setPendingBase(next)
              }}
            />
          ) : (
            <Input id="hh-base-currency" value={household?.baseCurrency ?? ''} disabled readOnly />
          )}
        </div>
      </div>

      {isOwner && (
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            Save
          </Button>
        </div>
      )}

      <ConfirmationDialog
        open={pendingBase !== null}
        onClose={() => setPendingBase(null)}
        onConfirm={() => {
          if (pendingBase) changeBase.mutate(pendingBase)
        }}
        title="Change base currency"
        message={`Changing the base currency to ${pendingBase} recomputes all amounts. This can't be undone.`}
        confirmLabel="Change base currency"
      />
    </section>
  )
}

/** A confirm-dialog member action (Archive/Restore/Remove/Delete). Promote/Demote skip the confirm
 *  (a reversible role toggle), so they are not in this map. */
type MemberActionKind = 'archive' | 'restore' | 'remove' | 'delete'

const ACTION_COPY: Record<
  MemberActionKind,
  { title: string; confirmLabel: string; destructive: boolean; body: (name: string) => string }
> = {
  archive: {
    title: 'Archive member',
    confirmLabel: 'Archive',
    destructive: true,
    body: (name) =>
      `Archive ${name}? They're signed out and can't sign in until an admin restores them. Their history is kept.`,
  },
  restore: {
    title: 'Restore member',
    confirmLabel: 'Restore',
    destructive: false,
    body: (name) => `Restore ${name}? They'll be able to sign in again.`,
  },
  remove: {
    title: 'Remove member',
    confirmLabel: 'Remove',
    destructive: true,
    body: (name) =>
      `Remove ${name} from the household? They lose access immediately and can be re-invited later.`,
  },
  delete: {
    title: 'Delete member',
    confirmLabel: 'Delete',
    destructive: true,
    body: (name) => `Permanently delete ${name}? This can't be undone.`,
  },
}

/** Members roster (UX §5.2). The ⋮ is adaptive by viewer role + row state (Story 2.8):
 *  Promote/Demote (owner viewer, non-owner row) · Archive/Restore + Remove (admin/owner, non-owner,
 *  non-self) · Delete-if-empty (owner viewer, non-owner row, disabled-with-reason via `canDelete`).
 *  The owner row and the viewer's own row never show role/lifecycle items; a plain member sees no ⋮. */
function MembersSection() {
  const me = useAuthStore((s) => s.currentPerson)
  const isOwner = me?.role === 'owner'
  const canManage = isOwner || me?.role === 'admin'
  const pushToast = useAlertStore((s) => s.pushToast)
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<{ member: Member; kind: MemberActionKind } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['household', 'members'],
    queryFn: async () => (await api.get<ListResponse<Member>>('/api/household/members')).data,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['household', 'members'] })

  const setRole = useMutation({
    mutationFn: async (vars: { personId: string; role: 'admin' | 'member' }) =>
      api.patch(`/api/household/members/${vars.personId}/role`, { role: vars.role }),
    onSuccess: invalidate,
  })
  const archive = useMutation({
    mutationFn: async (personId: string) => api.post(`/api/household/members/${personId}/archive`),
    onSuccess: () => {
      invalidate()
      pushToast({ message: 'Member archived', variant: 'success' })
    },
  })
  const restore = useMutation({
    mutationFn: async (personId: string) => api.post(`/api/household/members/${personId}/restore`),
    onSuccess: () => {
      invalidate()
      pushToast({ message: 'Member restored', variant: 'success' })
    },
  })
  const remove = useMutation({
    mutationFn: async (personId: string) => api.post(`/api/household/members/${personId}/remove`),
    onSuccess: () => {
      invalidate()
      pushToast({ message: 'Member removed', variant: 'success' })
    },
  })
  const del = useMutation({
    mutationFn: async (personId: string) => api.delete(`/api/household/members/${personId}`),
    onSuccess: () => {
      invalidate()
      pushToast({ message: 'Member deleted', variant: 'success' })
    },
    // 409 has_dependencies — a race (data appeared since the list loaded); the disabled state
    // normally prevents this. Refetch (the row's canDelete flips) and explain the archive path. Any
    // other error gets a generic message (don't claim "has data" for a 404/5xx).
    onError: (err: unknown) => {
      invalidate()
      const hasData = err instanceof ApiError && err.status === 409
      pushToast({
        message: hasData
          ? "Can't delete — this member has data; archive instead"
          : 'Could not delete the member',
        variant: 'error',
      })
    },
  })

  function runPending() {
    if (!pending) return
    const id = pending.member.personId
    if (pending.kind === 'archive') archive.mutate(id)
    else if (pending.kind === 'restore') restore.mutate(id)
    else if (pending.kind === 'remove') remove.mutate(id)
    else del.mutate(id)
  }

  function itemsFor(m: Member): ContextMenuEntry[] {
    const items: ContextMenuEntry[] = []
    const isOwnerRow = m.role === 'owner'
    const isSelf = m.personId === me?.personId
    // Promote/Demote — owner viewer only; never the owner row (FR-P-005).
    if (isOwner && !isOwnerRow) {
      items.push(
        m.role === 'admin'
          ? {
              label: 'Demote to member',
              icon: ACTION_ICON.roleDown,
              onClick: () => setRole.mutate({ personId: m.personId, role: 'member' }),
            }
          : {
              label: 'Promote to admin',
              icon: ACTION_ICON.roleUp,
              onClick: () => setRole.mutate({ personId: m.personId, role: 'admin' }),
            },
      )
    }
    // Archive/Restore + Remove — admin/owner; never the owner row or the viewer's own row.
    if (canManage && !isOwnerRow && !isSelf) {
      items.push(
        m.status === 'archived'
          ? {
              label: 'Restore',
              icon: ACTION_ICON.restoreMember,
              onClick: () => setPending({ member: m, kind: 'restore' }),
            }
          : {
              label: 'Archive',
              icon: ACTION_ICON.archive,
              destructive: true,
              onClick: () => setPending({ member: m, kind: 'archive' }),
            },
      )
      items.push({
        label: 'Remove',
        icon: ACTION_ICON.removeMember,
        destructive: true,
        onClick: () => setPending({ member: m, kind: 'remove' }),
      })
    }
    // Delete-if-empty — owner viewer only; disabled-with-reason unless empty (§8.1).
    if (isOwner && !isOwnerRow) {
      items.push({
        label: 'Delete',
        icon: ACTION_ICON.delete,
        destructive: true,
        disabled: !m.canDelete,
        disabledReason: 'Has data — archive instead',
        onClick: () => setPending({ member: m, kind: 'delete' }),
      })
    }
    return items
  }

  return (
    <section className="flex flex-col gap-md">
      <h2 className="text-lg font-medium text-text-strong">Members</h2>
      {isLoading ? (
        <Skeleton className="h-control" />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {data?.items.map((m) => {
            const items = itemsFor(m)
            const archived = m.status === 'archived'
            return (
              <li
                key={m.personId}
                className={`flex items-center gap-sm px-sm py-sm ${archived ? 'opacity-60' : ''}`}
              >
                <Avatar
                  name={m.displayName ?? m.email}
                  src={m.pictureUrl ?? undefined}
                  colour={m.colour ?? undefined}
                  size={32}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-text-strong">
                    {m.displayName ?? m.email}
                  </span>
                  <span className="truncate text-xs text-text-default">{m.email}</span>
                </div>
                <Badge variant={ROLE_BADGE[m.role]}>{m.role}</Badge>
                <Badge variant={badgeVariantForStatus('member', archived ? 'archived' : 'active')}>
                  {archived ? 'archived' : 'active'}
                </Badge>
                {items.length > 0 && (
                  <ContextMenu
                    trigger={
                      <span
                        className="flex items-center text-text-default hover:text-text-strong"
                        aria-label={`Actions for ${m.displayName ?? m.email}`}
                      >
                        <Icon icon={ACTION_ICON.more} size={16} />
                      </span>
                    }
                    items={items}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmationDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={runPending}
        title={pending ? ACTION_COPY[pending.kind].title : ''}
        message={
          pending
            ? ACTION_COPY[pending.kind].body(pending.member.displayName ?? pending.member.email)
            : ''
        }
        confirmLabel={pending ? ACTION_COPY[pending.kind].confirmLabel : 'Confirm'}
        destructive={pending ? ACTION_COPY[pending.kind].destructive : true}
      />
    </section>
  )
}

/** Dispatch on role (UX §5.2): admin/owner get the token-bearing manage list + actions; a plain
 *  member keeps the Story 2.5 read-only roster (no actions, member-safe endpoint). */
function InvitationsSection() {
  const role = useAuthStore((s) => s.currentPerson?.role)
  const isAdmin = role === 'owner' || role === 'admin'
  return isAdmin ? <AdminInvitationsSection /> : <ReadOnlyInvitationsSection />
}

function ReadOnlyInvitationsSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['household', 'invitations'],
    queryFn: async () =>
      (await api.get<ListResponse<Invitation>>('/api/household/invitations')).data,
  })

  return (
    <section className="flex flex-col gap-md">
      <h2 className="text-lg font-medium text-text-strong">Invitations</h2>
      {isLoading ? (
        <Skeleton className="h-control" />
      ) : data && data.items.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {data.items.map((inv) => (
            <li
              key={`${inv.invitedEmail}-${inv.createdAt}`}
              className="flex items-center gap-sm px-sm py-sm"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-text-strong">
                {inv.invitedEmail}
              </span>
              <Badge variant={badgeVariantForStatus('invitation', inv.status)}>{inv.status}</Badge>
              <span className="text-xs text-text-default">{formatDateDisplay(inv.expiresAt)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState {...EMPTY_STATE.invitations} />
      )}
    </section>
  )
}

function AdminInvitationsSection() {
  const [inviteOpen, setInviteOpen] = useState(false)
  const pushToast = useAlertStore((s) => s.pushToast)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['household', 'invitations', 'manage'],
    queryFn: async () =>
      (await api.get<ListResponse<InvitationManage>>('/api/household/invitations/manage')).data,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['household', 'invitations', 'manage'] })

  const resend = useMutation({
    mutationFn: async (id: string) => api.post(`/api/household/invitations/${id}/resend`),
    onSuccess: () => {
      invalidate()
      pushToast({ message: 'Invitation resent', variant: 'success' })
    },
  })
  const revoke = useMutation({
    mutationFn: async (id: string) => api.post(`/api/household/invitations/${id}/revoke`),
    onSuccess: () => {
      invalidate()
      pushToast({ message: 'Invitation revoked', variant: 'success' })
    },
  })
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/household/invitations/${id}`),
    onSuccess: () => {
      invalidate()
      pushToast({ message: 'Invitation deleted', variant: 'success' })
    },
  })

  const busy = resend.isPending || revoke.isPending || remove.isPending

  async function copyLink(invitationId: string) {
    // clipboard.writeText rejects in an insecure context or when permission is denied — surface that
    // instead of leaking an unhandled rejection and silently implying success.
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${invitationId}`)
      pushToast({ message: 'Join link copied', variant: 'success' })
    } catch {
      pushToast({ message: 'Could not copy the link', variant: 'error' })
    }
  }

  return (
    <section className="flex flex-col gap-md">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-text-strong">Invitations</h2>
        <Button variant="secondary" onClick={() => setInviteOpen(true)}>
          <span className="flex items-center gap-2xs">
            <Icon icon={ACTION_ICON.add} size={16} /> Invite
          </span>
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-control" />
      ) : data && data.items.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {data.items.map((inv) => {
            // `expired` is a display status derived from a still-`pending` DB row, so it keeps the
            // pending actions (Resend/Revoke/Copy); Delete only applies to truly terminal rows.
            const actionable = inv.status === 'pending' || inv.status === 'expired'
            return (
              <li key={inv.invitationId} className="flex items-center gap-sm px-sm py-sm">
                <span className="min-w-0 flex-1 truncate text-sm text-text-strong">
                  {inv.invitedEmail}
                </span>
                <Badge variant={badgeVariantForStatus('invitation', inv.status)}>{inv.status}</Badge>
                <span className="text-xs text-text-default">
                  {formatDateDisplay(inv.expiresAt)}
                </span>
                <div className="flex items-center gap-2xs">
                  {actionable ? (
                    <>
                      <Button variant="ghost" onClick={() => copyLink(inv.invitationId)}>
                        Copy link
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => resend.mutate(inv.invitationId)}
                        disabled={busy}
                      >
                        Resend
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => revoke.mutate(inv.invitationId)}
                        disabled={busy}
                      >
                        Revoke
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      onClick={() => remove.mutate(inv.invitationId)}
                      disabled={busy}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState {...EMPTY_STATE.invitations} />
      )}

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </section>
  )
}

interface FxFormState {
  id: string | null
  providerType: string
  name: string
  baseUrl: string
  apiKeySecretRef: string
  isEnabled: boolean
}

const EMPTY_FX_FORM: FxFormState = {
  id: null,
  providerType: '',
  name: '',
  baseUrl: '',
  apiKeySecretRef: '',
  isEnabled: true,
}

/** Integrations panel (UX §5.2, Story 3.6) — FX rate providers as an ordered fallback chain, plus a
 *  greyed-out "Coming soon" Bank connections placeholder. **Owner-editable, read-only for others:**
 *  the owner gets Add / ⋮ (reorder/edit/remove) / enable toggle; everyone else sees a static roster
 *  (mutations are owner-only server-side too — a 403). Secrets stay secret: the modal collects an API
 *  key *secret reference* (the env/secret name), never a raw key (AC2). */
function IntegrationsSection() {
  const isOwner = useAuthStore((s) => s.currentPerson?.role) === 'owner'
  const pushToast = useAlertStore((s) => s.pushToast)
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FxFormState>(EMPTY_FX_FORM)
  const [confirmRemove, setConfirmRemove] = useState<FxProvider | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['fx-providers'],
    queryFn: async () =>
      (await api.get<EntityListResponse<FxProvider>>('/api/fx-providers')).data,
  })
  const { data: types } = useQuery({
    queryKey: ['fx-providers', 'types'],
    queryFn: async () => (await api.get<FxProviderType[]>('/api/fx-providers/types')).data,
  })

  const providers = data?.items ?? []
  const typeLabel = (pt: string) => types?.find((t) => t.provider_type === pt)?.display_name ?? pt
  const selectedTypeRequiresKey =
    types?.find((t) => t.provider_type === form.providerType)?.requires_key ?? false

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['fx-providers'] })
  const toastError = (err: unknown, fallback: string) => {
    const detail = err instanceof ApiError ? err.details?.detail : undefined
    const message =
      typeof detail === 'string' ? detail : err instanceof ApiError ? err.message : fallback
    pushToast({ variant: 'error', message })
  }

  const toggleEnabled = useMutation({
    mutationFn: async (p: FxProvider) =>
      api.patch(`/api/fx-providers/${p.id}`, { is_enabled: !p.is_enabled }),
    onSuccess: invalidate,
    onError: (err) => toastError(err, 'Could not update the provider.'),
  })
  const reorder = useMutation({
    mutationFn: async (orderedIds: string[]) =>
      api.post('/api/fx-providers/reorder', { ordered_ids: orderedIds }),
    onSuccess: invalidate,
    onError: (err) => toastError(err, 'Could not reorder providers.'),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/fx-providers/${id}`),
    onSuccess: () => {
      invalidate()
      pushToast({ message: 'Provider removed', variant: 'success' })
    },
    onError: (err) => toastError(err, 'Could not remove the provider.'),
  })

  const openCreate = () => {
    setForm(EMPTY_FX_FORM)
    setModalOpen(true)
  }
  const openEdit = (p: FxProvider) => {
    setForm({
      id: p.id,
      providerType: p.provider_type,
      name: p.name,
      baseUrl: p.base_url,
      apiKeySecretRef: p.api_key_secret_ref ?? '',
      isEnabled: p.is_enabled,
    })
    setModalOpen(true)
  }

  // Picking a type on add pre-fills name + base URL from the registry (overridable).
  const onTypeChange = (providerType: string) => {
    const meta = types?.find((t) => t.provider_type === providerType)
    setForm((f) => ({
      ...f,
      providerType,
      name: f.name.trim() === '' ? (meta?.display_name ?? '') : f.name,
      baseUrl: f.baseUrl.trim() === '' ? (meta?.base_url ?? '') : f.baseUrl,
    }))
  }

  const move = (index: number, delta: number) => {
    const ids = providers.map((p) => p.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorder.mutate(ids)
  }

  const handleSave = async () => {
    try {
      if (form.id) {
        await api.patch(`/api/fx-providers/${form.id}`, {
          name: form.name.trim(),
          base_url: form.baseUrl.trim(),
          api_key_secret_ref: form.apiKeySecretRef.trim() || null,
          is_enabled: form.isEnabled,
        })
      } else {
        await api.post('/api/fx-providers', {
          provider_type: form.providerType,
          name: form.name.trim(),
          base_url: form.baseUrl.trim(),
          api_key_secret_ref: selectedTypeRequiresKey
            ? form.apiKeySecretRef.trim() || null
            : null,
          is_enabled: form.isEnabled,
        })
      }
      invalidate()
      setModalOpen(false)
    } catch (err) {
      toastError(err, 'Could not save the provider.')
    }
  }

  const saveDisabled = form.providerType === '' || form.name.trim() === '' || form.baseUrl.trim() === ''

  function rowMenu(p: FxProvider, index: number): ContextMenuEntry[] {
    return [
      {
        label: 'Move up',
        icon: ACTION_ICON.roleUp,
        disabled: index === 0,
        onClick: () => move(index, -1),
      },
      {
        label: 'Move down',
        icon: ACTION_ICON.roleDown,
        disabled: index === providers.length - 1,
        onClick: () => move(index, 1),
      },
      { label: 'Edit', icon: ACTION_ICON.edit, onClick: () => openEdit(p) },
      { divider: true },
      { label: 'Remove', icon: ACTION_ICON.delete, destructive: true, onClick: () => setConfirmRemove(p) },
    ]
  }

  return (
    <section className="flex flex-col gap-md">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-medium text-text-strong">Integrations</h2>
        {!isOwner && (
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <Icon icon={ACTION_ICON.locked} size={12} /> Owner only
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-default">FX rate providers</h3>
        {isOwner && (
          <Button variant="secondary" onClick={openCreate}>
            <span className="flex items-center gap-2xs">
              <Icon icon={ACTION_ICON.add} size={16} /> Add provider
            </span>
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-control" />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {providers.map((p, index) => (
            <li key={p.id} className="flex items-center gap-sm px-sm py-sm">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-text-strong">{p.name}</span>
                <span className="truncate text-xs text-text-default">{typeLabel(p.provider_type)}</span>
              </div>
              {p.requires_key && (
                <Badge variant={badgeVariantForStatus('fxProviderKey', p.key_configured ? 'set' : 'missing')}>
                  {p.key_configured ? 'key set' : 'key not set'}
                </Badge>
              )}
              {/* No live status until the Story 3.7 fetch job runs — null renders "unknown". */}
              <Badge variant={BADGE_VARIANT_FOR_TONE[statusTone('fxProvider', p.last_status ?? 'unknown')]}>
                {p.last_status ?? 'unknown'}
              </Badge>
              {isOwner ? (
                <Toggle
                  checked={p.is_enabled}
                  onChange={() => toggleEnabled.mutate(p)}
                  aria-label={`Enable ${p.name}`}
                />
              ) : (
                <Badge variant={badgeVariantForStatus('fxProviderEnabled', p.is_enabled ? 'enabled' : 'disabled')}>
                  {p.is_enabled ? 'enabled' : 'disabled'}
                </Badge>
              )}
              {isOwner && (
                <ContextMenu
                  trigger={
                    <span
                      className="flex items-center text-text-default hover:text-text-strong"
                      aria-label={`Actions for ${p.name}`}
                    >
                      <Icon icon={ACTION_ICON.more} size={16} />
                    </span>
                  }
                  items={rowMenu(p, index)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Bank connections — post-MVP placeholder (UX §5.2): a dimmed dashed Zone, no functional control. */}
      <Zone tone="neutral" border="dashed" dimmed className="flex items-center justify-between gap-md p-md">
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 text-sm font-medium text-text-default">
            Bank connections <Badge variant="neutral">Coming soon</Badge>
          </span>
          <span className="text-xs text-text-muted">
            Automatic account syncing will arrive in a future release.
          </span>
        </div>
        <Button variant="secondary" disabled>
          Connect
        </Button>
      </Zone>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? 'Edit provider' : 'Add FX provider'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveDisabled}>
              {form.id ? 'Save' : 'Add'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-md">
          <div className="flex flex-col gap-2xs">
            <Label htmlFor="fx-type">Provider type</Label>
            {form.id ? (
              <Input id="fx-type" value={typeLabel(form.providerType)} disabled readOnly />
            ) : (
              <Dropdown
                id="fx-type"
                value={form.providerType}
                placeholder="Select a provider"
                options={(types ?? []).map((t) => ({ value: t.provider_type, label: t.display_name }))}
                onChange={onTypeChange}
              />
            )}
          </div>

          <div className="flex flex-col gap-2xs">
            <Label htmlFor="fx-name">Name</Label>
            <Input
              id="fx-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-2xs">
            <Label htmlFor="fx-base-url">Base URL</Label>
            <Input
              id="fx-base-url"
              value={form.baseUrl}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
            />
          </div>

          {selectedTypeRequiresKey && (
            <div className="flex flex-col gap-2xs">
              <Label htmlFor="fx-secret-ref">API key secret reference</Label>
              <Input
                id="fx-secret-ref"
                value={form.apiKeySecretRef}
                onChange={(e) => setForm((f) => ({ ...f, apiKeySecretRef: e.target.value }))}
                placeholder="e.g. EXCHANGERATE_API_KEY"
              />
              <span className="text-xs text-text-muted">
                Name of the environment secret holding the key — the key value is never stored here.
              </span>
            </div>
          )}

          {/* Not a <label>: the Toggle is self-labelled (aria-label) and renders its own control, so a
              wrapping <label> has no associatable control — the visible text is a sibling caption. */}
          <div className="flex items-center gap-sm">
            <Toggle
              checked={form.isEnabled}
              onChange={(isEnabled) => setForm((f) => ({ ...f, isEnabled }))}
              aria-label="Enabled"
            />
            <span className="text-sm text-text-default">Enabled</span>
          </div>
        </div>
      </Modal>

      <ConfirmationDialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => {
          if (confirmRemove) remove.mutate(confirmRemove.id)
        }}
        title="Remove provider"
        message={
          confirmRemove
            ? `Remove "${confirmRemove.name}" from the fallback chain? This can't be undone.`
            : ''
        }
        confirmLabel="Remove"
        destructive
      />
    </section>
  )
}

/** Danger Zone (UX §5.2, role-conditional). Owner → Delete Household (type-the-name confirm, Path A);
 *  admin/member → Leave Household (ConfirmationDialog, Path B). Each role sees exactly one control. */
function DangerZone() {
  const role = useAuthStore((s) => s.currentPerson?.role)
  const isOwner = role === 'owner'

  return (
    <section className="flex flex-col gap-md">
      {/* UX §5.2: the Danger zone is an error-hue Zone (error-fill + error border), heading inside. */}
      <Zone tone="error" border="dashed" className="flex flex-col gap-sm p-md">
        <h2 className="text-lg font-medium text-error">Danger zone</h2>
        {isOwner ? <DeleteHousehold /> : <LeaveHousehold />}
      </Zone>
    </section>
  )
}

function LeaveHousehold() {
  const [open, setOpen] = useState(false)
  const leave = useLeaveHousehold()

  return (
    <div className="flex items-center justify-between gap-md">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-text-strong">Leave household</span>
        <span className="text-xs text-text-default">
          You lose access to this household. Your data is kept and restored if you re-join.
        </span>
      </div>
      <Button variant="danger" onClick={() => setOpen(true)} disabled={leave.isPending}>
        Leave household
      </Button>
      <ConfirmationDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => leave.mutate()}
        title="Leave household"
        message="Leave this household? You'll be signed out and lose access until you're re-invited."
        confirmLabel="Leave"
      />
    </div>
  )
}

function DeleteHousehold() {
  const household = useAuthStore((s) => s.household)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const del = useDeleteHousehold()

  function close() {
    setOpen(false)
    setTyped('')
  }

  const confirmed = typed === household?.name

  return (
    <div className="flex items-center justify-between gap-md">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-text-strong">Delete household</span>
        <span className="text-xs text-text-default">
          Permanently deletes the household and all its data, and signs out every member. This cannot
          be undone.
        </span>
      </div>
      <Button variant="danger" onClick={() => setOpen(true)} disabled={del.isPending}>
        Delete household
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Delete household"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={del.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => del.mutate()}
              disabled={!confirmed || del.isPending}
            >
              Delete household
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2xs">
          <p className="text-sm text-text-default">
            This permanently deletes <strong className="text-text-strong">{household?.name}</strong>{' '}
            and all its data, and signs out every member. This cannot be undone. Type the household
            name to confirm.
          </p>
          <Label htmlFor="delete-confirm">Household name</Label>
          <Input
            id="delete-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label="Type the household name to confirm"
          />
        </div>
      </Modal>
    </div>
  )
}
