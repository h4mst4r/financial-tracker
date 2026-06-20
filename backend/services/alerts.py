"""Alert creation (ARCH §3.9) — the single alert-writing path.

Story 3.7 is the FIRST writer of the `alerts` table: `/jobs/fx-refresh` raises `FX_API_DOWN` as a
fetch-failure side-effect (§3.9 — alerts are produced by `/jobs/alerts` AND as mutation
side-effects). Epic 10's `/jobs/alerts` + read/ack API + `AlertPanel` build the consumer side on
top of THIS helper rather than a parallel one — one alert-creation path.

`Alert` inherits `BaseEntity`, so `created_by` is NOT NULL (FK persons). A job has no person actor,
so the household **owner** is the system actor (exactly one owner per household, §2.8).
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.identity import Person
from backend.models.system import Alert

logger = logging.getLogger(__name__)


async def create_alert(
    db: AsyncSession,
    *,
    household_id: str,
    alert_type: str,
    title: str,
    body: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    dedupe: bool = False,
) -> Alert | None:
    """Insert an Alert for a household (owner = system actor for `created_by`).

    With `dedupe=True`, skip (return None) if an undismissed, non-archived alert of the same
    `(household_id, alert_type)` already exists — so a daily job re-run never piles up duplicates.
    """
    if dedupe:
        existing = await db.scalar(
            select(Alert.id).where(
                Alert.household_id == household_id,
                Alert.alert_type == alert_type,
                Alert.dismissed_at.is_(None),
                Alert.archived.is_(False),
            )
        )
        if existing is not None:
            return None

    owner_id = await db.scalar(
        select(Person.id).where(Person.household_id == household_id, Person.role == "owner")
    )
    if owner_id is None:
        # Defensive: a household with no owner (orphaned/detached) — never 500 a job over a
        # missing actor; log and skip the alert.
        logger.warning("alert_skipped_no_owner", extra={"household_id": str(household_id)})
        return None

    alert = Alert(
        household_id=household_id,
        created_by=owner_id,
        alert_type=alert_type,
        title=title,
        body=body,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    db.add(alert)
    await db.flush()
    return alert
