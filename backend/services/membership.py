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

import logging
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import Column, Table, delete, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.errors import problem
from backend.models.base import Base
from backend.models.identity import Household, Person, Session
from backend.services.audit import audit

logger = logging.getLogger(__name__)

# Tables that carry `household_id` but must NOT be swept by the teardown: `audit_logs` is
# append-only and records the deletion (survives, ARCH §3.9); `persons` are detached, not deleted.
_TEARDOWN_SKIP = {"audit_logs", "persons"}

# Assignable roles for `set_member_role` — the owner role is not transferable here (FR-P-005).
_ASSIGNABLE_ROLES = {"admin", "member"}


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


# ── Member lifecycle (Story 2.8): role / archive / restore / hard-delete ──


async def _load_member(db: AsyncSession, household_id: str, target_id: str) -> Person:
    """Load a member scoped to this household, or 404 (never reveal another household's persons)."""
    target = (
        await db.execute(
            select(Person).where(Person.id == target_id, Person.household_id == household_id)
        )
    ).scalar_one_or_none()
    if target is None:
        errors.not_found("member", target_id)
    return target


async def set_member_role(
    db: AsyncSession, household_id: str, actor_id: str, target_id: str, role: str
) -> Person:
    """Owner sets a member's role to admin/member (FR-P-005). Takes effect on the member's next
    request (role is read per-request) — **no session is killed**.

    Guards: 404 cross-household; 400 if `role` is not admin/member (the owner role is not assignable
    here); 409 if the target is the owner (the owner role is not transferable/demotable here).
    """
    target = await _load_member(db, household_id, target_id)
    if role not in _ASSIGNABLE_ROLES:
        errors.bad_request("Invalid role", f"'{role}' is not an assignable role (admin/member)")
    if target.role == "owner":
        _conflict("The owner's role cannot be changed.")

    before = {"role": target.role}
    target.role = role
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="update",
        entity_type="person",
        entity_id=target.id,
        before=before,
        after={"role": role},
    )
    await db.flush()
    return target


async def archive_member(
    db: AsyncSession, household_id: str, actor_id: str, target_id: str
) -> Person:
    """Admin/owner archives a member (FR-P-007) — the in-household lifecycle archive, **membership
    intact** (`household_id` unchanged). The archived member can no longer log in (blocked by
    `validate_session` + `complete_oauth_login`), so their sessions are deleted now.

    Guards: 404 cross-household; 409 owner-target (not archivable); 409 self-target (use leave);
    409 already-archived.
    """
    target = await _load_member(db, household_id, target_id)
    if target.role == "owner":
        _conflict("The household owner cannot be archived.")
    if target.id == actor_id:
        _conflict("Use leave to exit the household, not archive yourself.")
    if target.archived:
        _conflict("This member is already archived.")

    target.archived = True
    target.archived_at = datetime.now(UTC)
    target.archived_by = actor_id
    target.status = "archived"
    await db.execute(delete(Session).where(Session.person_id == target.id))
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="archive",
        entity_type="person",
        entity_id=target.id,
    )
    await db.flush()
    return target


async def restore_member(
    db: AsyncSession, household_id: str, actor_id: str, target_id: str
) -> Person:
    """Admin/owner restores an archived member (FR-P-007) — re-enables login (the member signs in
    fresh; no session is re-created here). Guards: 404 cross-household; 409 if not archived.
    """
    target = await _load_member(db, household_id, target_id)
    if not target.archived:
        _conflict("This member is not archived.")

    target.archived = False
    target.archived_at = None
    target.archived_by = None
    target.status = "active"
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="restore",
        entity_type="person",
        entity_id=target.id,
    )
    await db.flush()
    return target


async def delete_member(db: AsyncSession, household_id: str, actor_id: str, target_id: str) -> None:
    """Owner hard-deletes an **empty** Person (FR-P-008, ARCH §3.0a tenet 5 / §4). A confirmed-empty
    delete writes an INFO log, **not** an audit row (§4.7).

    Guards: 404 cross-household; 409 owner-target (never deletable); 409 `has_dependencies` if the
    person still has any `persons.id` referrer (the UI then offers Archive).
    """
    target = await _load_member(db, household_id, target_id)
    if target.role == "owner":
        _conflict("The household owner cannot be deleted.")

    referrers = await _person_referrers(db, target.id)
    if referrers:
        errors.has_dependencies("person", target.id, referrers)

    await db.execute(delete(Person).where(Person.id == target.id))
    # No audit row — a confirmed-empty hard-delete is recorded as an INFO log only (ARCH §4.7).
    logger.info("person_hard_deleted", extra={"person_id": target.id, "actor_id": actor_id})
    await db.flush()


def _person_fk_columns() -> list[Column]:
    """Every column across the schema whose ForeignKey targets `persons.id` — so later epics'
    person-referencing tables auto-join the emptiness scan (D-PERSON-EMPTINESS, mirrors
    `_household_tables()`). `audit_logs` has no FK (ARCH §3.9) → never appears → survives a delete.
    """
    return [
        column
        for table in Base.metadata.sorted_tables
        for column in table.columns
        if any(fk.column.table.name == "persons" for fk in column.foreign_keys)
    ]


async def _person_referrers(db: AsyncSession, person_id: str) -> list[str]:
    """`"<table>.<col>"` for every `persons.id`-referencing column that has a row pointing at this
    person. Empty ⇒ the person is hard-deletable. Includes `sessions` — a member with a live session
    is not empty (forces archive-first; D-PERSON-EMPTINESS)."""
    referrers: list[str] = []
    for column in _person_fk_columns():
        exists = (await db.execute(select(column).where(column == person_id).limit(1))).first()
        if exists is not None:
            referrers.append(f"{column.table.name}.{column.name}")
    return referrers


async def member_can_delete(db: AsyncSession, person: Person) -> bool:
    """The per-row `MemberOut.canDelete` signal — a non-owner with zero `persons.id` referrers.
    Reuses `_person_referrers` so a single member's Delete enabled/disabled state matches the
    endpoint's 204/409 outcome exactly (one scan, one source of truth). For a whole list, prefer
    `referenced_person_ids` (one query per FK column, not per (person, column))."""
    if person.role == "owner":
        return False
    return not await _person_referrers(db, person.id)


async def referenced_person_ids(db: AsyncSession, person_ids: list[str]) -> set[str]:
    """The subset of `person_ids` that any `persons.id`-referencing column points at — i.e. the ones
    that are NOT empty / NOT hard-deletable. Batched: **one** `… WHERE col IN (:ids)` per FK column
    (vs `member_can_delete`'s per-person scan), so a members list is M queries, not rows × M."""
    if not person_ids:
        return set()
    referenced: set[str] = set()
    for column in _person_fk_columns():
        rows = (
            (await db.execute(select(column).where(column.in_(person_ids)).distinct()))
            .scalars()
            .all()
        )
        referenced.update(r for r in rows if r is not None)
    return referenced
