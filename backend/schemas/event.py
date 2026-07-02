"""Financial-event (transaction) request/response schemas (ARCH §3.2/§3.6/§4.5, Story 5.1).

Generic-entity surface → **snake_case wire** (plain `BaseModel`, no `to_camel`), like
`schemas/account.py`. `financial_events` is STI; Story 5.1 builds only the **transaction** subtype
(`event_type='transaction'`). Recurring (Epic 6) / transfer (Epic 6) subtypes add their own schemas.

The client supplies the *entered* money (`currency`/`amount`) + the optional bank-statement override
(`amount_base`) + the optional `fee_amount`. Everything FX-derived (`fx_rate`,
`amount_base_calculated`, `fx_delta`, `fx_rate_date`) and every provenance field (`source`,
`transaction_status`) is **server-computed** — never trusted from the body (ARCH §3.2). `source` is
always `manual` here; `transaction_status` always `completed` (status/reconciliation is Story 5.4).

`amount_base_source` (`formula`/`spot`/`manual`) is a **computed** response field — it is *derived*
from the row in the service, not a stored column (ARCH §3.2 "the UI shows how it was derived").
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

from backend.schemas.constraints import Money, NoteText, Str3, Str100, Str200

# ─── Create ───


class TransactionCreate(BaseModel):
    """Create a manual transaction (Story 5.1). Bound to the backing columns via `constraints.py`
    so an over-long/over-precise value is a clean 422 at the edge."""

    name: Str200
    event_date: date
    # Transfer is Epic 6; Story 5.1 records inflow/outflow transactions only.
    transaction_type: Literal["inflow", "outflow"]
    category_id: str | None = None
    payee_person_id: str | None = None
    payment_method: Str100 | None = None
    source_account_id: str | None = None
    notes: NoteText | None = None
    # Shared-expense defaults ON (UX Transactions §12) but is **outflow-only** (DB CHECK
    # `ck_shared_expense_outflow_only`); the service forces it False for inflow.
    is_shared_expense: bool = True
    is_gst_claimable: bool = False

    # Money block (entered by the user). `amount_base` overrides the system fill → `manual`; when
    # omitted the server fills it from the spot/formula calc. `fee_amount` = optional fee.
    currency: Str3
    amount: Money
    amount_base: Money | None = None
    fee_amount: Money | None = None


class TransactionUpdate(BaseModel):
    """Partial edit of a transaction (Stories 5.3/5.4). Every field optional → `model_dump(
    exclude_unset=True)` carries only what the client sent, so an inline commit sends one field and
    the modal sends its changed set (ARCH §4.10 — one PATCH for both). Money edits re-resolve FX
    server-side; a supplied `amount_base` is the manual override. `transaction_status` is the full
    lifecycle enum incl. `reconciled` (foreign-only — the server coerces it to `completed` on a
    base-currency row; SCP 2026-07-02). **Excludes** `tag_ids` (5.10), `duplicate_of` (5.6)."""

    name: Str200 | None = None
    event_date: date | None = None
    transaction_type: Literal["inflow", "outflow"] | None = None
    # `reconciled` is a status value, offered only for foreign-currency rows (the server coerces it
    # back to `completed` on a base-currency row — SCP 2026-07-02). There is no reconciled bool.
    transaction_status: Literal["pending", "completed", "cancelled", "reconciled"] | None = None
    category_id: str | None = None
    payee_person_id: str | None = None
    payment_method: Str100 | None = None
    source_account_id: str | None = None
    notes: NoteText | None = None
    is_shared_expense: bool | None = None
    is_gst_claimable: bool | None = None
    currency: Str3 | None = None
    amount: Money | None = None
    amount_base: Money | None = None
    fee_amount: Money | None = None


# ─── Response ───


class TransactionResponse(BaseModel):
    """One transaction row (ARCH §4.5). Reads trusted server data (`from_attributes`) so it is
    unbounded. `amount_base_source` is attached by the router — it is derived, not an ORM column."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
    event_type: str
    name: str | None
    event_date: date
    transaction_status: str
    transaction_type: str | None
    category_id: str | None
    payee_person_id: str | None
    payment_method: str | None
    source_account_id: str | None
    is_shared_expense: bool
    is_gst_claimable: bool
    notes: str | None
    source: str

    # Money block
    currency: str
    amount: Decimal
    fx_rate: Decimal
    amount_base_calculated: Decimal
    amount_base: Decimal
    fx_delta: Decimal | None
    fee_amount: Decimal | None
    fx_rate_date: date | None

    created_by: str
    updated_at: datetime

    # Derived FX-source indicator (§4 FX-base-source registry): formula|spot|manual. Not an ORM
    # column (ARCH §3.2) — attached by the router. Default keeps `model_validate(obj)` safe.
    amount_base_source: Literal["formula", "spot", "manual"] = "spot"


class TransactionSummary(BaseModel):
    """Server-computed base out/in totals for the toolbar (ARCH §4.10 lines 1779-1783) — over the
    *filtered* set, never client-summed over a paginated page. `inflow` avoids the `in` keyword."""

    out: Decimal
    inflow: Decimal


class TransactionListOut(BaseModel):
    items: list[TransactionResponse]
    total: int
    # Keyset pagination (ARCH §4.10): the opaque cursor of the last row, or null at the end.
    next_cursor: str | None = None
    summary: TransactionSummary


def response_for(event, *, amount_base_source: str) -> TransactionResponse:
    """Serialize one ORM `FinancialEvent` transaction to its Response, attaching the derived
    FX-source indicator (mirrors `schemas/account.py::response_for`)."""
    resp = TransactionResponse.model_validate(event)
    resp.amount_base_source = amount_base_source  # type: ignore[assignment]
    return resp
