import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Lock, MailX } from 'lucide-react'
import { Input } from '../primitives/Input'
import { Label } from '../primitives/Label'
import { Dropdown } from '../primitives/Dropdown'
import { Button } from '../primitives/Button'
import { Badge, type BadgeVariant } from '../primitives/Badge'
import { Avatar } from '../primitives/Avatar'
import { Icon } from '../primitives/Icon'
import { Skeleton } from '../primitives/Skeleton'
import { EmptyState } from '../primitives/EmptyState'
import { useAuthStore } from '../../stores/authStore'
import { useAlertStore } from '../../stores/alertStore'
import { api } from '../../api/client'
import { COMMON_TIMEZONES } from '../../lib/timezones'
import { formatDateDisplay } from '../../lib/date'
import type { Household } from '../../types/auth'
import type { Invitation, ListResponse, Member } from '../../types/household'

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
 * Settings → Management tab (UX §5.2, FR-HH-002, Story 2.5). Household config (name/timezone editable
 * by the owner via the Story 2.4c `PATCH /api/household`; base currency read-only — Epic 3) plus the
 * read-only Members and Invitations rosters. The administrative actions (⋮ menus, + Invite, Integrations,
 * Danger Zone) are owned by later stories (2.6/2.7/2.8 + Epic 3) — deliberately absent here (P0 / D-DEFER).
 * The lists are bespoke token-styled layouts pending the Epic-5 Table primitive (D-TABLE).
 */
export function ManagementTab() {
  return (
    <div className="flex flex-col gap-xl">
      <HouseholdConfig />
      <MembersSection />
      <InvitationsSection />
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

function MembersSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['household', 'members'],
    queryFn: async () => (await api.get<ListResponse<Member>>('/api/household/members')).data,
  })

  return (
    <section className="flex flex-col gap-md">
      <h2 className="text-lg font-medium text-text-primary">Members</h2>
      {isLoading ? (
        <Skeleton className="h-control" />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {data?.items.map((m) => (
            <li key={m.personId} className="flex items-center gap-sm px-sm py-sm">
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
              <Badge variant="success">{m.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function InvitationsSection() {
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
