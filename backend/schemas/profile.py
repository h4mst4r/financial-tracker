"""Profile request schema (ARCH §2.14.C, Story 2.9).

`ProfileUpdate` is the body for `PATCH /api/profile` — the per-person self-edit of profile &
appearance preferences. camelCase wire keys (the §2.14.C surface, like `HouseholdUpdate`); every
field optional (partial PATCH; only `exclude_unset` fields are touched). `colour` is deliberately
NOT writable here — §5.1 renders no colour control (Story 2.9 D-COLOUR). Story 3.9 makes
`display_currency` writable (validated against the household's display-active currencies, FR-P-004 /
FR-CU-004); Story 2.11 added `display_format`.
"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ProfileUpdate(BaseModel):
    """Partial per-person profile/appearance update — snake_case fields, camelCase wire keys."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    display_name: str | None = None
    theme: str | None = None
    font: str | None = None
    density: str | None = None
    display_format: str | None = None
    display_currency: str | None = None
    reduce_motion: bool | None = None
    notification_prefs: dict[str, bool] | None = None


class RecentGlyphsOut(BaseModel):
    """The person's last-8 picked glyphs (most-recent first) for the EmojiIconPicker Recent row
    (UX §8.3, Story 3.1). Single-word keys — no camelCase aliasing needed."""

    glyphs: list[str]


class RecentGlyphPush(BaseModel):
    """Body for `POST /api/profile/recent-glyphs` — one picked glyph to push to the front."""

    glyph: str
