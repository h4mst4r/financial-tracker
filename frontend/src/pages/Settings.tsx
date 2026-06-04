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
  type HouseholdData,
  type MemberData,
  type InvitationData,
} from '../api/usePersons';
import { ApiError } from '../api/client';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Table, type Column } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Tooltip } from '../components/ui/Tooltip';
import { Dropdown } from '../components/ui/Dropdown';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Skeleton } from '../components/ui/Skeleton';
import { Avatar } from '../components/ui/Avatar';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { Copy, UserPlus, XCircle, Trash2 } from 'lucide-react';

// --- Date Formatting ---

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

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
            <Input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Enter timezone (e.g., America/New_York)"
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
      onError: () => {
        setDeleteModalOpen(false);
        setConfirmName('');
        enqueue({ variant: 'error', title: 'Delete failed', message: 'Could not delete the household. Please try again.' });
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
  const { data: members, isLoading } = usePersons();
  const { data: invitations } = useInvitations();
  const currentPerson = useAuthStore((s) => s.currentPerson);
  const enqueue = useAlertStore((s) => s.enqueue);

  const updateRole = useUpdatePersonRole();
  const removePerson = useRemovePerson();
  const inviteMember = useInviteMember();
  const cancelInvitation = useCancelInvitation();

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
        <div className="flex items-center gap-3">
          <Avatar
            name={member.displayName}
            pictureUrl={member.pictureUrl ?? undefined}
            size="sm"
          />
          <div>
            <div className="font-medium text-text-primary">
              {member.displayName}
              {member.id === currentPerson?.personId && (
                <span className="text-text-secondary ml-1 text-sm">(You)</span>
              )}
            </div>
            <div className="text-sm text-text-secondary">{member.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
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

        return (
          <div className="flex items-center gap-2">
            {/* Role change Dropdown — admin+, only for members below own rank */}
            {(() => {
              const roleRank = (r: string) => ({ owner: 3, admin: 2, member: 1 }[r] ?? 0);
              return isAdminOrOwner && !isOwnRow && roleRank(currentPerson!.role) > roleRank(member.role) ? (
                <Dropdown
                  value={member.role}
                  options={[
                    { value: 'admin', label: 'Admin' },
                    { value: 'member', label: 'Member' },
                  ]}
                  onChange={(value) =>
                    updateRole.mutate({ id: member.id, role: value as 'admin' | 'member' })
                  }
                  disabled={updateRole.isPending}
                />
              ) : null;
            })()}

            {/* Remove button — admin+ only, not on own row */}
            {isAdminOrOwner && !isOwnRow && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRemoveTarget({ id: member.id, name: member.displayName });
                  setRemoveConfirmOpen(true);
                }}
                className="text-error hover:bg-error-muted"
                aria-label={`Remove ${member.displayName}`}
              >
                <Trash2 size={14} />
              </Button>
            )}

            {/* Leave button — own row only, not for owner */}
            {isOwnRow && !isOwner && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLeaveConfirmOpen(true)}
                className="text-error hover:bg-error-muted"
                aria-label="Leave household"
              >
                Leave
              </Button>
            )}
          </div>
        );
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

      {/* Pending Invitations Section — filter to only pending status */}
      {(() => {
        const pending = invitations?.filter((i) => i.status === 'pending') ?? [];
        return pending.length > 0 ? (
        <div className="bg-surface-raised border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            Pending Invitations
          </h2>
          <div className="space-y-3">
            {pending.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between py-2 border-b border-border last:border-b-0"
              >
                <div>
                  <div className="text-text-primary text-sm font-medium">
                    {inv.invitedEmail}
                  </div>
                  <div className="text-text-secondary text-xs">
                    Expires: {formatDate(inv.expiresAt)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => cancelInvitation.mutate(inv.id)}
                  className="text-text-muted hover:text-error"
                  aria-label="Cancel invitation"
                >
                  <XCircle size={14} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null;
      })()}

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
            Are you sure you want to leave this household? You will lose access to all shared data.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLeaveConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                leaveHousehold.mutate(undefined, {
                  onSuccess: () => {
                    enqueue({ variant: 'success', title: 'You have left the household' });
                    setLeaveConfirmOpen(false);
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
            className={
              activeTab === tab.key
                ? 'px-4 py-1.5 text-sm rounded bg-control-active text-primary font-medium'
                : 'px-4 py-1.5 text-sm rounded text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors'
            }
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
