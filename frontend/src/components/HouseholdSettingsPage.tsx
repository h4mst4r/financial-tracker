/**
 * Household Settings Page
 * 
 * Main page for managing household members and settings.
 * Shows household info, members list, and invite functionality.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import MembersList from './MembersList';
import InviteMemberDialog from './InviteMemberDialog';
import PendingInvitations from './PendingInvitations';
import CreateHouseholdModal from './CreateHouseholdModal';

interface Household {
  id: string;
  name: string;
  created_by: string;
  created_at?: string;
  updated_at?: string;
}

interface Member {
  id: string;
  household_id: string;
  user_id: string;
  email: string | null;
  name: string | null;
  role: string;
  joined_at?: string;
}

interface HouseholdResponse {
  household: Household | null;
  member: {
    role: string;
  } | null;
}

export default function HouseholdSettingsPage() {
  const { user, isLoading: loading, csrfToken } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [showCreateHousehold, setShowCreateHousehold] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingHousehold, setLoadingHousehold] = useState(true);
  
  // Delete household confirmation state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingHousehold, setDeletingHousehold] = useState(false);

  useEffect(() => {
    fetchMyHousehold();
  }, []);

  const fetchMyHousehold = async () => {
    try {
      const sessionId = localStorage.getItem('session_id');
      const response = await fetch('/api/households/my-household', {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      });
      if (!response.ok) throw new Error('Failed to fetch household');
      
      const data: HouseholdResponse = await response.json();
      setHousehold(data.household);
      setMemberRole(data.member?.role || null);
      
      if (data.household) {
        await fetchMembers(data.household.id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingHousehold(false);
    }
  };

  const fetchMembers = async (householdId: string) => {
    try {
      const sessionId = localStorage.getItem('session_id');
      const response = await fetch(`/api/households/${householdId}/members`, {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      });
      if (!response.ok) throw new Error('Failed to fetch members');
      
      const data = await response.json();
      setMembers(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleInviteSuccess = () => {
    setInviteOpen(false);
    // Refresh members if needed
  };

  const handleMemberUpdate = () => {
    if (household) {
      fetchMembers(household.id);
    }
  };

  const handleDeleteHousehold = async () => {
    if (deleteConfirmText !== 'DELETE') return;

    setDeletingHousehold(true);
    setError(null);

    try {
      const sessionId = localStorage.getItem('session_id');
      const headers: Record<string, string> = {};
      if (sessionId) headers['X-Session-Id'] = sessionId;
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

      const response = await fetch(`/api/households/${household?.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete household');
      }

      // Clear session and redirect to login
      localStorage.clear();
      window.location.href = '/login';
    } catch (err: any) {
      setError(err.message || 'Failed to delete household. Please try again.');
      setDeletingHousehold(false);
    }
  };

  if (loading || loadingHousehold) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-primary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Household Settings</h1>
          <p className="text-text-secondary">Manage your household members and settings</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-error/20 border border-error rounded-lg text-error">
            {error}
          </div>
        )}

        {/* Household Info */}
        {household && (
          <div className="mb-8 p-6 bg-surface rounded-lg border border-border">
            <h2 className="text-2xl font-semibold text-primary mb-4">{household.name}</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-text-secondary">Member since:</span>
                <p className="text-text">
                  {household.created_at ? new Date(household.created_at).toLocaleDateString() : 'N/A'}
                </p>
              </div>
              <div>
                <span className="text-text-secondary">Your role:</span>
                <p className="text-text capitalize">{memberRole}</p>
              </div>
            </div>
          </div>
        )}

        {/* Household Creation Modal for First-Time Users */}
        {showCreateHousehold && (
          <CreateHouseholdModal
            onClose={() => setShowCreateHousehold(false)}
            onSuccess={() => {
              setShowCreateHousehold(false);
              fetchMyHousehold();
            }}
          />
        )}

        {/* No Household - Show Create Modal */}
        {!household && !loadingHousehold && (
          <div className="text-center py-12">
            <p className="text-text-secondary mb-4">You haven't created a household yet.</p>
            <button
              onClick={() => setShowCreateHousehold(true)}
              className="px-6 py-3 bg-primary hover:bg-primary-hover text-text font-semibold rounded-lg transition-colors"
            >
              Create Your First Household
            </button>
          </div>
        )}

        {/* Invite Button (Admin/Owner only) */}
        {memberRole === 'owner' || memberRole === 'admin' ? (
          <div className="mb-8">
            <button
              onClick={() => setInviteOpen(true)}
              className="px-6 py-3 bg-primary hover:bg-primary-hover text-text font-semibold rounded-lg transition-colors"
            >
              + Invite Member
            </button>
          </div>
        ) : null}

        {/* Members List */}
        {household && (
          <MembersList
            householdId={household.id}
            members={members}
            userRole={memberRole || ''}
            onMemberUpdate={handleMemberUpdate}
          />
        )}

        {/* Pending Invitations (Admin/Owner only) */}
        {household && (memberRole === 'owner' || memberRole === 'admin') && (
          <PendingInvitations
            householdId={household.id}
            userRole={memberRole || ''}
            onRefresh={() => fetchMyHousehold()}
          />
        )}

        {/* Invite Member Dialog */}
        {household && (
          <InviteMemberDialog
            isOpen={inviteOpen}
            onClose={() => setInviteOpen(false)}
            householdId={household.id}
            onSuccess={handleInviteSuccess}
          />
        )}

        {/* Delete Household Button (Owner only) */}
        {household && memberRole === 'owner' && (
          <div className="mt-12 pt-6 border-t border-error/50">
            <h3 className="text-lg font-semibold text-error mb-3">Danger Zone</h3>
            <p className="text-text-secondary text-sm mb-4">
              Deleting this household will remove all members, invitations, and associated data. This action cannot be undone.
            </p>
            <button
              onClick={() => setShowDeleteDialog(true)}
              disabled={deletingHousehold}
              className="px-6 py-3 bg-error hover:bg-error-hover text-text font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {deletingHousehold ? 'Deleting...' : 'Delete Household'}
            </button>
          </div>
        )}

        {/* Delete Household Confirmation Dialog */}
        {showDeleteDialog && household && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-surface rounded-lg border border-error max-w-md w-full p-6">
              <h2 className="text-xl font-bold text-error mb-2">Delete Household</h2>
              <p className="text-text-secondary mb-4">
                This will permanently delete <strong className="text-text">{household.name}</strong> and all associated data. All members will be removed.
              </p>
              <div className="mb-4">
                <label className="block text-sm text-text-secondary mb-2">
                  Type <strong className="text-error">DELETE</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE here"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-error"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setDeleteConfirmText('');
                  }}
                  className="flex-1 px-4 py-2 bg-transparent border border-border text-text-secondary rounded-lg hover:bg-surface transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteHousehold}
                  disabled={deleteConfirmText !== 'DELETE' || deletingHousehold}
                  className="flex-1 px-4 py-2 bg-error hover:bg-error-hover text-text font-semibold rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {deletingHousehold ? 'Deleting...' : 'Delete Household'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
