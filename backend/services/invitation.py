"""Invitation lifecycle service (ARCH §2.6/§2.8a/§3.4 — Story 2.6a).

Admin/owner management (`create`/`revoke`/`resend`/`delete`) is household-scoped; the invitee-side
(`validate_token`/`accept`/`decline`) is token-keyed and **not** household-scoped (the accepter may
have a NULL household). Every mutation writes an audit row (FR-SYS-005); reads do not (ARCH §4.7).

The invitation `id` is the `/join/:token` token (ARCH §3.4) — it rides only the role-gated manage
list + actions here, never the member-safe Story 2.5 list.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.models.identity import Household, HouseholdInvitation, Person
from backend.services.audit import audit
from backend.time_utils import as_utc

# 7-day expiry per FR-HH-003 — single source of truth.
INVITE_TTL = timedelta(days=7)


async def _get_scoped(
    db: AsyncSession, household_id: str, invitation_id: str
) -> HouseholdInvitation:
    """Load an invitation by id **within** the household, 404 if missing or cross-household."""
    row = (
        await db.execute(
            select(HouseholdInvitation).where(
                HouseholdInvitation.id == invitation_id,
                HouseholdInvitation.household_id == household_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        errors.not_found("invitation", invitation_id)
    return row


async def create_invitation(
    db: AsyncSession, household_id: str, actor_id: str, invited_email: str
) -> HouseholdInvitation:
    """Create a 7-day pending invitation (admin/owner). Returns the row incl. its token id.

    409 if the email already belongs to a member of THIS household, or an active pending invite to
    this email already exists for THIS household. Inviting an email in ANOTHER household is allowed
    (the Household-Conflict path resolves at the invitee's login).
    """
    email = invited_email.strip()
    if not email or "@" not in email:
        errors.bad_request("Invalid email", "A valid email address is required")

    existing_member = (
        await db.execute(
            select(Person).where(
                Person.household_id == household_id,
                func.lower(Person.email) == func.lower(email),
            )
        )
    ).scalar_one_or_none()
    if existing_member is not None:
        errors.conflict("That person is already a member of this household")

    existing_pending = (
        await db.execute(
            select(HouseholdInvitation).where(
                HouseholdInvitation.household_id == household_id,
                func.lower(HouseholdInvitation.invited_email) == func.lower(email),
                HouseholdInvitation.status == "pending",
            )
        )
    ).scalar_one_or_none()
    if existing_pending is not None:
        errors.conflict("An invitation to that email is already pending")

    invitation = HouseholdInvitation(
        household_id=household_id,
        invited_email=email,
        invited_by=actor_id,
        expires_at=datetime.now(UTC) + INVITE_TTL,
        status="pending",
    )
    db.add(invitation)
    await db.flush()
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="create",
        entity_type="household_invitation",
        entity_id=invitation.id,
        after={"invited_email": email, "status": "pending"},
    )
    return invitation


async def revoke_invitation(
    db: AsyncSession, household_id: str, actor_id: str, invitation_id: str
) -> None:
    """Flip a pending invitation to `revoked` (admin/owner). 409 if not pending."""
    invitation = await _get_scoped(db, household_id, invitation_id)
    if invitation.status != "pending":
        errors.conflict("Only a pending invitation can be revoked")
    before = {"status": invitation.status}
    invitation.status = "revoked"
    await db.flush()
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="revoke",
        entity_type="household_invitation",
        entity_id=invitation.id,
        before=before,
        after={"status": "revoked"},
    )


async def resend_invitation(
    db: AsyncSession, household_id: str, actor_id: str, invitation_id: str
) -> HouseholdInvitation:
    """Reset a pending invitation's 7-day window (admin/owner; in-app). 409 if not pending."""
    invitation = await _get_scoped(db, household_id, invitation_id)
    if invitation.status != "pending":
        errors.conflict("Only a pending invitation can be resent")
    before = {"expires_at": as_utc(invitation.expires_at).isoformat()}
    invitation.expires_at = datetime.now(UTC) + INVITE_TTL
    await db.flush()
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="resend",
        entity_type="household_invitation",
        entity_id=invitation.id,
        before=before,
        after={"expires_at": as_utc(invitation.expires_at).isoformat()},
    )
    return invitation


async def delete_invitation(
    db: AsyncSession, household_id: str, actor_id: str, invitation_id: str
) -> None:
    """Hard-delete a terminal invitation row (admin/owner). 409 only if still actively pending.

    A past-expiry `pending` row is presented as `expired` (terminal) on the manage list, so it is
    deletable directly (AC4) — only a genuinely fresh (not-yet-expired) pending invite must be
    revoked first.
    """
    invitation = await _get_scoped(db, household_id, invitation_id)
    if invitation.status == "pending" and as_utc(invitation.expires_at) > datetime.now(UTC):
        errors.conflict("Revoke the invitation before deleting it")
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="delete",
        entity_type="household_invitation",
        entity_id=invitation.id,
        before={"invited_email": invitation.invited_email, "status": invitation.status},
    )
    await db.delete(invitation)
    await db.flush()


async def validate_token(db: AsyncSession, token: str) -> dict:
    """Read-only public validation (never raises). Returns the §4.1a reason + invite context.

    `{"status": "pending", …}` only while actionable (`pending` and not past `expires_at`); else
    `{"status": "invalid"}` for any non-actionable case (unknown / accepted / declined / revoked /
    expired). Does not mutate — there is no lazy `pending → expired` flip (ARCH §3.4).
    """
    invitation = (
        await db.execute(select(HouseholdInvitation).where(HouseholdInvitation.id == token))
    ).scalar_one_or_none()
    if (
        invitation is None
        or invitation.status != "pending"
        or as_utc(invitation.expires_at) <= datetime.now(UTC)
    ):
        return {"status": "invalid"}

    household = (
        await db.execute(select(Household).where(Household.id == invitation.household_id))
    ).scalar_one_or_none()
    inviter = (
        await db.execute(select(Person).where(Person.id == invitation.invited_by))
    ).scalar_one_or_none()
    return {
        "status": "pending",
        "household_name": household.name if household is not None else None,
        "invited_by_display_name": (inviter.display_name or inviter.email) if inviter else None,
        "invited_email": invitation.invited_email,
        "expires_at": invitation.expires_at,
    }


async def _load_actionable_for(db: AsyncSession, person: Person, token: str) -> HouseholdInvitation:
    """Shared accept/decline guard: token must be pending+fresh and addressed to this person."""
    invitation = (
        await db.execute(select(HouseholdInvitation).where(HouseholdInvitation.id == token))
    ).scalar_one_or_none()
    if (
        invitation is None
        or invitation.status != "pending"
        or as_utc(invitation.expires_at) <= datetime.now(UTC)
    ):
        errors.bad_request("Invalid invitation", "This invitation is no longer valid")
    # Both sides are already-loaded Python strings here (not a SQL expression), so a plain
    # case-insensitive compare is correct — the func.lower rule is for WHERE-clause uniqueness.
    if invitation.invited_email.lower() != person.email.lower():
        errors.forbidden(detail="This invitation was sent to a different account")
    return invitation


async def accept_invitation(db: AsyncSession, person: Person, token: str) -> None:
    """Join the inviting household as a member (ARCH §2.6/§2.8a).

    Guards: pending+fresh, email match (403 else), and the person must have NO household (409 else —
    the in-place accept is impossible; the conflict path must leave/delete first). Clears
    `detachment_reason`/`detached_at` so a re-joining ex-member is restored.
    """
    invitation = await _load_actionable_for(db, person, token)
    if person.household_id is not None:
        errors.conflict(
            "You already belong to a household; leave or delete it before joining another"
        )

    # `person` comes from `get_current_person` (the CSRF middleware's now-closed session), so it is
    # detached from this request's `db`. Re-load it here so the mutation is tracked and persisted.
    person_row = (await db.execute(select(Person).where(Person.id == person.id))).scalar_one()
    person_row.household_id = invitation.household_id
    person_row.role = "member"
    person_row.detachment_reason = None
    person_row.detached_at = None
    invitation.status = "accepted"
    invitation.accepted_at = datetime.now(UTC)
    await db.flush()
    await audit.log(
        db,
        household_id=invitation.household_id,
        actor_id=person.id,
        action="accept",
        entity_type="household_invitation",
        entity_id=invitation.id,
        after={"status": "accepted", "person_id": person.id},
    )


async def decline_invitation(db: AsyncSession, person: Person, token: str) -> None:
    """Decline an invitation — terminal, permanent (ARCH §3.4). Works with/without a household."""
    invitation = await _load_actionable_for(db, person, token)
    invitation.status = "declined"
    await db.flush()
    await audit.log(
        db,
        household_id=invitation.household_id,
        actor_id=person.id,
        action="decline",
        entity_type="household_invitation",
        entity_id=invitation.id,
        after={"status": "declined"},
    )
