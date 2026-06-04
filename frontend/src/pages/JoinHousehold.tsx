import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useAlertStore } from '../store/alertStore';
import { useDeclineInvitation } from '../api/usePersons';
import { PublicPage } from '../components/layout/PublicPage';
import { Skeleton } from '../components/ui/Skeleton';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';

interface QueryError extends Error {
  status?: number;
}

interface InvitationPreview {
  householdName: string;
  invitedByDisplayName: string;
  invitedEmail: string;
  expiresAt: string;
  status: string;
}

/** Format ISO date as "DD MMM YYYY" */
function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function JoinHousehold() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const currentPerson = useAuthStore((s) => s.currentPerson);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['invitation-preview', token],
    queryFn: () => api.get<InvitationPreview>(`/api/invitations/${token}`).then(r => r.data),
    retry: false,
    enabled: !!token,
  });

  const queryError = error as QueryError | null;
  const isNotFound = queryError?.status === 404;
  const isGone = queryError?.status === 410;
  const hasQueryError = error != null && !isNotFound && !isGone;

  const acceptMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/invitations/${token}/accept`).then(r => r.data),
    onSuccess: () => navigate('/dashboard', { replace: true }),
    onError: (err: unknown) => {
      const apiErr = err as ApiError;
      if (apiErr?.status === 403) {
        setAcceptError('This invitation was sent to a different email address — sign in with the correct account');
      } else {
        setAcceptError('Failed to accept invitation. Please try again.');
      }
    },
  });

  const declineMutation = useDeclineInvitation();

  const handleUnauthenticatedAccept = () => {
    if (token) {
      sessionStorage.setItem('pendingInviteToken', token);
    }
    window.location.href = '/auth/login';
  };

  // Loading state — Skeleton shape="card" per AC 3
  if (isLoading) {
    return (
      <PublicPage title="Financial Tracker">
        <Skeleton shape="card" />
      </PublicPage>
    );
  }

  // 404 — invitation not found (AC 3)
  if (isNotFound) {
    return (
      <PublicPage title="Financial Tracker">
        <AlertBanner variant="error" message="Invitation not found" />
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate('/login')}>
            Back to Login
          </Button>
        </div>
      </PublicPage>
    );
  }

  // 410 — invitation expired or cancelled (AC 3)
  if (isGone) {
    return (
      <PublicPage title="Financial Tracker">
        <AlertBanner variant="error" message="This invitation has expired or is no longer valid" />
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate('/login')}>
            Back to Login
          </Button>
        </div>
      </PublicPage>
    );
  }

  // Generic query error (network, 500, etc.)
  if (hasQueryError) {
    return (
      <PublicPage title="Financial Tracker">
        <AlertBanner variant="error" message="Unable to load this invitation. Please check the link and try again." />
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate('/login')}>
            Back to Login
          </Button>
        </div>
      </PublicPage>
    );
  }

  // Generic error
  if (error) {
    return (
      <PublicPage title="Financial Tracker">
        <AlertBanner variant="error" message="Unable to load this invitation. Please check the link and try again." />
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate('/login')}>
            Back to Login
          </Button>
        </div>
      </PublicPage>
    );
  }

  // Invitation card
  if (data) {
    return (
      <PublicPage title="Financial Tracker">
        <div className="space-y-4">
          {/* Invitation details */}
          <div>
            <p className="text-text-secondary text-sm">You&apos;ve been invited to join</p>
            <p className="text-text-primary font-semibold text-lg">{data.householdName}</p>
          </div>
          <div className="text-text-secondary text-sm space-y-1">
            <p>Invited by {data.invitedByDisplayName}</p>
            <p>Expires {formatExpiry(data.expiresAt)}</p>
          </div>

          {/* Accept error banner (AC 5) */}
          {acceptError && (
            <AlertBanner
              variant="error"
              message={acceptError}
              onDismiss={() => setAcceptError(null)}
            />
          )}

          {/* CTAs — authenticated (AC 5) */}
          {currentPerson ? (
            <div className="flex flex-col gap-2">
              <Button
                variant="primary"
                loading={acceptMutation.isPending}
                onClick={() => {
                  setAcceptError(null);
                  acceptMutation.mutate();
                }}
              >
                Accept Invitation
              </Button>
              <Button
                variant="secondary"
                loading={declineMutation.isPending}
                onClick={() => {
                  if (!token) return;
                  setAcceptError(null);
                  declineMutation.mutate(token, {
                    onSuccess: (resp: any) => {
                      const setAuth = useAuthStore.getState().setAuth;
                      const person = resp.person;
                      setAuth(
                        {
                          personId: person.personId,
                          displayName: person.displayName,
                          email: person.email,
                          role: person.role,
                          defaultView: person.defaultView,
                          displayCurrency: person.displayCurrency,
                          pictureUrl: person.pictureUrl,
                        },
                        resp.household.householdId,
                        resp.csrfToken,
                      );
                      sessionStorage.setItem('hasSeenWelcome', '1');
                      useAlertStore.getState().enqueue({
                        variant: 'success',
                        title: 'Household created',
                        message: `Your household "${resp.household.name}" has been created.`,
                        action: { label: 'Invite Members', onClick: () => { window.location.href = '/settings?tab=members'; } },
                      });
                      navigate('/dashboard', { replace: true });
                    },
                    onError: (err: unknown) => {
                      const apiErr = err as ApiError;
                      setAcceptError(
                        apiErr?.status === 403
                          ? 'This invitation belongs to a different email address.'
                          : 'Failed to decline invitation. Please try again.',
                      );
                    },
                  });
                }}
              >
                Decline
              </Button>
            </div>
          ) : (
            // CTAs — unauthenticated (AC 4)
            <div className="flex flex-col gap-2">
              <Button variant="primary" onClick={handleUnauthenticatedAccept}>
                Accept Invitation
              </Button>
              <Button variant="secondary" onClick={() => navigate('/login')}>
                Decline
              </Button>
            </div>
          )}
        </div>
      </PublicPage>
    );
  }

  return null;
}
