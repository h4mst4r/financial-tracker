"""Household request schemas (ARCH §2.8 / §2.14.C).

The household/auth surface is camelCase (§2.14.C), so `HouseholdUpdate` accepts camelCase wire keys
via `to_camel` aliasing. All fields optional — a partial update applied via
`model_dump(exclude_unset=True)`. Base-currency change is Epic 3 (FR-CU-005), absent here.
"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class HouseholdUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    name: str | None = None
    timezone: str | None = None
