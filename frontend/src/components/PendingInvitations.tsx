/**
 * Pending Invitations Component
 * 
 * Displays all pending invitations for a household.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

interface Invitation {
  id: string;
  household_id: string;
  email: string;
  invited_by: string;
  status: string;
  expires_at?: string;
  created_at?: string;
  is_expired: boolean;
}

interface PendingInvitationsProps {
  householdId: string;
  userRole: string;
  onRefresh?: () => void;
}

export default function PendingInvitations({ householdId, userRole, onRefresh }: PendingInvitationsProps) {
  const { csrfToken } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (userRole !== 'owner' && userRole !== 'admin') {
      setLoading(false);
      return;
    }
    fetchInvitations();
  }, [householdId, userRole]);

  const fetchInvitations = async () => {
    try {
      const response = await fetch(`/api/households/${householdId}/invitations`, {
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrfToken || '' },
      });
      if (!response.ok) throw new Error('Failed to fetch invitations');
      const data = await response.json();
      setInvitations(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (invitationId: string) => {
    if (!window.confirm('Are you sure you want to revoke this invitation?')) return;

    setActionLoading(invitationId);
    try {
      const response = await fetch(`/api/households/${householdId}/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': csrfToken || '' },
      });
      if (!response.ok) throw new Error('Failed to revoke invitation');
      await fetchInvitations();
      onRefresh?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResend = async (invitationId: string) => {
    setActionLoading(invitationId);
    try {
      const response = await fetch(`/api/households/invitations/${invitationId}/resend`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken || '' },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to resend invitation');
      }
      setSuccess('Invitation email resent successfully!');
      setTimeout(() => setSuccess(null), 3000);
      onRefresh?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'pending':
        return 'badge-warning';
      case 'accepted':
        return 'badge-success';
      case 'expired':
        return 'badge-text-muted';
      case 'revoked':
        return 'badge-error';
      default:
        return 'badge-text-muted';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'accepted':
        return 'Accepted';
      case 'expired':
        return 'Expired';
      case 'revoked':
        return 'Revoked';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  if (loading) {
    return <div className="text-text-secondary">Loading...</div>;
  }

  if (error) {
    return <div className="text-error">{error}</div>;
  }

  if (invitations.length === 0) {
    return (
      <div className="text-text-muted text-sm italic">
        No invitations yet
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h2 className="text-xl font-semibold text-primary mb-6">Invitations</h2>
      {success && (
        <div className="alert-success mb-4 text-sm">
          {success}
        </div>
      )}
      <div className="space-y-3">
        {invitations.map((invitation) => (
          <div key={invitation.id} className="invite-card">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <p className="text-text font-medium truncate">{invitation.email}</p>
                  <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${getStatusBadgeClass(invitation.status)}`}>
                    {getStatusLabel(invitation.status)}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-text-secondary">
                  <span>by {invitation.invited_by}</span>
                  {invitation.expires_at && (
                    <span className="text-text-muted">Expires {new Date(invitation.expires_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            </div>
            {invitation.status === 'pending' && (
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => handleResend(invitation.id)}
                  disabled={actionLoading === invitation.id}
                  className="btn-action-primary"
                >
                  {actionLoading === invitation.id ? 'Sending...' : 'Resend'}
                </button>
                <button
                  onClick={() => handleRevoke(invitation.id)}
                  disabled={actionLoading === invitation.id}
                  className="btn-action-error"
                >
                  {actionLoading === invitation.id ? 'Revoking...' : 'Revoke'}
                </button>
              </div>
            )}
            {invitation.status === 'accepted' && (
              <span className="text-success text-sm ml-4">✓ Joined</span>
            )}
            {(invitation.status === 'expired' || invitation.status === 'revoked') && (
              <span className={`text-sm ml-4 ${invitation.status === 'revoked' ? 'text-error' : 'text-text-muted'}`}>
                {invitation.status === 'revoked' ? '✕ Revoked' : 'Expired'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
