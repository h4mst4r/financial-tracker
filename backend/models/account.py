"""Account models (ARCH §3.5).

`Account` uses Single Table Inheritance on `account_type` — one table with all subtype
columns nullable. `AccountOwner` is a junction table. `AccountSnapshot` tracks historical
values.
"""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base, BaseEntity


class Account(BaseEntity):
    """Account — STI on `account_type` (bank|credit_card|capital|asset|insurance).

    Single table with ALL subtype columns present and nullable.
    """

    __tablename__ = "accounts"

    account_type: Mapped[str] = mapped_column(String, nullable=False)

    # Shared columns
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    institution: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    colour: Mapped[str | None] = mapped_column(String(7), nullable=True)
    # Per-instance full-saturation fill opt-in (calm tint default; vivid = full-saturation fill).
    # Cross-entity column (also on categories/currencies) — ARCH §3.5, FR-SYS-016, Story 4.1.
    vivid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # The account's native currency (ISO 4217) — `opening_balance`/snapshots are denominated in it
    # (ARCH §3.5, FR-A-001, Story 4.4). Validated against household currencies on create; editable
    # only until the account has history, then locked (changing it reinterprets stored values).
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    opening_balance: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    opening_balance_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Formula FKs
    depreciation_formula_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("formulas.id"), nullable=True
    )
    fx_formula_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("formulas.id"), nullable=True
    )
    interest_formula_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("formulas.id"), nullable=True
    )

    # Bank subtype columns
    account_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    interest_rate: Mapped[Decimal | None] = mapped_column(Numeric(8, 4), nullable=True)
    interest_frequency: Mapped[str | None] = mapped_column(String(20), nullable=True)
    reserved_amount: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)

    # Credit card subtype columns
    credit_limit: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    billing_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    due_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reward_points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    annual_fee: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    reward_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    bonus_limit: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    points_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Capital subtype columns
    investment_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cost_basis: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)

    # Asset subtype columns
    asset_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    registration_no: Mapped[str | None] = mapped_column(String(100), nullable=True)
    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    purchase_value: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)

    # Insurance subtype columns
    policy_no: Mapped[str | None] = mapped_column(String(100), nullable=True)
    insurer: Mapped[str | None] = mapped_column(String(200), nullable=True)
    policy_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    policy_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    premium_frequency: Mapped[str | None] = mapped_column(String(20), nullable=True)
    coverage_death: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    coverage_tpd: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    coverage_ci: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    coverage_early_ci: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    coverage_personal_accident: Mapped[Decimal | None] = mapped_column(
        Numeric(15, 4), nullable=True
    )
    coverage_hospital: Mapped[str | None] = mapped_column(String, nullable=True)
    surrender_value: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    surrender_inquiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Single-class STI: one table, `account_type` discriminator, all subtype columns nullable.
    # We do NOT register ORM polymorphic subclasses — serialization is via the discriminated-union
    # schemas (ARCH §4.5), and queries are cross-subtype. A `polymorphic_on` mapper here would
    # make SQLAlchemy try to load each row as a registered subclass and raise "No such
    # polymorphic_identity 'bank'" on every SELECT. Add subclasses only if ORM polymorphism needed.
    __table_args__ = (
        Index("ix_accounts_household_id_account_type", "household_id", "account_type"),
    )


class AccountOwner(Base):
    """AccountOwner — junction between accounts and persons."""

    __tablename__ = "account_owners"

    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), primary_key=True)
    person_id: Mapped[str] = mapped_column(String(36), ForeignKey("persons.id"), primary_key=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AccountSnapshot(BaseEntity):
    """AccountSnapshot — historical account value snapshots."""

    __tablename__ = "account_snapshots"

    account_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("accounts.id"), nullable=False, index=True
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    value_base: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    source: Mapped[str] = mapped_column(String(30), nullable=False)
    formula_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("formulas.id"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(String, nullable=True)

    __table_args__ = (
        Index("ix_account_snapshots_account_id_snapshot_date", "account_id", "snapshot_date"),
    )
