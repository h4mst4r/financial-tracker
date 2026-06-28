"""Invitee-side invitation transport (ARCH §2.6/§3.4 — Story 2.6a).

Token-keyed, **not** household-scoped (the accepter has a NULL household until they join):
- `GET /api/invitations/{token}` — **public** validate; depends only on `get_db` (no
  `get_current_person`), so a logged-out request returns 200 with a reason code. It must **never**
  401/404 — a 401 would trip the SPA api-client's `/login` redirect (Story 2.6b gotcha #1).
- `POST /{token}/accept` / `POST /{token}/decline` — require a session (`get_current_person`) but
  **not** a household; CSRF-protected by the middleware like any mutation.
"""

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_current_person
from backend.models.identity import Person
from backend.rate_limit import AUTH_RATE_LIMIT, limiter
from backend.schemas.household import InvitationValidateOut
from backend.services import invitation as invitation_service

router = APIRouter(prefix="/api", tags=["invitations"])


@router.get("/invitations/{token}")
@limiter.limit(AUTH_RATE_LIMIT)
async def validate_invitation(
    request: Request,
    token: str,
    db: AsyncSession = Depends(get_db),
) -> InvitationValidateOut:
    """Public token validation — always 200 (`status` = `pending` | `invalid`); no session.

    Rate-limited per IP (parity with `/auth/*`): the one public, unauthenticated, DB-hitting route,
    so the limiter caps anonymous load. Tokens are `uuid4`, so this is defence-in-depth, not an
    enumeration fix."""
    result = await invitation_service.validate_token(db, token)
    return InvitationValidateOut(**result)


@router.post("/invitations/{token}/accept", status_code=204)
async def accept_invitation(
    token: str,
    person: Person = Depends(get_current_person),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Join the inviting household as a member. 400 invalid/expired; 403 email mismatch; 409 if the
    person already belongs to a household (the conflict path must leave/delete first)."""
    await invitation_service.accept_invitation(db, person, token)
    return Response(status_code=204)


@router.post("/invitations/{token}/decline", status_code=204)
async def decline_invitation(
    token: str,
    person: Person = Depends(get_current_person),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Decline an invitation — terminal, permanent. 400 invalid/expired; 403 email mismatch."""
    await invitation_service.decline_invitation(db, person, token)
    return Response(status_code=204)
