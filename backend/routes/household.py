"""Household and member management routes.

Endpoints:
    GET    /api/household                        — Get household details
    PATCH  /api/household                        — Update household (owner only)
    DELETE /api/household                        — Delete household (owner only)
    GET    /api/persons                          — List household members
    POST   /api/persons/invite                   — Invite member (admin+)
    POST   /api/persons/leave                    — Leave household (non-owner)
    GET    /api/persons/invitations              — List pending invitations (admin+)
    DELETE /api/persons/invitations/{inv_id}     — Cancel invitation (admin+)
    GET    /api/persons/{person_id}              — Get person
    PATCH  /api/persons/{person_id}              — Update person (self or admin+)
    DELETE /api/persons/{person_id}              — Remove person (admin+)
    PATCH  /api/persons/{person_id}/role         — Change role (admin+)
    GET    /api/invitations/{token}              — Public invitation preview
    POST   /api/invitations/{token}/decline      — Decline invitation (authenticated)
    POST   /api/invitations/{inv_id}/accept      — Accept invitation (authenticated)

Route ordering: static paths (/invite, /invitations, /leave) are declared BEFORE parameterised
/{person_id} to prevent FastAPI matching the static segments as UUID values.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import (
    get_current_person,
    get_household_id,
    require_role,
)
from backend.models.person import Person
from backend.schemas.household import HouseholdDelete, HouseholdResponse, HouseholdUpdate, InvitationPreviewResponse
from backend.schemas.person import (
    InvitationCreate,
    InvitationResponse,
    PersonResponse,
    PersonUpdate,
    RoleUpdate,
)
from backend.services import household_service

router = APIRouter(tags=["household"])


# ---------------------------------------------------------------------------
# Household
# ---------------------------------------------------------------------------


@router.get("/household", response_model=HouseholdResponse)
async def get_household(
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> HouseholdResponse:
    hh = await household_service.get_household(db, household_id)
    return HouseholdResponse.model_validate(hh)


@router.patch("/household", response_model=HouseholdResponse)
async def update_household(
    data: HouseholdUpdate,
    person: Person = Depends(require_role("owner")),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> HouseholdResponse:
    hh = await household_service.update_household(db, household_id, person.id, data)
    return HouseholdResponse.model_validate(hh)


@router.delete("/household", status_code=status.HTTP_204_NO_CONTENT)
async def delete_household(
    data: HouseholdDelete,
    person: Person = Depends(require_role("owner")),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete household — owner only. Protected by CSRF token."""
    await household_service.delete_household(db, household_id, person.id, data.confirm_name)


# ---------------------------------------------------------------------------
# Persons — static routes BEFORE /{person_id}
# ---------------------------------------------------------------------------


@router.get("/persons", response_model=list[PersonResponse])
async def list_persons(
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> list[PersonResponse]:
    persons = await household_service.list_persons(db, household_id)
    return [PersonResponse.model_validate(p) for p in persons]


# POST /persons/invite — declared BEFORE /persons/{person_id}
@router.post(
    "/persons/invite",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def invite_member(
    data: InvitationCreate,
    person: Person = Depends(require_role("admin")),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> InvitationResponse:
    inv = await household_service.create_invitation(db, household_id, person.id, data)
    return InvitationResponse.model_validate(inv)


# GET /persons/invitations — declared BEFORE /persons/{person_id}
@router.get("/persons/invitations", response_model=list[InvitationResponse])
async def list_invitations(
    _person: Person = Depends(require_role("admin")),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> list[InvitationResponse]:
    invitations = await household_service.list_invitations(db, household_id)
    return [InvitationResponse.model_validate(i) for i in invitations]


# DELETE /persons/invitations/{inv_id} — declared BEFORE /persons/{person_id}
@router.delete("/persons/invitations/{inv_id}", response_model=InvitationResponse)
async def cancel_invitation(
    inv_id: UUID,
    person: Person = Depends(require_role("admin")),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> InvitationResponse:
    inv = await household_service.cancel_invitation(db, household_id, inv_id)
    return InvitationResponse.model_validate(inv)


# POST /persons/leave — declared BEFORE /persons/{person_id}
@router.post("/persons/leave")
async def leave_household_route(
    request: Request,
    person: Person = Depends(get_current_person),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Leave current household — creates new household for the person."""
    db_person, new_household = await household_service.leave_household(db, person)

    session_obj = getattr(request.state, "session", None)
    return {
        "person": {
            "personId": str(db_person.id),
            "displayName": db_person.display_name,
            "email": db_person.email,
            "role": db_person.role,
            "pictureUrl": db_person.picture_url,
            "defaultView": db_person.default_view,
            "displayCurrency": db_person.display_currency,
        },
        "household": {
            "householdId": str(new_household.id),
            "name": new_household.name,
            "baseCurrency": new_household.base_currency,
            "timezone": new_household.timezone,
        },
        "csrfToken": session_obj.csrf_token if session_obj else None,
        "isFirstLogin": True,
        "pendingInvitationToken": None,
    }


# ---------------------------------------------------------------------------
# Persons — parameterised routes AFTER static ones
# ---------------------------------------------------------------------------


@router.get("/persons/{person_id}", response_model=PersonResponse)
async def get_person(
    person_id: UUID,
    _auth: Person = Depends(get_current_person),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> PersonResponse:
    person = await household_service.get_person(db, household_id, person_id)
    return PersonResponse.model_validate(person)


@router.patch("/persons/{person_id}", response_model=PersonResponse)
async def update_person(
    person_id: UUID,
    data: PersonUpdate,
    requesting_person: Person = Depends(get_current_person),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> PersonResponse:
    person = await household_service.update_person(
        db, household_id, requesting_person.id, person_id, data, requesting_person
    )
    return PersonResponse.model_validate(person)


@router.delete("/persons/{person_id}")
async def delete_person(
    person_id: UUID,
    requesting_person: Person = Depends(require_role("admin")),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await household_service.delete_person(
        db, household_id, requesting_person.id, person_id
    )


@router.patch("/persons/{person_id}/role", response_model=PersonResponse)
async def update_role(
    person_id: UUID,
    data: RoleUpdate,
    actor: Person = Depends(require_role("admin")),
    household_id: UUID = Depends(get_household_id),
    db: AsyncSession = Depends(get_db),
) -> PersonResponse:
    person = await household_service.update_role(
        db, household_id, actor.id, person_id, data
    )
    return PersonResponse.model_validate(person)


# ---------------------------------------------------------------------------
# Invitation preview (public — no auth) — BEFORE /invitations/{inv_id}/accept
# ---------------------------------------------------------------------------


@router.get("/invitations/{token}", response_model=InvitationPreviewResponse)
async def get_invitation_preview_route(
    token: UUID,
    db: AsyncSession = Depends(get_db),
) -> InvitationPreviewResponse:
    """Public endpoint — no auth dependency required."""
    preview = await household_service.get_invitation_preview(db, token)
    return InvitationPreviewResponse(**preview)


# ---------------------------------------------------------------------------
# Invitation decline — BEFORE /invitations/{inv_id}/accept
# ---------------------------------------------------------------------------


@router.post("/invitations/{token}/decline")
async def decline_invitation_route(
    token: UUID,
    request: Request,
    person: Person = Depends(get_current_person),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Decline invitation — creates new household for the person."""
    db_person, new_household = await household_service.decline_invitation(db, token, person)

    session_obj = getattr(request.state, "session", None)
    return {
        "person": {
            "personId": str(db_person.id),
            "displayName": db_person.display_name,
            "email": db_person.email,
            "role": db_person.role,
            "pictureUrl": db_person.picture_url,
            "defaultView": db_person.default_view,
            "displayCurrency": db_person.display_currency,
        },
        "household": {
            "householdId": str(new_household.id),
            "name": new_household.name,
            "baseCurrency": new_household.base_currency,
            "timezone": new_household.timezone,
        },
        "csrfToken": session_obj.csrf_token if session_obj else None,
        "isFirstLogin": True,
        "pendingInvitationToken": None,
    }


# ---------------------------------------------------------------------------
# Invitation accept
# ---------------------------------------------------------------------------


@router.post("/invitations/{inv_id}/accept", response_model=InvitationResponse)
async def accept_invitation(
    inv_id: UUID,
    person: Person = Depends(get_current_person),
    db: AsyncSession = Depends(get_db),
) -> InvitationResponse:
    inv = await household_service.accept_invitation(db, inv_id, person)
    return InvitationResponse.model_validate(inv)
