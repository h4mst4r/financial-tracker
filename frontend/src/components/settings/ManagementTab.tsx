import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Lock,
  MailX,
  MoreVertical,
  Plus,
  Trash2,
  UserMinus,
} from 'lucide-react'
import { Input } from '../primitives/Input'
import { Label } from '../primitives/Label'
import { Dropdown } from '../primitives/Dropdown'
import { Button } from '../primitives/Button'
import { Badge, type BadgeVariant } from '../primitives/Badge'
import { Avatar } from '../primitives/Avatar'
import { Icon } from '../primitives/Icon'
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
import { COMMON_TIMEZONES } from '../../lib/timezones'
import { formatDateDisplay } from '../../lib/date'
import type { Household } from '../../types/auth'
import type { Invitation, InvitationManage, ListResponse, Member } from '../../types/household'

const TZ_OPTIONS = COMMON_TIMEZONES.map((tz) => ({ value: tz, label: tz }))

const ROLE_BADGE: Record<Member['role'], BadgeVariant> = {
  owner: 'info',
  admin: 'neutral',
  member: 'neutral',
}

const INVITATION_BADGE: Record<string, BadgeVariant> = {
  pending: 'warning',
  accepted: 'success',
  declined: 'neutral',
  revoked: 'error',
  expired: 'error',
}

/**
 * Settings → Management tab (UX §5.2, FR-HH-002, Stories 2.5/2.6b/2.7/2.8). Household config
 * (name/timezone editable by the owner via the Story 2.4c `PATCH /api/household`; base currency
 * read-only — Epic 3), the Members roster (with the adaptive ⋮ — role/archive/remove/delete, Story
 * 2.8), the Invitations roster (admin/owner Invite + per-row actions, 2.6b), and the Danger Zone
 * (2.7). Integrations remain absent (Epic 3, P0 / D-DEFER). The lists are bespoke token-styled
 * layouts pending the Epic-5 Table primitive (D-TABLE).
 */
export function ManagementTab() {
  return (
    <div className="flex flex-col gap-xl">
      <HouseholdConfig />
      <MembersSection />
      <InvitationsSection />
      <DangerZone />
    </div>
  )
}

function HouseholdConfig() {
  const household = useAuthStore((s) => s.household)
  const role = useAuthStore((s) => s.currentPerson?.role)
  const setHousehold = useAuthStore((s) => s.setHousehold)
  const pushToast = useAlertStore((s) => s.pushToast)
  const isOwner = role === 'owner'

  const [name, setName] = useState(household?.name ?? '')
  const [timezone, setTimezone] = useState(household?.timezone ?? 'Asia/Singapore')

  const save = useMutation({
    mutationFn: async () => (await api.patch<Household>('/api/household', { name, timezone })).data,
    onSuccess: (updated) => {
      setHousehold(updated)
      pushToast({ message: 'Household settings saved', variant: 'success' })
    },
  })

  const dirty = name !== household?.name || timezone !== household?.timezone

  return (
    <section className="flex flex-col gap-md">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-medium text-text-primary">Household</h2>
        {!isOwner && (
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <Icon icon={Lock} size={12} /> Owner only
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
            value={timezone}
            options={TZ_OPTIONS}
            disabled={!isOwner}
            onChange={setTimezone}
          />
        </div>
        <div className="flex flex-col gap-2xs">
          <Label htmlFor="hh-base-currency">Base currency</Label>
          {/* Read-only here; base-currency change + recompute is Epic 3 / FR-CU-005 (D-DEFER). */}
          <Input id="hh-base-currency" value={household?.baseCurrency ?? ''} disabled readOnly />
        </div>
      </div>

      {isOwner && (
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            Save
          </Button>
        </div>
      )}
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
              icon: ArrowDown,
              onClick: () => setRole.mutate({ personId: m.personId, role: 'member' }),
            }
          : {
              label: 'Promote to admin',
              icon: ArrowUp,
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
              icon: ArchiveRestore,
              onClick: () => setPending({ member: m, kind: 'restore' }),
            }
          : {
              label: 'Archive',
              icon: Archive,
              destructive: true,
              onClick: () => setPending({ member: m, kind: 'archive' }),
            },
      )
      items.push({
        label: 'Remove',
        icon: UserMinus,
        destructive: true,
        onClick: () => setPending({ member: m, kind: 'remove' }),
      })
    }
    // Delete-if-empty — owner viewer only; disabled-with-reason unless empty (§8.1).
    if (isOwner && !isOwnerRow) {
      items.push({
        label: 'Delete',
        icon: Trash2,
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
      <h2 className="text-lg font-medium text-text-primary">Members</h2>
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
                  <span className="truncate text-sm font-medium text-text-primary">
                    {m.displayName ?? m.email}
                  </span>
                  <span className="truncate text-xs text-text-secondary">{m.email}</span>
                </div>
                <Badge variant={ROLE_BADGE[m.role]}>{m.role}</Badge>
                <Badge variant={archived ? 'neutral' : 'success'}>
                  {archived ? 'archived' : 'active'}
                </Badge>
                {items.length > 0 && (
                  <ContextMenu
                    trigger={
                      <span
                        className="flex items-center text-text-secondary hover:text-text-primary"
                        aria-label={`Actions for ${m.displayName ?? m.email}`}
                      >
                        <Icon icon={MoreVertical} size={16} />
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
      <h2 className="text-lg font-medium text-text-primary">Invitations</h2>
      {isLoading ? (
        <Skeleton className="h-control" />
      ) : data && data.items.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {data.items.map((inv) => (
            <li
              key={`${inv.invitedEmail}-${inv.createdAt}`}
              className="flex items-center gap-sm px-sm py-sm"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                {inv.invitedEmail}
              </span>
              <Badge variant={INVITATION_BADGE[inv.status] ?? 'neutral'}>{inv.status}</Badge>
              <span className="text-xs text-text-secondary">{formatDateDisplay(inv.expiresAt)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={MailX}
          title="No invitations yet"
          description="Invitations you send will appear here."
        />
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
        <h2 className="text-lg font-medium text-text-primary">Invitations</h2>
        <Button variant="secondary" onClick={() => setInviteOpen(true)}>
          <span className="flex items-center gap-2xs">
            <Icon icon={Plus} size={16} /> Invite
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
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                  {inv.invitedEmail}
                </span>
                <Badge variant={INVITATION_BADGE[inv.status] ?? 'neutral'}>{inv.status}</Badge>
                <span className="text-xs text-text-secondary">
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
        <EmptyState
          icon={MailX}
          title="No invitations yet"
          description="Invitations you send will appear here."
        />
      )}

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
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
      {/* Bible §5.2: an error-tinted callout box (error-fill bg + error border) with the heading
          inside it, not a plain bordered panel. */}
      <div className="flex flex-col gap-sm rounded-md border border-border-error bg-error-fill p-md">
        <h2 className="text-lg font-medium text-error">Danger zone</h2>
        {isOwner ? <DeleteHousehold /> : <LeaveHousehold />}
      </div>
    </section>
  )
}

function LeaveHousehold() {
  const [open, setOpen] = useState(false)
  const leave = useLeaveHousehold()

  return (
    <div className="flex items-center justify-between gap-md">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-text-primary">Leave household</span>
        <span className="text-xs text-text-secondary">
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
        <span className="text-sm font-medium text-text-primary">Delete household</span>
        <span className="text-xs text-text-secondary">
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
          <p className="text-sm text-text-secondary">
            This permanently deletes <strong className="text-text-primary">{household?.name}</strong>{' '}
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
