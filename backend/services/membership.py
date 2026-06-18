"""Membership transition service (ARCH §2.8a — Story 2.7).

The three exit paths, each household-scoped and audited (FR-SYS-005):
- `delete_household` (Path A, owner): hard-delete every household-scoped row (the FR-HH-005
  teardown, §3.0 principle 4), detach all members, invalidate all member sessions. **Irreversible.**
- `leave_household` (Path B, admin/member self): detach the caller, invalidate their session.
- `remove_member` (Path C, admin/owner): detach another member, invalidate their session.

Detachment stamps `detachment_reason`/`detached_at` on the surviving `Person` so the next login
routes to the matching §3 page (the OAuth callback reads it, §2.6 step 4). The owned-data archive
named in §2.8a Path B/C is deferred to Epic 4 — no owned entities exist until then (D-ARCHIVE).
"""

from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import Table, delete, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.errors import problem
from backend.models.base import Base
from backend.models.identity import Household, Person, Session
from backend.services.audit import audit

# Tables that carry `household_id` but must NOT be swept by the teardown: `audit_logs` is
# append-only and records the deletion (survives, ARCH §3.9); `persons` are detached, not deleted.
_TEARDOWN_SKIP = {"audit_logs", "persons"}


def _conflict(detail: str) -> None:
    """Raise 409 Conflict (RFC 7807) — no generic 409 helper exists in `errors`."""
    raise HTTPException(
        status_code=409,
        detail=problem(type_="conflict", title="Conflict", status=409, detail=detail),
    )


def _household_tables() -> list[Table]:
    """Every `household_id`-bearing table (minus the skip set), so future epics' tables auto-join
    the teardown. Order is irrelevant — `delete_household` defers FK checks to commit (D-TEARDOWN).
    """
    return [
        table
        for table in Base.metadata.sorted_tables
        if "household_id" in table.c and table.name not in _TEARDOWN_SKIP
    ]


async def delete_household(db: AsyncSession, household_id: str, actor_id: str) -> None:
    """Path A — hard-delete the household and ALL its data; detach members; kill every session.

    FK enforcement is ON (database.py), so a bulk teardown across self-referential /
    cross-referencing tables would FK-violate mid-statement. `PRAGMA defer_foreign_keys=ON` defers
    all FK checks to the commit (the request boundary), making the deletes order-independent; SQLite
    auto-resets the flag at COMMIT/ROLLBACK. Member `Person` rows survive (detached); `audit_logs`
    survives (append-only).
    """
    await db.execute(text("PRAGMA defer_foreign_keys=ON"))

    member_ids = (
        (await db.execute(select(Person.id).where(Person.household_id == household_id)))
        .scalars()
        .all()
    )

    now = datetime.now(UTC)
    await db.execute(
        update(Person)
        .where(Person.household_id == household_id)
        .values(household_id=None, detachment_reason="household_deleted", detached_at=now)
    )
    if member_ids:
        await db.execute(delete(Session).where(Session.person_id.in_(member_ids)))

    for table in _household_tables():
        await db.execute(delete(table).where(table.c.household_id == household_id))
    await db.execute(delete(Household).where(Household.id == household_id))

    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="delete",
        entity_type="household",
        entity_id=household_id,
    )
    await db.flush()


async def leave_household(
    db: AsyncSession, person: Person, household_id: str, actor_id: str
) -> None:
    """Path B — the caller detaches themselves (`detachment_reason='left'`) + their session is gone.

    `person` must be the **writable** (route-session) Person (`get_writable_person`). An owner
    cannot leave a household they own (no ownership transfer in MVP) — 409; they must delete it.
    """
    if person.role == "owner":
        _conflict("An owner cannot leave the household; delete it instead.")

    person.household_id = None
    person.detachment_reason = "left"
    person.detached_at = datetime.now(UTC)
    await db.execute(delete(Session).where(Session.person_id == person.id))
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="delete",
        entity_type="membership",
        entity_id=person.id,
    )
    await db.flush()


async def remove_member(db: AsyncSession, household_id: str, actor_id: str, target_id: str) -> None:
    """Path C — admin/owner detaches another member (reason `removed`) + kills their sessions.

    Guards: 404 if the target isn't a member of this household (never reveal another household's
    persons); 409 if the target is the owner (not removable); 409 if the target is the caller (use
    leave). The target `Person` survives (audit integrity); re-invite restores access.
    """
    target = (
        await db.execute(
            select(Person).where(Person.id == target_id, Person.household_id == household_id)
        )
    ).scalar_one_or_none()
    if target is None:
        errors.not_found("member", target_id)
    if target.role == "owner":
        _conflict("The household owner cannot be removed.")
    if target.id == actor_id:
        _conflict("Use leave to exit the household, not remove.")

    target.household_id = None
    target.detachment_reason = "removed"
    target.detached_at = datetime.now(UTC)
    await db.execute(delete(Session).where(Session.person_id == target.id))
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="delete",
        entity_type="membership",
        entity_id=target.id,
    )
    await db.flush()
