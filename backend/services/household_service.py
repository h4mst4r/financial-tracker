"""Household member management service.

Covers:
    - Household read/update
    - Person list / update / delete (archive or hard-delete)
    - Invitation create / list / cancel / accept
    - Role management
"""

from datetime import timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.base import StatusEnum, utcnow
from backend.models.category import Category
from backend.models.currency import Currency
from backend.models.event import FinancialEvent
from backend.models.household import Household
from backend.models.person import HouseholdInvitation, Person, Session as PersonSession
from backend.schemas.household import HouseholdUpdate
from backend.schemas.person import InvitationCreate, PersonUpdate, RoleUpdate
from backend.services.audit_service import audit_service

_ROLE_HIERARCHY = {"member": 1, "admin": 2, "owner": 3}
_INVITATION_EXPIRY_DAYS = 7


# ---------------------------------------------------------------------------
# Household
# ---------------------------------------------------------------------------


async def get_household(db: AsyncSession, household_id: UUID) -> Household:
    result = await db.execute(
        select(Household).where(Household.id == household_id)
    )
    hh = result.scalar_one_or_none()
    if hh is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Household not found",
        )
    return hh


async def update_household(
    db: AsyncSession,
    household_id: UUID,
    actor_id: UUID,
    data: HouseholdUpdate,
) -> Household:
    hh = await get_household(db, household_id)
    before = {"name": hh.name, "timezone": hh.timezone}

    if data.name is not None:
        hh.name = data.name
    if data.timezone is not None:
        hh.timezone = data.timezone

    await db.flush()
    await audit_service.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="update",
        entity_type="household",
        entity_id=household_id,
        before=before,
        after={"name": hh.name, "timezone": hh.timezone},
    )
    return hh


# ---------------------------------------------------------------------------
# Persons
# ---------------------------------------------------------------------------


async def list_persons(db: AsyncSession, household_id: UUID) -> list[Person]:
    result = await db.execute(
        select(Person).where(
            Person.household_id == household_id,
            Person.archived == False,
        )
    )
    return list(result.scalars().all())


async def get_person(
    db: AsyncSession,
    household_id: UUID,
    person_id: UUID,
) -> Person:
    result = await db.execute(
        select(Person).where(
            Person.id == person_id,
            Person.household_id == household_id,
            Person.archived == False,
        )
    )
    person = result.scalar_one_or_none()
    if person is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Person not found",
        )
    return person


async def update_person(
    db: AsyncSession,
    household_id: UUID,
    actor_id: UUID,
    target_id: UUID,
    data: PersonUpdate,
    requesting_person: Person,
) -> Person:
    is_self = requesting_person.id == target_id
    is_admin_or_above = (
        _ROLE_HIERARCHY.get(requesting_person.role, 0) >= _ROLE_HIERARCHY["admin"]
    )
    if not is_self and not is_admin_or_above:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions: self or admin+ required",
        )

    person = await get_person(db, household_id, target_id)

    if data.display_name is not None:
        person.display_name = data.display_name
    if data.display_currency is not None:
        person.display_currency = data.display_currency
    if data.default_view is not None:
        if data.default_view not in ("household", "personal"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="default_view must be 'household' or 'personal'",
            )
        person.default_view = data.default_view

    person.updated_by = actor_id
    await db.flush()
    return person


async def delete_person(
    db: AsyncSession,
    household_id: UUID,
    actor_id: UUID,
    target_id: UUID,
) -> dict:
    person = await get_person(db, household_id, target_id)

    if person.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete the household owner",
        )

    # Check for any linked financial events (created_by, updated_by, or payee)
    has_events = await db.scalar(
        select(func.count()).where(
            FinancialEvent.household_id == household_id,
            or_(
                FinancialEvent.created_by == target_id,
                FinancialEvent.updated_by == target_id,
                FinancialEvent.payee_person_id == target_id,
            ),
        )
    )

    if has_events:
        person.archived = True
        person.archived_at = utcnow()
        person.archived_by = actor_id
        person.status = StatusEnum.archived
        await db.flush()
        await audit_service.log(
            db,
            household_id=household_id,
            actor_id=actor_id,
            action="archive",
            entity_type="person",
            entity_id=target_id,
            before={"email": person.email, "role": person.role},
            after={"status": "archived"},
        )
        return {"action": "archived", "id": str(target_id)}

    await audit_service.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="delete",
        entity_type="person",
        entity_id=target_id,
        before={"email": person.email, "role": person.role},
    )
    await db.delete(person)
    await db.flush()
    return {"action": "deleted", "id": str(target_id)}


# ---------------------------------------------------------------------------
# Invitations
# ---------------------------------------------------------------------------


async def create_invitation(
    db: AsyncSession,
    household_id: UUID,
    actor_id: UUID,
    data: InvitationCreate,
) -> HouseholdInvitation:
    invited_email = data.invited_email.strip()

    # Reject if already a member (case-insensitive via func.lower)
    existing_member = await db.scalar(
        select(Person).where(
            Person.household_id == household_id,
            func.lower(Person.email) == func.lower(invited_email),
            Person.archived == False,
        )
    )
    if existing_member:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is already a member of the household",
        )

    # Reject duplicate pending invitations
    existing_invite = await db.scalar(
        select(HouseholdInvitation).where(
            HouseholdInvitation.household_id == household_id,
            func.lower(HouseholdInvitation.invited_email) == func.lower(invited_email),
            HouseholdInvitation.status == "pending",
        )
    )
    if existing_invite:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A pending invitation already exists for this email",
        )

    now = utcnow()
    invitation = HouseholdInvitation(
        household_id=household_id,
        invited_email=invited_email,
        invited_by=actor_id,
        created_at=now,
        expires_at=now + timedelta(days=_INVITATION_EXPIRY_DAYS),
    )
    db.add(invitation)
    await db.flush()
    return invitation


async def list_invitations(
    db: AsyncSession,
    household_id: UUID,
) -> list[HouseholdInvitation]:
    now = utcnow()
    result = await db.execute(
        select(HouseholdInvitation).where(
            HouseholdInvitation.household_id == household_id,
            HouseholdInvitation.status == "pending",
            HouseholdInvitation.expires_at > now,
        )
    )
    return list(result.scalars().all())


async def cancel_invitation(
    db: AsyncSession,
    household_id: UUID,
    invitation_id: UUID,
) -> HouseholdInvitation:
    result = await db.execute(
        select(HouseholdInvitation).where(
            HouseholdInvitation.id == invitation_id,
            HouseholdInvitation.household_id == household_id,
        )
    )
    inv = result.scalar_one_or_none()
    if inv is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )
    if inv.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending invitations can be cancelled",
        )

    inv.status = "cancelled"
    await db.flush()
    return inv


async def accept_invitation(
    db: AsyncSession,
    invitation_id: UUID,
    person: Person,
) -> HouseholdInvitation:
    result = await db.execute(
        select(HouseholdInvitation).where(
            HouseholdInvitation.id == invitation_id,
        )
    )
    inv = result.scalar_one_or_none()
    if inv is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )

    if inv.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invitation is no longer pending",
        )

    # Email match — Python comparison on already-loaded strings (not a SQL query)
    if person.email.lower() != inv.invited_email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your email does not match this invitation",
        )

    # Expiry check — handle SQLite naive datetimes
    now = utcnow()
    expires_at = inv.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        inv.status = "expired"
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invitation has expired",
        )

    # Re-fetch person in this session — the person arg comes from AuthMiddleware's
    # separate session and is detached here; mutations on it won't be tracked.
    db_person_result = await db.execute(
        select(Person).where(Person.id == person.id)
    )
    db_person = db_person_result.scalar_one_or_none()
    if db_person is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Person not found",
        )

    # Idempotent: person already in target household
    if db_person.household_id == inv.household_id:
        inv.status = "accepted"
        inv.accepted_at = now
        await db.flush()
        return inv

    old_household_id = db_person.household_id

    # Reassign person to the inviting household with member role
    db_person.household_id = inv.household_id
    db_person.role = "member"
    db_person.updated_by = db_person.id
    inv.status = "accepted"
    inv.accepted_at = now
    await db.flush()

    # If the person was the sole member of their old household, clean it up.
    # Their sessions are keyed to person_id (not household_id) so they're kept.
    if old_household_id is not None:
        remaining_result = await db.execute(
            select(func.count(Person.id)).where(Person.household_id == old_household_id)
        )
        if remaining_result.scalar() == 0:
            await _cascade_delete_empty_household(db, old_household_id)

    return inv


async def decline_invitation(
    db: AsyncSession,
    token: UUID,
    person: Person,
) -> tuple[Person, Household]:
    """Decline an invitation — creates a new household for the person.

    Steps:
    1. Fetch invitation by token; raise 404 if not found
    2. Raise 409 if status != "pending"
    3. Raise 403 if person.email != invited_email
    4. Mark invitation as "declined"
    5. If person is already in the invited household, detach and create new household
    6. Return (person, new_household)
    """
    result = await db.execute(
        select(HouseholdInvitation).where(HouseholdInvitation.id == token)
    )
    inv = result.scalar_one_or_none()
    if inv is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )

    if inv.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invitation is no longer pending",
        )

    if person.email.lower() != inv.invited_email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your email does not match this invitation",
        )

    inv.status = "declined"
    await db.flush()

    # Re-fetch person in this session
    db_person_result = await db.execute(
        select(Person).where(Person.id == person.id)
    )
    db_person = db_person_result.scalar_one_or_none()
    if db_person is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Person not found",
        )

    # If person was already assigned to the invited household, detach them
    if db_person.household_id == inv.household_id:
        db_person.household_id = None
        db_person.role = "member"
        await db.flush()

    # Create new household for the person
    from backend.services.auth_service import _create_and_seed_household
    new_household = await _create_and_seed_household(db, db_person)

    return (db_person, new_household)


async def leave_household(
    db: AsyncSession,
    person: Person,
) -> tuple[Person, Household]:
    """Leave current household — creates a new household for the person.

    Raises 403 if person is the owner (owner must delete household instead).
    """
    if person.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only non-owners can leave the household. Delete the household instead.",
        )

    # Re-fetch person in this session
    db_person_result = await db.execute(
        select(Person).where(Person.id == person.id)
    )
    db_person = db_person_result.scalar_one_or_none()
    if db_person is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Person not found",
        )

    # Detach from current household
    db_person.household_id = None
    db_person.role = "member"
    await db.flush()

    # Create new household
    from backend.services.auth_service import _create_and_seed_household
    new_household = await _create_and_seed_household(db, db_person)

    return (db_person, new_household)


# ---------------------------------------------------------------------------
# Role management
# ---------------------------------------------------------------------------


async def update_role(
    db: AsyncSession,
    household_id: UUID,
    actor_id: UUID,
    target_id: UUID,
    data: RoleUpdate,
) -> Person:
    if data.role not in ("admin", "member"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Role must be 'admin' or 'member'",
        )

    # Cannot change your own role
    if actor_id == target_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own role",
        )

    # Re-fetch actor and target in this session (person arg may be detached)
    actor_result = await db.execute(
        select(Person).where(
            Person.id == actor_id,
            Person.household_id == household_id,
        )
    )
    actor = actor_result.scalar_one_or_none()
    if actor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Actor not found in this household",
        )

    target = await get_person(db, household_id, target_id)

    # Rank guard: must be strictly above the target
    if _ROLE_HIERARCHY.get(actor.role, 0) <= _ROLE_HIERARCHY.get(target.role, 0):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient rank to change this member's role",
        )

    # Cannot promote to a rank equal to or above your own
    if _ROLE_HIERARCHY.get(data.role, 0) >= _ROLE_HIERARCHY.get(actor.role, 0):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot promote to a rank equal to or above your own",
        )

    before_role = target.role
    target.role = data.role
    target.updated_by = actor_id
    await db.flush()
    await audit_service.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="update",
        entity_type="person",
        entity_id=target_id,
        before={"role": before_role},
        after={"role": data.role},
    )
    return target


# ---------------------------------------------------------------------------
# Public Invitation Preview
# ---------------------------------------------------------------------------


async def get_invitation_preview(
    db: AsyncSession,
    token: UUID,
) -> dict:
    """Public endpoint — returns invitation details for unauthenticated preview.

    JOINs HouseholdInvitation → Household + Person (invited_by).
    Returns 404 if token not found, 410 if expired/cancelled.
    """
    result = await db.execute(
        select(HouseholdInvitation, Household, Person)
        .outerjoin(Household, Household.id == HouseholdInvitation.household_id)
        .outerjoin(Person, Person.id == HouseholdInvitation.invited_by)
        .where(HouseholdInvitation.id == token)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )

    inv, household, invited_by_person = row

    # If household or inviter was deleted, show what we can
    if household is None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Invitation is no longer valid",
        )
    if invited_by_person is None:
        invited_by_person = type('PersonProxy', (), {'display_name': 'Unknown'})()
    now = utcnow()
    expires_at = inv.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if inv.status != "pending" or expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Invitation has expired or is no longer valid",
        )

    return {
        "household_name": household.name,
        "invited_by_display_name": invited_by_person.display_name,
        "invited_email": inv.invited_email,
        "expires_at": inv.expires_at,
        "status": inv.status,
    }


# ---------------------------------------------------------------------------
# Household Delete
# ---------------------------------------------------------------------------


async def _cascade_delete_empty_household(db: AsyncSession, household_id: UUID) -> None:
    """Delete a household that has no remaining members.

    Called after the last person leaves via invitation acceptance — skips the
    Person delete step because there are no persons left, and keeps their sessions
    intact (sessions are keyed to person_id, not household_id).

    Deletes in FK dependency order (lightweight subset of full cascade).
    """
    from backend.models.account import Account, AccountOwner, RecurringConfig, ValuationRecord
    from backend.models.alert import Alert
    from backend.models.audit import AuditLog
    from backend.models.budget import Budget
    from backend.models.currency import Currency, FxRateHistory
    from backend.models.event import OccurrenceRecord
    from backend.models.formula import Formula
    from sqlalchemy import delete as sa_delete

    # 1. Audit logs (no FK — safe first)
    await db.execute(sa_delete(AuditLog).where(AuditLog.household_id == household_id))

    # 2. Occurrence records (FK → financial_events)
    await db.execute(
        sa_delete(OccurrenceRecord).where(
            OccurrenceRecord.recurring_event_id.in_(
                select(FinancialEvent.id).where(FinancialEvent.household_id == household_id)
            )
        )
    )

    # 3. Financial events
    await db.execute(sa_delete(FinancialEvent).where(FinancialEvent.household_id == household_id))

    # 4. Valuation records (FK → accounts, formulas)
    await db.execute(
        sa_delete(ValuationRecord).where(ValuationRecord.household_id == household_id)
    )

    # 5. Recurring configs (FK → accounts, categories)
    await db.execute(
        sa_delete(RecurringConfig).where(RecurringConfig.household_id == household_id)
    )

    # 6. Account owners (FK → accounts, persons)
    await db.execute(
        sa_delete(AccountOwner).where(
            AccountOwner.account_id.in_(
                select(Account.id).where(Account.household_id == household_id)
            )
        )
    )

    # 7. Accounts
    await db.execute(sa_delete(Account).where(Account.household_id == household_id))

    # 8. Budgets (FK → categories)
    await db.execute(sa_delete(Budget).where(Budget.household_id == household_id))

    # 9. Alerts
    await db.execute(sa_delete(Alert).where(Alert.household_id == household_id))

    # 10. Formulas
    await db.execute(sa_delete(Formula).where(Formula.household_id == household_id))

    # 11. Invitations (FK → household)
    await db.execute(
        sa_delete(HouseholdInvitation).where(HouseholdInvitation.household_id == household_id)
    )

    # 12. Categories
    await db.execute(sa_delete(Category).where(Category.household_id == household_id))

    # 13. FX rate history (FK → currencies) then Currencies
    await db.execute(
        sa_delete(FxRateHistory).where(
            FxRateHistory.currency_id.in_(
                select(Currency.id).where(Currency.household_id == household_id)
            )
        )
    )
    await db.execute(sa_delete(Currency).where(Currency.household_id == household_id))

    # 14. Household — all dependencies cleared (no persons to delete)
    await db.execute(sa_delete(Household).where(Household.id == household_id))
    await db.flush()


async def delete_household(
    db: AsyncSession,
    household_id: UUID,
    actor_id: UUID,
    confirm_name: str,
) -> None:
    """Delete household and all associated records (owner only).

    Deletes in FK dependency order (PRAGMA foreign_keys=ON enforced):

    1.  AuditLog — no FK constraints
    2.  OccurrenceRecord — FK → financial_events
    3.  FinancialEvent — FK → persons (created_by/updated_by/archived_by/payee)
    4.  ValuationRecord — FK → accounts, formulas
    5.  RecurringConfig — FK → accounts, categories, persons
    6.  AccountOwner — FK → accounts, persons
    7.  Account — FK → persons (via BaseEntity)
    8.  Budget — FK → categories, persons
    9.  Alert — FK → persons (via BaseEntity)
    10. Formula — FK → persons (via BaseEntity)
    11. Sessions — FK → persons
    12. Invitations — FK → household
    13. Category — FK → persons (via BaseEntity)
    14. FxRateHistory — FK → currencies
    15. Currency — FK → household
    16. Person — FK → household
    17. Household — root record
    """
    from backend.models.account import Account, AccountOwner, RecurringConfig, ValuationRecord
    from backend.models.alert import Alert
    from backend.models.audit import AuditLog
    from backend.models.budget import Budget
    from backend.models.currency import Currency, FxRateHistory
    from backend.models.event import OccurrenceRecord
    from backend.models.formula import Formula
    from sqlalchemy import delete as sa_delete

    hh = await get_household(db, household_id)

    if confirm_name.lower() != hh.name.lower():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="confirmName does not match the household name",
        )

    # Verify actor is owner
    owner_result = await db.execute(
        select(Person).where(
            Person.id == actor_id,
            Person.household_id == household_id,
            Person.role == "owner",
        )
    )
    if not owner_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the household owner can delete the household",
        )

    # Collect person IDs early (needed for sessions later)
    person_ids_result = await db.execute(
        select(Person.id).where(Person.household_id == household_id)
    )
    person_ids = [row[0] for row in person_ids_result.fetchall()]

    # 1. Audit logs (no FK — safe first)
    await db.execute(sa_delete(AuditLog).where(AuditLog.household_id == household_id))

    # 2. Occurrence records (FK → financial_events)
    await db.execute(
        sa_delete(OccurrenceRecord).where(
            OccurrenceRecord.recurring_event_id.in_(
                select(FinancialEvent.id).where(FinancialEvent.household_id == household_id)
            )
        )
    )

    # 3. Financial events (FK → persons via created_by/updated_by/archived_by/payee)
    await db.execute(sa_delete(FinancialEvent).where(FinancialEvent.household_id == household_id))

    # 4. Valuation records (FK → accounts, formulas)
    await db.execute(
        sa_delete(ValuationRecord).where(ValuationRecord.household_id == household_id)
    )

    # 5. Recurring configs (FK → accounts, categories, persons)
    await db.execute(
        sa_delete(RecurringConfig).where(RecurringConfig.household_id == household_id)
    )

    # 6. Account owners (FK → accounts, persons)
    await db.execute(
        sa_delete(AccountOwner).where(
            AccountOwner.account_id.in_(
                select(Account.id).where(Account.household_id == household_id)
            )
        )
    )

    # 7. Accounts (FK → persons via BaseEntity)
    await db.execute(sa_delete(Account).where(Account.household_id == household_id))

    # 8. Budgets (FK → categories, persons)
    await db.execute(sa_delete(Budget).where(Budget.household_id == household_id))

    # 9. Alerts (FK → persons via BaseEntity)
    await db.execute(sa_delete(Alert).where(Alert.household_id == household_id))

    # 10. Formulas (FK → persons via BaseEntity)
    await db.execute(sa_delete(Formula).where(Formula.household_id == household_id))

    # 11. Sessions (FK → persons)
    if person_ids:
        await db.execute(
            sa_delete(PersonSession).where(PersonSession.person_id.in_(person_ids))
        )

    # 12. Invitations (FK → household)
    await db.execute(
        sa_delete(HouseholdInvitation).where(HouseholdInvitation.household_id == household_id)
    )

    # 13. Categories (FK → persons via BaseEntity)
    await db.execute(sa_delete(Category).where(Category.household_id == household_id))

    # 14. FX rate history (FK → currencies) then Currencies
    await db.execute(
        sa_delete(FxRateHistory).where(
            FxRateHistory.currency_id.in_(
                select(Currency.id).where(Currency.household_id == household_id)
            )
        )
    )
    await db.execute(sa_delete(Currency).where(Currency.household_id == household_id))

    # 15. Persons (FK → household)
    await db.execute(sa_delete(Person).where(Person.household_id == household_id))

    # 16. Household — all dependencies cleared
    await db.execute(sa_delete(Household).where(Household.id == household_id))
    await db.flush()
