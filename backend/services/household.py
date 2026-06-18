"""Household update service (ARCH §2.8 / §4.10).

Owner-scoped name/timezone update for `PATCH /api/household` (Story 2.4c, reused by the Settings →
Management tab in Story 2.5). Base-currency change is an Epic-3 concern (FR-CU-005) and is NOT
handled here — this service never touches `base_currency` or `currencies`.
"""

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.models.identity import Household
from backend.schemas.household import HouseholdUpdate
from backend.services.audit import audit


async def update_household(
    db: AsyncSession, household_id: str, actor_id: str, data: HouseholdUpdate
) -> Household:
    """Apply a partial name/timezone update to the household, writing an audit row (ARCH §2.8).

    The household is loaded by PK (it is its own scope — `household_id` comes from
    `get_household_id`, a FK to an existing row, so the lookup always resolves). Only fields the
    client actually sent (`exclude_unset`) are touched; `timezone` is validated against the IANA
    database (400 otherwise).
    """
    household = (
        await db.execute(select(Household).where(Household.id == household_id))
    ).scalar_one()
    before = {"name": household.name, "timezone": household.timezone}

    fields = data.model_dump(exclude_unset=True)
    if fields.get("timezone") is not None:
        try:
            # ZoneInfo raises ZoneInfoNotFoundError for unknown keys AND ValueError for malformed
            # ones (absolute paths, `..` components) — both must map to 400, not an uncaught 500.
            ZoneInfo(fields["timezone"])
        except (ZoneInfoNotFoundError, ValueError):
            errors.bad_request(
                "Invalid timezone", f"'{fields['timezone']}' is not a valid IANA timezone"
            )
        household.timezone = fields["timezone"]
    if fields.get("name") is not None:
        name = fields["name"].strip()
        if not name:
            errors.bad_request("Invalid name", "Household name cannot be empty")
        household.name = name

    await db.flush()
    await audit.log(
        db,
        household_id=household_id,
        actor_id=actor_id,
        action="update",
        entity_type="household",
        entity_id=household_id,
        before=before,
        after={"name": household.name, "timezone": household.timezone},
    )
    return household
