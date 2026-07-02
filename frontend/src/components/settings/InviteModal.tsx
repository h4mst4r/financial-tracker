import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { EntityModal } from '../entity/EntityModal'
import { Input } from '../primitives/Input'
import { Label } from '../primitives/Label'
import { useFormValidation, REQUIRED_FIELDS_NOTE } from '../primitives/behaviors'
import { useAlertStore } from '../../stores/alertStore'
import { api, ApiError } from '../../api/client'
import type { InvitationManage } from '../../types/household'

interface InviteModalProps {
  open: boolean
  onClose: () => void
}

/**
 * Send-invite dialog (UX §5.2, FR-HH-003). Posts a Google email to the admin-gated create endpoint;
 * on success refetches the manage list, toasts, and closes. A 409 (already a member / already
 * invited) surfaces inline from the RFC 7807 `detail` — the server re-validates, so the client guard
 * is only a trim + `@` presence check to gate the Send button.
 */
export function InviteModal({ open, onClose }: InviteModalProps) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const pushToast = useAlertStore((s) => s.pushToast)
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post<InvitationManage>('/api/household/invitations', {
          invitedEmail: email.trim(),
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['household', 'invitations', 'manage'] })
      pushToast({ message: 'Invitation sent', variant: 'success' })
      handleClose()
    },
    onError: (err) => {
      const detail = err instanceof ApiError ? err.details?.detail : null
      setError(typeof detail === 'string' ? detail : 'Could not send the invitation.')
    },
  })

  function handleClose() {
    setEmail('')
    setError(null)
    onClose()
  }

  const trimmed = email.trim()
  // UX §6 — Send is never disabled for a missing email (only while the invite is in-flight); a submit
  // attempt with no `@` reddens + shakes the field and shows the summary note.
  const validation = useFormValidation({ fields: [{ id: 'invite-email', invalid: !trimmed.includes('@') }] })

  return (
    <EntityModal
      open={open}
      title="Invite a member"
      cancelLabel="Cancel"
      saveLabel="Send"
      saveDisabled={create.isPending}
      cancelDisabled={create.isPending}
      errorSummary={validation.showSummary ? REQUIRED_FIELDS_NOTE : undefined}
      shakeSave={validation.shaking}
      onClose={handleClose}
      onSave={() => validation.submit(() => create.mutate())}
    >
      <div className="flex flex-col gap-2xs md:col-span-2">
        <Label htmlFor="invite-email">Google email</Label>
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (error) setError(null)
          }}
          error={!!error || validation.errors['invite-email']}
        />
        {error && <p className="text-sm text-error">{error}</p>}
      </div>
    </EntityModal>
  )
}
