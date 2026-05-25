/**
 * Accept Invitation Page
 * 
 * Page shown when user clicks an invitation link.
 * Allows them to accept and join the household.
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface InvitationData {
  id: string;
  household_id: string;
  email: string;
  invited_by: string;
  status: string;
  expires_at: string;
  created_at: string;
  is_expired: boolean;
}

export default function AcceptInvitationPage() {
  const { invitationId } = useParams<{ invitationId: string }>();
  const { user, isLoading: authLoading, csrfToken } = useAuth();
  
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!invitationId) {
      setError('Invalid invitation link');
      setLoading(false);
      return;
    }

    fetchInvitation();
  }, [invitationId]);

  const fetchInvitation = async () => {
    try {
      const sessionId = localStorage.getItem('session_id');
      const response = await fetch(`/api/households/invitations/${invitationId}`, {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to fetch invitation');
      }
      
      const data = await response.json();
      setInvitation(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!invitationId) return;
    
    setAccepting(true);
    setError(null);

    try {
      const sessionId = localStorage.getItem('session_id');
      const response = await fetch(`/api/households/invitations/${invitationId}/accept`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken || '',
          ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to accept invitation');
      }

      setSuccess(true);
      
      // Full page reload — triggers fresh checkAuth which will see no pending invitations
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAccepting(false);
    }
  };

 const handleDecline = async () => {
    if (!invitationId) return;
    
    setDeclining(true);
    setError(null);

    try {
      const sessionId = localStorage.getItem('session_id');
      const response = await fetch(`/api/households/invitations/${invitationId}/decline`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken || '',
          ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to decline invitation');
      }

      // Full page reload — triggers fresh checkAuth
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeclining(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-primary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        {/* Error State */}
        {error && (
          <div className="card text-center border-error">
            <div className="text-error text-4xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-error mb-4">Invitation Error</h1>
            <p className="text-text-secondary mb-6">{error}</p>
            <Link
              to="/dashboard"
              className="btn-primary inline-block px-6 py-3"
            >
              Back to Dashboard
            </Link>
          </div>
        )}

        {/* Success State */}
        {success && (
          <div className="card text-center border-success">
            <div className="text-success text-4xl mb-4">✓</div>
            <h1 className="text-2xl font-bold text-success mb-4">Welcome to the Household!</h1>
            <p className="text-text-secondary mb-6">You have successfully joined the household.</p>
            <p className="text-text-muted text-sm">Redirecting to dashboard...</p>
          </div>
        )}

        {/* Accept Invitation */}
        {!error && !success && invitation && (
          <div className="card text-center">
            <div className="text-primary text-4xl mb-4">📨</div>
            <h1 className="text-2xl font-bold text-primary mb-6">Join Household</h1>

            {user ? (
              <>
                <div className="mb-6 text-left">
                  <p className="text-text-secondary mb-2">
                    You're invited to join <strong className="text-text">{invitation.email}</strong>'s household
                  </p>
                  <p className="text-text-muted text-sm">
                    Invited on {new Date(invitation.created_at).toLocaleDateString()}
                    {invitation.is_expired && (
                      <span className="text-error ml-2">⚠️ This invitation has expired</span>
                    )}
                  </p>
                </div>

                {invitation.is_expired ? (
                  <div className="text-error mb-6">
                    This invitation has expired. Please request a new invitation.
                  </div>
                ) : (
                  <>
                    <button
                      onClick={handleAccept}
                      disabled={accepting}
                      className="btn-primary w-full px-6 py-3 mb-3"
                    >
                      {accepting ? 'Joining...' : 'Join Household'}
                    </button>
                    <button
                      onClick={handleDecline}
                      disabled={declining}
                      className="btn-action-error w-full px-6 py-3"
                    >
                      {declining ? 'Declining...' : 'Decline Invitation'}
                    </button>
                  </>
                )}

                <p className="mt-4 text-sm text-text-muted">
                  You will be added as a <span className="text-primary">Member</span>
                </p>
              </>
            ) : (
              <>
                <p className="text-text-secondary mb-6">
                  Please sign in to accept this invitation
                </p>
                <Link
                  to="/login"
                  className="btn-primary inline-block px-6 py-3"
                >
                  Sign In with Google
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
