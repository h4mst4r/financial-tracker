/**
 * Invite Member Dialog
 * 
 * Modal dialog for inviting new members to the household.
 * Shows email input and sends invitation.
 */

import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

interface InviteMemberDialogProps {
  isOpen: boolean;
  onClose: () => void;
  householdId: string;
  onSuccess: () => void;
}

export default function InviteMemberDialog({ isOpen, onClose, householdId, onSuccess }: InviteMemberDialogProps) {
  const { csrfToken } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [invitationLink, setInvitationLink] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);
    setInvitationLink(null);

    try {
      const response = await fetch(`/api/households/${householdId}/members/invite`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken || '',
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to send invitation');
      }

      setSuccess(true);
      setInvitationLink(data.invitation_link);
      setEmail('');
      
      // Call parent success callback
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setError(null);
    setSuccess(false);
    setInvitationLink(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-surface rounded-lg border border-border max-w-md w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-primary">Invite Member</h2>
          <button
            onClick={handleClose}
            className="text-text-secondary hover:text-text text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-6 p-4 bg-success/20 border border-success rounded-lg">
            <p className="text-success font-medium mb-2">Invitation sent successfully!</p>
            {invitationLink && (
              <div className="mt-3 p-3 bg-background rounded border border-border">
                <p className="text-xs text-text-secondary mb-1">Invitation link (for testing):</p>
                <a
                  href={invitationLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-xs break-all hover:underline"
                >
                  {invitationLink}
                </a>
              </div>
            )}
            <button
              onClick={handleClose}
              className="mt-4 px-4 py-2 bg-primary hover:bg-primary-hover text-background font-semibold rounded transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-error/20 border border-error rounded-lg">
            <p className="text-error">{error}</p>
          </div>
        )}

        {/* Invite Form */}
        {!success && (
          <form onSubmit={handleSubmit} className="mt-auto">
            <div className="mb-6">
              <label htmlFor="email" className="block text-sm font-medium text-text">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="family@example.com"
                className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text placeholder-text-muted focus:outline-none focus:border-primary transition-colors"
                disabled={loading}
                autoFocus
              />
              <p className="mt-2 text-xs text-text-muted">
                An invitation will be sent to this email address. The invitation expires in 7 days.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 bg-surface-elevated hover:bg-border text-text rounded transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-background font-semibold rounded transition-colors disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
