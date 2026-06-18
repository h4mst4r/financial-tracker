"""Household configuration transport (ARCH §2.8).

`PATCH /api/household` — owner-scoped name/timezone update (Story 2.4c).
`GET /api/household/members` and `GET /api/household/invitations` — household-scoped read-only
rosters for the Settings → Management tab (Story 2.5, any member may view). The PATCH is
CSRF-protected by the middleware (not exempt); GETs are exempt by method. Base currency is Epic 3.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_household_id, require_role
from backend.models.identity import HouseholdInvitation, Person
from backend.schemas.household import (
    HouseholdUpdate,
    InvitationCreate,
    InvitationListOut,
    InvitationManageListOut,
    InvitationManageOut,
    InvitationOut,
    MemberListOut,
    MemberOut,
)
from backend.services import auth as auth_service
from backend.services import household as household_service
from backend.services import invitation as invitation_service

router = APIRouter(prefix="/api", tags=["household"])

# Module-level singletons so `require_role(...)` isn't a call in an argument default (ruff B008).
_require_owner = require_role("owner")
_require_admin = require_role("admin")


def _manage_out(inv: HouseholdInvitation, now: datetime) -> InvitationManageOut:
    """Map an invitation → the admin manage shape, deriving `expired` at read for a past-due
    pending row (display-only — never written to the DB; ARCH §3.4 / D-EXPIRED-DISPLAY)."""
    expires = inv.expires_at if inv.expires_at.tzinfo else inv.expires_at.replace(tzinfo=UTC)
    status = "expired" if inv.status == "pending" and expires <= now else inv.status
    return InvitationManageOut(
        invitation_id=inv.id,
        invited_email=inv.invited_email,
        status=status,
        expires_at=inv.expires_at,
        created_at=inv.created_at,
    )


@router.patch("/household")
async def patch_household(
    data: HouseholdUpdate,
    person: Person = Depends(_require_owner),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update household name/timezone (owner only); return the §2.14.C household object (ARCH §2.8).

    Scoping is `get_household_id` (the session's household, never the body); the owner gate is
    `require_role`. A non-owner gets 403; a NULL-household session gets 401.
    """
    household = await household_service.update_household(db, household_id, person.id, data)
    return auth_service.household_payload(household)


@router.get("/household/members")
async def get_members(
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> MemberListOut:
    """The household's members (any member may view, FR-HH-002). `get_household_id` 401s a
    NULL-household session — no role gate. `status` is synthetic (`active`) until Story 2.8."""
    members = await household_service.list_members(db, household_id)
    items = [
        MemberOut(
            person_id=m.id,
            display_name=m.display_name,
            email=m.email,
            role=m.role,
            picture_url=m.picture_url,
            colour=m.colour,
            status="active",
        )
        for m in members
    ]
    return MemberListOut(items=items, total=len(items))


@router.get("/household/invitations")
async def get_invitations(
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> InvitationListOut:
    """The household's invitations (any member may view, FR-HH-002). Rows returned as stored —
    invite/revoke/resend actions are Story 2.6."""
    invitations = await household_service.list_invitations(db, household_id)
    items = [
        InvitationOut(
            invited_email=i.invited_email,
            status=i.status,
            expires_at=i.expires_at,
            created_at=i.created_at,
        )
        for i in invitations
    ]
    return InvitationListOut(items=items, total=len(items))


# ── Admin/owner invitation management (Story 2.6a) ──
# The token-bearing surface (`InvitationManageOut.invitationId`) — role-gated to admin/owner per
# ARCH §3.4. Declared above the `/{invitation_id}` action routes so `…/manage` isn't captured as an
# id (it is a GET vs the POST/DELETE actions, so no real collision — kept adjacent for clarity).


@router.get("/household/invitations/manage")
async def get_invitations_manage(
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> InvitationManageListOut:
    """The household's invitations **with their tokens**, for admin/owner actions (ARCH §3.4).

    A past-due `pending` row is reported as `expired` (derived at read). Members use the token-free
    `GET /api/household/invitations` instead. `require_role("admin")` 403s a plain member."""
    invitations = await household_service.list_invitations(db, household_id)
    now = datetime.now(UTC)
    items = [_manage_out(i, now) for i in invitations]
    return InvitationManageListOut(items=items, total=len(items))


@router.post("/household/invitations")
async def post_invitation(
    data: InvitationCreate,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> InvitationManageOut:
    """Create a 7-day pending invitation (admin/owner); return it incl. its `/join/:token` id.

    409 on a duplicate pending invite or an existing member's email; 400 on a malformed email."""
    invitation = await invitation_service.create_invitation(
        db, household_id, person.id, data.invited_email
    )
    return _manage_out(invitation, datetime.now(UTC))


@router.post("/household/invitations/{invitation_id}/revoke", status_code=204)
async def revoke_invitation(
    invitation_id: str,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Revoke a pending invitation (admin/owner). 404 cross-household; 409 if not pending."""
    await invitation_service.revoke_invitation(db, household_id, person.id, invitation_id)
    return Response(status_code=204)


@router.post("/household/invitations/{invitation_id}/resend")
async def resend_invitation(
    invitation_id: str,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> InvitationManageOut:
    """Reset a pending invitation's 7-day window (admin/owner; in-app). 409 if not pending."""
    invitation = await invitation_service.resend_invitation(
        db, household_id, person.id, invitation_id
    )
    return _manage_out(invitation, datetime.now(UTC))


@router.delete("/household/invitations/{invitation_id}", status_code=204)
async def delete_invitation(
    invitation_id: str,
    person: Person = Depends(_require_admin),
    household_id: str = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Hard-delete a terminal invitation row (admin/owner). 409 if still pending (revoke first)."""
    await invitation_service.delete_invitation(db, household_id, person.id, invitation_id)
    return Response(status_code=204)
