import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertBanner } from './AlertBanner';
import { api } from '../../api/client';
import type { PendingInvitation } from '../../types/auth';

interface PendingInvitationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  invitation: PendingInvitation;
  currentHouseholdId?: string;
  currentHouseholdName?: string;
  userRole?: string;
}

export const PendingInvitationDialog = ({
  isOpen,
  onClose,
  invitation,
  currentHouseholdId,
  currentHouseholdName,
  userRole = 'member',
}: PendingInvitationDialogProps) => {
  const navigate = useNavigate();
  const isAlreadyInTarget = currentHouseholdId === invitation.householdId;
  const hasConflict = !!currentHouseholdId && !isAlreadyInTarget;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expiresFormatted = useMemo(
    () => new Date(invitation.expiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    [invitation.expiresAt],
  );

  const roleLabel = userRole === 'owner' ? 'Owner' : userRole === 'admin' ? 'Admin' : 'Member';

  const handleDecline = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post(`/api/invitations/${invitation.token}/decline`);
      window.location.href = '/dashboard';
    } catch {
      setError('Failed to decline invitation. Please try again.');
      setLoading(false);
    }
  }, [invitation.token]);

  const handleAccept = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post(`/api/invitations/${invitation.token}/accept`);
      window.location.href = '/dashboard';
    } catch {
      setError('Failed to accept invitation. Please try again.');
      setLoading(false);
    }
  }, [invitation.token]);

  const handleGoToSettings = useCallback(() => {
    onClose();
    navigate('/settings');
  }, [onClose, navigate]);

  if (isAlreadyInTarget) return null;

  // ── Scenario B: Conflict — send to Settings ───────────────────────────────
  if (hasConflict) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Household conflict" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            You've been invited to join {invitation.householdName} by {invitation.invitedByDisplayName} (expires {expiresFormatted}).
          </p>
          <p className="text-sm text-text-primary">
            You are currently {userRole === 'owner' ? 'the' : 'a'} {roleLabel} of {currentHouseholdName}.
            {' '}To accept this invitation, go to Settings to {userRole === 'owner' ? 'delete' : 'leave'} your current household first.
          </p>
          <p className="text-sm text-text-secondary">
            This invitation will remain pending.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={handleDecline} loading={loading} disabled={loading}>
              Decline
            </Button>
            <Button variant="primary" onClick={handleGoToSettings}>
              Go to Settings
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── Scenario A: No household — standard accept/decline ────────────────────
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" size="xs">
      <div className="pt-6 pb-2">
        {error && <div className="mb-4"><AlertBanner variant="error" message={error} onDismiss={() => setError(null)} /></div>}

        <p className="text-xl font-semibold text-text-primary mb-4">You've been invited to join</p>
        <p className="text-2xl font-semibold text-text-primary mb-1">{invitation.householdName}</p>
        <p className="text-sm text-text-secondary">Invited by: {invitation.invitedByDisplayName}</p>
        <p className="text-sm text-text-secondary">Expires: {expiresFormatted}</p>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={handleDecline} loading={loading} disabled={loading}>
            Decline
          </Button>
          <Button variant="primary" onClick={handleAccept} loading={loading} disabled={loading}>
            Accept Invitation
          </Button>
        </div>
      </div>
    </Modal>
  );
};
