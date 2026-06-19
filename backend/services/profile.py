"""Profile service (Story 2.9, FR-P-003).

`update_profile` — the per-person self-edit of profile & appearance preferences for
`PATCH /api/profile`. Modelled on `update_household`: only `exclude_unset` fields are touched,
each is validated (400 via RFC 7807 otherwise), and the live `person` (re-loaded by
`get_writable_person`) is mutated. No audit row — these are personal cosmetic preferences, not
shared household financial mutations (ARCH §4.7 / Story 2.9 D-AUDIT).

`notification_prefs` is the JSON-string `persons.notification_prefs` column; this module owns the
six allowed keys + their defaults (the bible §5.1 checked state) and the parse/merge helper reused
by `person_payload` so every read returns a complete, well-typed object.
"""

import json

from sqlalchemy.ext.asyncio import AsyncSession

from backend import errors
from backend.models.identity import Person
from backend.schemas.profile import ProfileUpdate

THEME_IDS = frozenset({"base", "base-light", "retro", "brown", "gameboy"})
FONT_IDS = frozenset({"base", "system", "mono"})
DENSITY_IDS = frozenset({"comfortable", "compact"})

# The six alert types (UX §5.1 / bible §5.1), camelCase to match the wire (storage == wire — the
# JSON object is surfaced verbatim as `notificationPrefs`). Defaults mirror the bible checked state:
# upcoming payments + backups OFF, the rest ON.
NOTIFICATION_DEFAULTS: dict[str, bool] = {
    "budgetWarnings": True,
    "budgetOverruns": True,
    "missedRecurring": True,
    "upcomingPayments": False,
    "fxStale": True,
    "backups": False,
}


def parse_notification_prefs(raw: str | None) -> dict[str, bool]:
    """A complete six-key prefs object: stored JSON merged over the defaults (NULL → all defaults).

    Unknown stored keys are dropped and missing keys are defaulted, so the client always receives a
    well-formed object even for a person who never saved one or whose stored set predates a key.
    """
    stored = json.loads(raw) if raw else {}
    return {key: bool(stored.get(key, default)) for key, default in NOTIFICATION_DEFAULTS.items()}


async def update_profile(db: AsyncSession, person: Person, data: ProfileUpdate) -> Person:
    """Apply a partial profile/appearance update to the current person (Story 2.9).

    `person` is the live, route-session-attached object from `get_writable_person`, so the
    assignments below land on the open transaction. Only sent fields (`exclude_unset`) are touched;
    each is validated against its allowed set (400 otherwise). Returns the mutated `person`.
    """
    fields = data.model_dump(exclude_unset=True)

    if fields.get("theme") is not None:
        if fields["theme"] not in THEME_IDS:
            errors.bad_request("Invalid theme", f"'{fields['theme']}' is not a valid theme")
        person.theme = fields["theme"]
    if fields.get("font") is not None:
        if fields["font"] not in FONT_IDS:
            errors.bad_request("Invalid font", f"'{fields['font']}' is not a valid font")
        person.font = fields["font"]
    if fields.get("density") is not None:
        if fields["density"] not in DENSITY_IDS:
            errors.bad_request("Invalid density", f"'{fields['density']}' is not a valid density")
        person.density = fields["density"]
    if fields.get("reduce_motion") is not None:
        person.reduce_motion = fields["reduce_motion"]
    if fields.get("display_name") is not None:
        name = fields["display_name"].strip()
        if not name:
            errors.bad_request("Invalid display name", "Display name cannot be empty")
        person.display_name = name
    if fields.get("notification_prefs") is not None:
        incoming = fields["notification_prefs"]
        unknown = set(incoming) - set(NOTIFICATION_DEFAULTS)
        if unknown:
            errors.bad_request(
                "Invalid notification preferences",
                f"Unknown notification keys: {', '.join(sorted(unknown))}",
            )
        # Merge over the current (or default) set so a partial update never drops other keys.
        merged = parse_notification_prefs(person.notification_prefs)
        merged.update({key: bool(value) for key, value in incoming.items()})
        person.notification_prefs = json.dumps(merged)

    await db.flush()
    return person
