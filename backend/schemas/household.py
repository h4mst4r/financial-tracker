"""Household request/response schemas (ARCH §2.8 / §2.14.C).

The household/auth surface is camelCase (§2.14.C), so these models carry `to_camel` aliasing
(`HouseholdUpdate` for the write; `MemberOut`/`InvitationOut` mirror the §2.14.C `person` /
`pendingInvitation` camelCase shapes — Story 2.5 D-CASE-LISTS). The list responses follow the
`{items, total}` rule (backend.md §2). `BaseCurrencyUpdate` is the owner base-currency change
(Story 3.9, FR-CU-005).
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    """Base for the household/auth surface — snake_case fields, camelCase wire keys (§2.14.C)."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class HouseholdUpdate(_CamelModel):
    name: str | None = None
    timezone: str | None = None


class BaseCurrencyUpdate(_CamelModel):
    """Body for `POST /api/household/base-currency` (Story 3.9, FR-CU-005, owner-only). The code is
    validated in the service against the household's currencies (no pydantic enum)."""

    base_currency: str


class MemberOut(_CamelModel):
    """A household member row for the Settings → Management members list (Story 2.5/2.8).

    `status` is the Person's real lifecycle status (`"active"` | `"archived"`, Story 2.8 — an
    archived member stays listed, membership intact). `can_delete` is the per-row FK-emptiness
    signal for the §5.2 Delete-if-empty item: `True` only when the member is a non-owner with zero
    `persons.id` references (so the UI shows Delete enabled vs disabled-with-reason; UX §8.1).
    """

    person_id: str
    display_name: str | None
    email: str
    role: str
    picture_url: str | None
    colour: str | None
    status: str
    can_delete: bool


class RoleUpdate(_CamelModel):
    """Body for `PATCH /api/household/members/{id}/role` (Story 2.8, FR-P-005). The allowed values
    (`admin`/`member`) are validated in the service (no pydantic enum — like `InvitationCreate`)."""

    role: str


class InvitationOut(_CamelModel):
    """A household invitation row for the Management invitations list (Story 2.5).

    Deliberately omits the invitation `id` — it is the `/join/:token` token (auth.py
    `pending_invitation`), and "Copy join link" is an admin/owner action (UX §5.2). The read-only
    list any member can view (FR-HH-002) shows email/status/expiry only; Story 2.6 surfaces the
    token behind the role-gated invite actions.
    """

    invited_email: str
    status: str
    expires_at: datetime
    created_at: datetime


class MemberListOut(_CamelModel):
    items: list[MemberOut]
    total: int


class InvitationListOut(_CamelModel):
    items: list[InvitationOut]
    total: int


class InvitationCreate(_CamelModel):
    """Body for `POST /api/household/invitations` (Story 2.6a). Email is validated in the service
    (no `EmailStr` — `email-validator` is not a dependency)."""

    invited_email: str


class InvitationManageOut(_CamelModel):
    """An invitation row for the admin/owner manage surface (Story 2.6a).

    Unlike the member-safe `InvitationOut`, this **carries `invitation_id` (the `/join/:token`
    token)** — it is only ever returned by the role-gated (`require_role("admin")`) manage list +
    invite actions (ARCH §3.4). `status` may be the derived `"expired"` (a `pending` row past
    `expires_at`), computed at read in the router — never written to the DB.
    """

    invitation_id: str
    invited_email: str
    status: str
    expires_at: datetime
    created_at: datetime


class InvitationManageListOut(_CamelModel):
    items: list[InvitationManageOut]
    total: int


class InvitationValidateOut(_CamelModel):
    """Response for the public `GET /api/invitations/{token}` (Story 2.6a).

    Always 200 (never 401/404 — a 401 would trip the api-client `/login` redirect). `status` is
    `"pending"` (actionable) or `"invalid"` (unknown / accepted / declined / revoked / expired); the
    context fields are populated only when `pending`.
    """

    status: str
    household_name: str | None = None
    invited_by_display_name: str | None = None
    invited_email: str | None = None
    expires_at: datetime | None = None
