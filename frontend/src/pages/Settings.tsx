import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useAlertStore } from '../store/alertStore';
import {
  useHousehold,
  useUpdateHousehold,
  usePersons,
  useUpdatePersonRole,
  useRemovePerson,
  useInvitations,
  useInviteMember,
  useCancelInvitation,
  useDeleteHousehold,
  useDeclineInvitation,
  useLeaveHousehold,
  useGrantHouseholdCreation,
  type HouseholdData,
  type MemberData,
  type InvitationData,
} from '../api/usePersons';
import type { PersonInfo } from '../store/authStore';
import { ApiError } from '../api/client';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Table, type Column } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Tooltip } from '../components/ui/Tooltip';
import { Dropdown } from '../components/ui/Dropdown';
import { ContextMenu, type ContextMenuItem } from '../components/ui/ContextMenu';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Skeleton } from '../components/ui/Skeleton';
import { Avatar } from '../components/ui/Avatar';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { Copy, UserPlus, XCircle, Trash2, Shield, User, UserMinus, Link, Home } from 'lucide-react';

// --- Date Formatting ---

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

// --- Timezone Options ---

const TIMEZONE_OPTIONS = (() => {
  const now = new Date();
  return Intl.supportedValuesOf('timeZone')
    .map((tz) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'shortOffset',
      }).formatToParts(now);
      const offsetStr = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0';
      const match = offsetStr.match(/GMT([+-])(\d+)(?::(\d+))?/);
      const sign = match?.[1] === '+' ? 1 : -1;
      const offsetMinutes = sign * (parseInt(match?.[2] ?? '0', 10) * 60 + parseInt(match?.[3] ?? '0', 10));
      return { value: tz, label: `${tz} (${offsetStr})`, offsetMinutes };
    })
    .sort((a, b) => a.offsetMinutes - b.offsetMinutes)
    .map(({ value, label }) => ({ value, label }));
})();

// --- Tab Types ---

type TabKey = 'household' | 'members' | 'currencies';

// --- Household Tab Component ---

const HouseholdTab: React.FC = () => {
  const { data: household, isLoading } = useHousehold();
  const updateHousehold = useUpdateHousehold();
  const currentPerson = useAuthStore((s) => s.currentPerson);
  const enqueue = useAlertStore((s) => s.enqueue);

  const [name, setName] = useState(household?.name ?? '');
  const [timezone, setTimezone] = useState(household?.timezone ?? '');
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    household && (name !== household.name || timezone !== household.timezone);

  // Sync local state when household data loads
  React.useEffect(() => {
    if (household) {
      setName(household.name);
      setTimezone(household.timezone);
    }
  }, [household]);

  const isOwner = currentPerson?.role === 'owner';

  const handleSave = () => {
    if (!hasChanges) return;
    setError(null);
    updateHousehold.mutate(
      { name, timezone },
      {
        onSuccess: () => {
          enqueue({ variant: 'success', title: 'Household settings saved' });
        },
        onError: (err: ApiError) => {
          setError(err.details?.detail ?? 'Failed to save household settings');
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="bg-surface-raised border border-border rounded-lg p-6 space-y-4">
        <Skeleton shape="card" />
      </div>
    );
  }

  return (
    <div className="bg-surface-raised border border-border rounded-lg p-6 space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">Household Settings</h2>

      {error && <AlertBanner variant="error" message={error} onDismiss={() => setError(null)} />}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Household Name
          </label>
          {isOwner ? (
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter household name"
            />
          ) : (
            <Tooltip content="Only the household owner can change these settings">
              <Input
                value={name}
                disabled
                readOnly
              />
            </Tooltip>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Timezone
          </label>
          {isOwner ? (
            <Dropdown
              variant="searchable"
              options={TIMEZONE_OPTIONS}
              value={timezone}
              onChange={setTimezone}
              placeholder="Select timezone..."
            />
          ) : (
            <Tooltip content="Only the household owner can change these settings">
              <Input
                value={timezone}
                disabled
                readOnly
              />
            </Tooltip>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || updateHousehold.isPending}
          loading={updateHousehold.isPending}
        >
          Save Changes
        </Button>
      </div>

      {/* Danger Zone — owner only */}
      {isOwner && <HouseholdDangerZone />}
    </div>
  );
};

// --- Danger Zone Component ---

const HouseholdDangerZone: React.FC = () => {
  const navigate = useNavigate();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { data: household } = useHousehold();
  const deleteHousehold = useDeleteHousehold();
  const enqueue = useAlertStore((s) => s.enqueue);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  const householdName = household?.name ?? '';
  const nameMatches = confirmName.toLowerCase() === householdName.toLowerCase();

  const handleDelete = () => {
    if (!nameMatches) return;
    deleteHousehold.mutate(confirmName, {
      onSuccess: () => {
        // delete_household cascade already deleted all sessions server-side,
        // so calling POST /auth/logout would 401. Skip it and clean up locally.
        sessionStorage.removeItem('dev_session_token');
        clearAuth();
        navigate('/login?deleted=1', { replace: true });
      },
      onError: (error: any) => {
        console.error('[Settings] Delete household failed:', error);
        console.error('[Settings] Error details:', {
          message: error?.message,
          status: error?.status,
          statusText: error?.statusText,
          body: error?.body,
          response: error?.response,
        });
        setDeleteModalOpen(false);
        setConfirmName('');
        const errorMsg = (error as ApiError)?.details?.detail || error?.message || 'Could not delete the household. Please try again.';
        enqueue({ variant: 'error', title: 'Delete failed', message: errorMsg });
      },
    });
  };

  return (
    <>
      <div className="border border-error/30 rounded-lg p-6 mt-6">
        <h3 className="text-lg font-semibold text-error mb-2">Danger Zone</h3>
        <p className="text-text-secondary text-sm mb-4">
          Deleting your household will permanently remove all data including accounts, transactions, budgets, and all member accounts. This action cannot be undone.
        </p>
        <Button
          variant="danger"
          onClick={() => { setConfirmName(''); setDeleteModalOpen(true); }}
          className="flex items-center gap-2"
        >
          <Trash2 size={14} />
          Delete Household
        </Button>
      </div>

      <Modal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setConfirmName(''); }}
        title="Delete Household?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-text-secondary text-sm">
            Type the household name to confirm deletion.
          </p>
          <p className="text-text-secondary text-sm">
            This will permanently delete <strong className="text-text-primary">{householdName}</strong> and all associated data. This cannot be undone.
          </p>
          <Input
            label="Household name"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder="Enter household name"
            autoFocus
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => { setDeleteModalOpen(false); setConfirmName(''); }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!nameMatches || deleteHousehold.isPending}
              loading={deleteHousehold.isPending}
              onClick={handleDelete}
            >
              Delete Household
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

// --- Members Tab Component ---

const MembersTab: React.FC = () => {
  const { data: household } = useHousehold();
  const { data: members, isLoading } = usePersons();
  const { data: invitations } = useInvitations();
  const currentPerson = useAuthStore((s) => s.currentPerson);
  const enqueue = useAlertStore((s) => s.enqueue);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();

  const updateRole = useUpdatePersonRole();
  const removePerson = useRemovePerson();
  const inviteMember = useInviteMember();
  const cancelInvitation = useCancelInvitation();
  const grantHouseholdCreation = useGrantHouseholdCreation();

  // Invite modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [newInvitationId, setNewInvitationId] = useState<string | null>(null);

  // Remove confirmation state
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);

  // Leave household state
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const leaveHousehold = useLeaveHousehold();

  const isOwner = currentPerson?.role === 'owner';
  const isAdminOrOwner = currentPerson?.role === 'admin' || isOwner;

  const handleInvite = () => {
    setInviteError(null);
    // Basic email validation
    const emailRegex = /.+@.+\..+/;
    if (!inviteEmail || !emailRegex.test(inviteEmail)) {
      setInviteError('Please enter a valid email address');
      return;
    }

    inviteMember.mutate({ invitedEmail: inviteEmail }, {
      onSuccess: (data: InvitationData) => {
        setNewInvitationId(data.id);
        enqueue({ variant: 'success', title: 'Invitation created' });
      },
      onError: (err: ApiError) => {
        setInviteError(err.details?.detail ?? 'Failed to send invitation');
      },
    });
  };

  const handleInviteClose = () => {
    setInviteModalOpen(false);
    setInviteEmail('');
    setInviteError(null);
    setNewInvitationId(null);
  };

  const copyInvitationLink = () => {
    if (!newInvitationId) return;
    const url = `${window.location.origin}/join/${newInvitationId}`;
    navigator.clipboard.writeText(url);
    enqueue({ variant: 'success', title: 'Link copied to clipboard' });
  };

  const handleRemoveConfirm = () => {
    if (!removeTarget) return;
    removePerson.mutate(removeTarget.id, {
      onSuccess: () => {
        enqueue({ variant: 'success', title: 'Member removed' });
      },
    });
    setRemoveConfirmOpen(false);
    setRemoveTarget(null);
  };

  // Table columns
  const columns: Column<MemberData>[] = [
    {
      key: 'member',
      header: 'Member',
      render: (member) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar
            name={member.displayName}
            pictureUrl={member.pictureUrl ?? undefined}
            size="sm"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium text-text-primary min-w-0">
              <Tooltip content={member.displayName}>
                <span className="truncate max-w-[160px] inline-block align-bottom">{member.displayName}</span>
              </Tooltip>
              {member.id === currentPerson?.personId && (
                <span className="text-text-secondary text-sm font-normal shrink-0">(You)</span>
              )}
              {isOwner && member.canCreateHousehold && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-accent-subtle text-accent shrink-0">
                  <Home size={10} />
                  Owner eligible
                </span>
              )}
            </div>
            <Tooltip content={member.email}>
              <div className="text-sm text-text-secondary truncate max-w-[200px]">{member.email}</div>
            </Tooltip>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: '100px',
      render: (member) => {
        const variant =
          member.role === 'owner'
            ? 'success'
            : member.role === 'admin'
              ? 'warning'
              : 'neutral';
        return <Badge variant={variant}>{member.role}</Badge>;
      },
    },
    {
      key: 'joined',
      header: 'Joined',
      render: (member) => (
        <span className="text-text-secondary text-sm">{formatDate(member.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (member) => {
        const isOwnRow = member.id === currentPerson?.personId;
        const roleRank = (r: string) => ({ owner: 3, admin: 2, member: 1 }[r] ?? 0);
        const canAct = isAdminOrOwner && !isOwnRow &&
          roleRank(currentPerson!.role) > roleRank(member.role);

        if (!canAct) {
          return <span className="text-text-muted text-sm">—</span>;
        }

        const items: ContextMenuItem[] = [];

        if (member.role === 'admin') {
          items.push({
            label: 'Change to Member',
            icon: User,
            onClick: () => updateRole.mutate({ id: member.id, role: 'member' }),
            disabled: updateRole.isPending,
          });
        } else if (member.role === 'member') {
          items.push({
            label: 'Change to Admin',
            icon: Shield,
            onClick: () => updateRole.mutate({ id: member.id, role: 'admin' }),
            disabled: updateRole.isPending,
          });
        }

        if (isOwner) {
          items.push({
            label: member.canCreateHousehold ? 'Revoke household creation' : 'Grant household creation',
            icon: Home,
            onClick: () => grantHouseholdCreation.mutate(
              { id: member.id, canCreateHousehold: !member.canCreateHousehold },
              {
                onSuccess: () => {
                  enqueue({ variant: 'success', title: member.canCreateHousehold ? 'Household creation right revoked' : 'Household creation right granted' });
                },
                onError: (error: ApiError) => {
                  enqueue({ variant: 'error', title: 'Failed to update', message: error.detail ?? 'Failed to update household creation right' });
                },
              },
            ),
            disabled: grantHouseholdCreation.isPending,
          });
        }

        if (items.length > 0) items.push({ divider: true });

        items.push({
          label: 'Remove member',
          icon: UserMinus,
          destructive: true,
          onClick: () => {
            setRemoveTarget({ id: member.id, name: member.displayName });
            setRemoveConfirmOpen(true);
          },
        });

        return <ContextMenu items={items} />;
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Members Table Section */}
      <div className="bg-surface-raised border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Members</h2>
          {isAdminOrOwner && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setInviteModalOpen(true)}
              className="flex items-center gap-2"
            >
              <UserPlus size={14} />
              Invite Member
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} shape="table-row" />
            ))}
          </div>
        ) : (
          <Table
            columns={columns}
            data={members ?? []}
            rowKey={(m) => m.id}
            emptyMessage="No members found"
          />
        )}
      </div>

      {/* Pending & Declined Invitations Section */}
      {(() => {
        const pending = invitations?.filter((i) => i.status === 'pending') ?? [];
        const declined = invitations?.filter((i) => i.status === 'declined') ?? [];
        if (pending.length === 0 && declined.length === 0) return null;

        const inviteColumns: Column<InvitationData>[] = [
          {
            key: 'email',
            header: 'Email',
            render: (inv) => (
              <span className="text-text-primary text-sm font-medium">{inv.invitedEmail}</span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            width: '110px',
            render: (inv) => (
              inv.status === 'declined'
                ? <Badge variant="error">Declined</Badge>
                : <Badge variant="neutral">Pending</Badge>
            ),
          },
          {
            key: 'expires',
            header: 'Expires',
            render: (inv) => (
              <span className="text-text-secondary text-sm">{formatDate(inv.expiresAt)}</span>
            ),
          },
          {
            key: 'actions',
            header: 'Actions',
            width: '60px',
            render: (inv) => {
              if (inv.status === 'declined') {
                const items: ContextMenuItem[] = [
                  {
                    label: 'Delete invitation',
                    icon: Trash2,
                    destructive: true,
                    onClick: () => cancelInvitation.mutate(inv.id),
                    disabled: cancelInvitation.isPending,
                  },
                ];
                return <ContextMenu items={items} />;
              }
              const items: ContextMenuItem[] = [
                {
                  label: 'Copy invitation link',
                  icon: Link,
                  onClick: () => {
                    navigator.clipboard.writeText(`${window.location.origin}/join/${inv.id}`);
                    enqueue({ variant: 'success', title: 'Invitation link copied' });
                  },
                },
                { divider: true },
                {
                  label: 'Cancel invitation',
                  icon: XCircle,
                  destructive: true,
                  onClick: () => cancelInvitation.mutate(inv.id),
                  disabled: cancelInvitation.isPending,
                },
              ];
              return <ContextMenu items={items} />;
            },
          },
        ];

        const allInvitations = [
          ...pending,
          ...declined,
        ];

        return (
          <div className="bg-surface-raised border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              Invitations
            </h2>
            <Table
              columns={inviteColumns}
              data={allInvitations}
              rowKey={(inv) => inv.id}
            />
          </div>
        );
      })()}

      {/* Leave Household — non-owner members only, below the table per spec §9.8.2 */}
      {!isOwner && (
        <div className="flex">
          <Button
            variant="danger"
            onClick={() => setLeaveConfirmOpen(true)}
          >
            Leave Household
          </Button>
        </div>
      )}

      {/* Invite Modal */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={handleInviteClose}
        title="Invite Member"
        size="sm"
      >
        <div className="space-y-4">
          {!newInvitationId ? (
            <>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Email Address
                </label>
                <Input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Enter email address"
                  error={inviteError ?? undefined}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={handleInviteClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleInvite}
                  loading={inviteMember.isPending}
                >
                  Send Invitation
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-sm text-text-secondary">
                Invitation sent! Share this link with the member:
              </div>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={`${window.location.origin}/join/${newInvitationId}`}
                  trailing={
                    <button
                      type="button"
                      onClick={copyInvitationLink}
                      className="text-text-muted hover:text-text-primary"
                      aria-label="Copy link"
                    >
                      <Copy size={14} />
                    </button>
                  }
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleInviteClose}>Done</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Remove Member Confirmation Modal */}
      <Modal
        isOpen={removeConfirmOpen}
        onClose={() => {
          setRemoveConfirmOpen(false);
          setRemoveTarget(null);
        }}
        title="Remove member?"
      >
        <div className="space-y-4">
          <p className="text-text-secondary text-sm">
            {removeTarget
              ? `Remove ${removeTarget.name} from the household? This cannot be undone.`
              : ''}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setRemoveConfirmOpen(false);
                setRemoveTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleRemoveConfirm}
              disabled={removePerson.isPending}
            >
              {removePerson.isPending ? 'Removing...' : 'Remove'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Leave Household Confirmation Modal */}
      <Modal
        isOpen={leaveConfirmOpen}
        onClose={() => setLeaveConfirmOpen(false)}
        title="Leave household?"
      >
        <div className="space-y-4">
          <p className="text-text-secondary text-sm">
            You will leave <strong>{household?.name}</strong>.{' '}
            {currentPerson?.canCreateHousehold
              ? 'A new household will be created for you when you next sign in.'
              : 'You will need to be re-invited by a household owner to rejoin. This cannot be undone.'}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLeaveConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                leaveHousehold.mutate(undefined, {
                  onSuccess: (response) => {
                    setLeaveConfirmOpen(false);
                    
                    // Person is "booted" — no household
                    if (response.household === null) {
                      clearAuth();
                      navigate('/login');
                      return;
                    }
                    
                    // Update authStore with new household data from response
                    setAuth(
                      {
                        personId: response.person.personId,
                        displayName: response.person.displayName,
                        email: response.person.email,
                        role: response.person.role,
                        defaultView: response.person.defaultView as 'household' | 'personal',
                        displayCurrency: response.person.displayCurrency,
                        pictureUrl: response.person.pictureUrl,
                        canCreateHousehold: response.person.canCreateHousehold ?? false,
                      },
                      response.household.householdId,
                      response.csrfToken,
                    );
                    navigate('/dashboard');
                  },
                });
              }}
              disabled={leaveHousehold.isPending}
            >
              {leaveHousehold.isPending ? 'Leaving...' : 'Leave'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// --- Currencies Tab Component ---

const CurrenciesTab: React.FC = () => {
  return (
    <div className="bg-surface-raised border border-border rounded-lg p-6">
      <EmptyState
        title="Currencies coming soon"
        description="Configure currency settings and exchange rates for your household."
      />
    </div>
  );
};

// --- Main Settings Page ---

export const Settings: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabKey | null;
  const validTabs: TabKey[] = ['household', 'members', 'currencies'];
  const [activeTab, setActiveTab] = useState<TabKey>(
    tabParam && validTabs.includes(tabParam) ? tabParam : 'household',
  );

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'household', label: 'Household' },
    { key: 'members', label: 'Members' },
    { key: 'currencies', label: 'Currencies' },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold text-text-primary mb-6">Settings</h1>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-surface-raised border border-border rounded-lg p-1 w-fit mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 text-sm rounded transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-glow-primary ${
              activeTab === tab.key
                ? 'bg-control-active text-primary font-medium'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'household' && <HouseholdTab />}
      {activeTab === 'members' && <MembersTab />}
      {activeTab === 'currencies' && <CurrenciesTab />}
    </div>
  );
};
