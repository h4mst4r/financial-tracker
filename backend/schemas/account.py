"""Account request/response schemas (ARCH §3.5/§4.5, Story 4.1).

Generic-entity surface → **snake_case wire** (plain `BaseModel`, no `to_camel`), like
`schemas/category.py`/`currency.py` — NOT the §2.14.C household/profile camelCase exception.

Accounts use **Single Table Inheritance** (one table, `account_type` discriminator). Per ARCH §4.5
the request/response are **discriminated unions** keyed on `account_type`: each subtype carries only
its own columns, never a flat schema padded with every other subtype's nulls. The route picks the
subtype Response class from the discriminator before `model_validate` (`from_attributes=True` reads
the nullable ORM columns that belong to that subtype).

Build-ahead ([[backend-first-build-ahead]]): every subtype column is exposed here now so Stories 4.7
(bank/credit-card) and 4.8 (capital/asset/insurance) are pure frontend wiring. Story 4.1 itself only
edits the shared fields + the ledger-backed `opening_balance`/`opening_balance_date`. Formula-FK
assignment (`*_formula_id`) is Epic 7 and is intentionally absent here.
"""

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

_HEX_RE = re.compile(r"#[0-9a-fA-F]{6}")


def _check_hex(value: str | None) -> str | None:
    """Edge validation (422) — a per-instance colour is `#RRGGBB` or None (ARCH §4.8 tier 1)."""
    if value is None:
        return value
    if not _HEX_RE.fullmatch(value):
        raise ValueError("colour must be a #RRGGBB hex string")
    return value


# ─── Create (discriminated union) ───


class _AccountCreateShared(BaseModel):
    """The columns every subtype's Create carries (the §3.5 shared block)."""

    name: str
    institution: str | None = None
    notes: str | None = None
    colour: str | None = None
    vivid: bool = False

    @field_validator("colour")
    @classmethod
    def _validate_colour(cls, value: str | None) -> str | None:
        return _check_hex(value)


class BankAccountCreate(_AccountCreateShared):
    account_type: Literal["bank"]
    # Ledger-backed → opening balance + date REQUIRED (FR-A-008, AC1).
    opening_balance: Decimal
    opening_balance_date: date
    account_number: str | None = None
    interest_rate: Decimal | None = None
    interest_frequency: str | None = None
    reserved_amount: Decimal | None = None


class CreditCardCreate(_AccountCreateShared):
    account_type: Literal["credit_card"]
    # Ledger-backed → opening balance + date REQUIRED (FR-A-008, AC1).
    opening_balance: Decimal
    opening_balance_date: date
    credit_limit: Decimal | None = None
    billing_day: int | None = None
    due_day: int | None = None
    reward_points: int | None = None
    annual_fee: Decimal | None = None
    reward_type: Literal["points", "cashback", "miles", "none"] | None = None
    bonus_limit: Decimal | None = None
    points_expiry: date | None = None


class CapitalAccountCreate(_AccountCreateShared):
    account_type: Literal["capital"]
    investment_type: str | None = None
    cost_basis: Decimal | None = None


class AssetAccountCreate(_AccountCreateShared):
    account_type: Literal["asset"]
    asset_type: str | None = None
    registration_no: str | None = None
    purchase_date: date | None = None
    purchase_value: Decimal | None = None


class InsuranceAccountCreate(_AccountCreateShared):
    account_type: Literal["insurance"]
    policy_no: str | None = None
    insurer: str | None = None
    policy_type: Literal["life", "term", "health"] | None = None
    policy_status: Literal["active", "cancelled"] | None = None
    premium_frequency: str | None = None
    coverage_death: Decimal | None = None
    coverage_tpd: Decimal | None = None
    coverage_ci: Decimal | None = None
    coverage_early_ci: Decimal | None = None
    coverage_personal_accident: Decimal | None = None
    coverage_hospital: str | None = None
    surrender_value: Decimal | None = None
    surrender_inquiry_date: date | None = None


AccountCreate = Annotated[
    BankAccountCreate
    | CreditCardCreate
    | CapitalAccountCreate
    | AssetAccountCreate
    | InsuranceAccountCreate,
    Field(discriminator="account_type"),
]


# ─── Update (one partial schema; no discriminator — `account_type` is immutable) ───


class AccountUpdate(BaseModel):
    """Partial update (all optional, `exclude_unset`). **No `account_type`** — the STI discriminator
    is immutable after create (a type change is a different entity). Carries every subtype column so
    Stories 4.7/4.8 PATCH the deep fields with no schema change."""

    # Shared
    name: str | None = None
    institution: str | None = None
    notes: str | None = None
    colour: str | None = None
    vivid: bool | None = None
    # Ledger-backed
    opening_balance: Decimal | None = None
    opening_balance_date: date | None = None
    # Bank
    account_number: str | None = None
    interest_rate: Decimal | None = None
    interest_frequency: str | None = None
    reserved_amount: Decimal | None = None
    # Credit card
    credit_limit: Decimal | None = None
    billing_day: int | None = None
    due_day: int | None = None
    reward_points: int | None = None
    annual_fee: Decimal | None = None
    reward_type: Literal["points", "cashback", "miles", "none"] | None = None
    bonus_limit: Decimal | None = None
    points_expiry: date | None = None
    # Capital
    investment_type: str | None = None
    cost_basis: Decimal | None = None
    # Asset
    asset_type: str | None = None
    registration_no: str | None = None
    purchase_date: date | None = None
    purchase_value: Decimal | None = None
    # Insurance
    policy_no: str | None = None
    insurer: str | None = None
    policy_type: Literal["life", "term", "health"] | None = None
    policy_status: Literal["active", "cancelled"] | None = None
    premium_frequency: str | None = None
    coverage_death: Decimal | None = None
    coverage_tpd: Decimal | None = None
    coverage_ci: Decimal | None = None
    coverage_early_ci: Decimal | None = None
    coverage_personal_accident: Decimal | None = None
    coverage_hospital: str | None = None
    surrender_value: Decimal | None = None
    surrender_inquiry_date: date | None = None

    @field_validator("colour")
    @classmethod
    def _validate_colour(cls, value: str | None) -> str | None:
        return _check_hex(value)


# ─── Response (discriminated union) ───


class _AccountResponseShared(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    institution: str | None
    notes: str | None
    colour: str | None
    vivid: bool
    status: str
    created_by: str
    updated_at: datetime
    # The account's owner person-ids (≥1; the creator on create — Story 4.3 adds more). Not an ORM
    # column — attached by the router from a batched `owner_ids_for`. Defaults `[]` so
    # `model_validate(obj)` is safe before the router fills it.
    owner_ids: list[str] = []
    # Hard-delete eligibility (UX §8.1, Story 4.2). Not ORM columns — the router computes them from
    # a batched dependency scan and attaches them. Default deletable so `model_validate(obj)` is ok.
    can_delete: bool = True
    delete_blocked_reason: str | None = None


class BankAccountResponse(_AccountResponseShared):
    account_type: Literal["bank"]
    opening_balance: Decimal | None
    opening_balance_date: date | None
    account_number: str | None
    interest_rate: Decimal | None
    interest_frequency: str | None
    reserved_amount: Decimal | None


class CreditCardResponse(_AccountResponseShared):
    account_type: Literal["credit_card"]
    opening_balance: Decimal | None
    opening_balance_date: date | None
    credit_limit: Decimal | None
    billing_day: int | None
    due_day: int | None
    reward_points: int | None
    annual_fee: Decimal | None
    reward_type: str | None
    bonus_limit: Decimal | None
    points_expiry: date | None


class CapitalAccountResponse(_AccountResponseShared):
    account_type: Literal["capital"]
    investment_type: str | None
    cost_basis: Decimal | None


class AssetAccountResponse(_AccountResponseShared):
    account_type: Literal["asset"]
    asset_type: str | None
    registration_no: str | None
    purchase_date: date | None
    purchase_value: Decimal | None


class InsuranceAccountResponse(_AccountResponseShared):
    account_type: Literal["insurance"]
    policy_no: str | None
    insurer: str | None
    policy_type: str | None
    policy_status: str | None
    premium_frequency: str | None
    coverage_death: Decimal | None
    coverage_tpd: Decimal | None
    coverage_ci: Decimal | None
    coverage_early_ci: Decimal | None
    coverage_personal_accident: Decimal | None
    coverage_hospital: str | None
    surrender_value: Decimal | None
    surrender_inquiry_date: date | None


AccountResponse = Annotated[
    BankAccountResponse
    | CreditCardResponse
    | CapitalAccountResponse
    | AssetAccountResponse
    | InsuranceAccountResponse,
    Field(discriminator="account_type"),
]

# Discriminator → Response class (the §4.5 dispatch the router uses before `model_validate`).
_RESPONSE_BY_TYPE: dict[str, type[_AccountResponseShared]] = {
    "bank": BankAccountResponse,
    "credit_card": CreditCardResponse,
    "capital": CapitalAccountResponse,
    "asset": AssetAccountResponse,
    "insurance": InsuranceAccountResponse,
}


def response_for(
    account,
    owner_ids: list[str],
    *,
    can_delete: bool = True,
    delete_blocked_reason: str | None = None,
) -> _AccountResponseShared:
    """Serialize one ORM `Account` to its subtype Response (ARCH §4.5), attaching `owner_ids` + the
    computed hard-delete eligibility (UX §8.1, Story 4.2)."""
    resp = _RESPONSE_BY_TYPE[account.account_type].model_validate(account)
    resp.owner_ids = owner_ids
    resp.can_delete = can_delete
    resp.delete_blocked_reason = delete_blocked_reason
    return resp


class AccountListOut(BaseModel):
    items: list[AccountResponse]
    total: int
