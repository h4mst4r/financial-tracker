"""Account STI model and related tables.

Single Table Inheritance (STI) for all account types — one `accounts` table
with a `account_type` discriminator column. Subtype-specific fields are nullable.

Models:
    Account(MonetaryValueMixin, BaseEntity)  — core financial accounts (EDP §6)
    AccountOwner(Base)                       — many-to-many junction (Account ↔ Person)
    ValuationRecord(BaseEntity)              — asset valuation history
    RecurringConfig(BaseEntity)              — recurring payment configuration

References: EDP §6, ARCH §4.4
"""

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
)

from backend.database import Base
from backend.models.base import BaseEntity, MonetaryValueMixin, utcnow


# ---------------------------------------------------------------------------
# Account — STI with all subtype fields in one table
# ---------------------------------------------------------------------------


class Account(MonetaryValueMixin, BaseEntity):
    """Core financial account model using Single Table Inheritance.

    One table (`accounts`) with ALL subtype columns. The `account_type` column
    acts as a discriminator: "bank", "credit_card", "capital", "asset", "insurance".

    Subtype-specific fields are nullable — a BankAccount row will have NULL in
    all CreditCard, Capital, Asset, and Insurance columns.

    Inherits:
        MonetaryValueMixin — 7 monetary columns (currency, amount, fx_rate, etc.)
        BaseEntity — 10 audit/lifecycle columns (id, household_id, created_at, etc.)

    Base account fields:
        name:              Display name of the account.
        account_type:      STI discriminator ("bank" / "credit_card" / "capital" / "asset" / "insurance").
        institution:       Bank or provider name.
        month_year:        Statement month in "YYYY-MM" format.
        notes:             Free-text notes.

    BankAccount fields (nullable):
        account_number:    Masked account number.
        interest_rate:     For savings/interest-bearing accounts.
        interest_frequency: e.g. "monthly", "annually".

    CreditCard fields (nullable):
        credit_limit:      Card credit limit.
        billing_day:       Day of month billing cycle starts.
        due_day:           Day of month payment is due.
        reward_points:     Loyalty points balance.
        annual_fee:        Annual card fee.

    CapitalAccount fields (nullable):
        investment_type:   "stock" / "bond" / "fund" / "cpf" / "fixed_deposit".
        cost_basis:        Original investment cost.
        current_value:     Current market value.

    AssetAccount fields (nullable):
        asset_type:        "property" / "vehicle" / "other".
        purchase_date:     Acquisition date.
        purchase_value:    Original purchase price.
        depreciation_formula_id: FK to formulas.id (nullable — defined in future story).

    InsuranceAccount fields (nullable):
        policy_type:       e.g. "life", "health", "property".
        coverage_types:    JSON array of coverage types.
        premium_frequency: e.g. "monthly", "annually".
        coverage_amount:   Total coverage value.
        insurer:           Insurance provider name.
    """

    __tablename__ = "accounts"

    # --- Base account fields ---
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    account_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    institution: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    month_year: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # --- BankAccount subtype fields (nullable) ---
    account_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    interest_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 4), nullable=True)
    interest_frequency: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # --- CreditCard subtype fields (nullable) ---
    credit_limit: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4), nullable=True)
    billing_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    due_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reward_points: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    annual_fee: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)

    # --- CapitalAccount subtype fields (nullable) ---
    investment_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    cost_basis: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4), nullable=True)
    current_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4), nullable=True)

    # --- AssetAccount subtype fields (nullable) ---
    asset_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    purchase_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    purchase_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4), nullable=True)
    depreciation_formula_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("formulas.id"), nullable=True
    )

    # --- InsuranceAccount subtype fields (nullable) ---
    policy_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    coverage_types: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    premium_frequency: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    coverage_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 4), nullable=True)
    insurer: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # --- Relationships ---
    owners: Mapped[List["AccountOwner"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )
    valuation_records: Mapped[List["ValuationRecord"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )
    recurring_config: Mapped[Optional["RecurringConfig"]] = relationship(
        back_populates="account", uselist=False, cascade="all, delete-orphan"
    )

    # --- Indexes ---
    __table_args__ = (
        Index("ix_accounts_household_type", "household_id", "account_type"),
    )


# ---------------------------------------------------------------------------
# AccountOwner — many-to-many junction table (Account ↔ Person)
# ---------------------------------------------------------------------------


class AccountOwner(Base):
    """Junction table for Account ↔ Person ownership.

    Composite primary key (account_id, person_id).
    Inherits from Base directly (not BaseEntity) — pure junction table, no audit trail needed.

    Fields:
        account_id:  FK to accounts.id — composite PK.
        person_id:   FK to persons.id — composite PK.
        is_primary:  Primary owner flag.
        added_at:    When ownership was recorded.
    """

    __tablename__ = "account_owners"

    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("accounts.id"), primary_key=True
    )
    person_id: Mapped[UUID] = mapped_column(
        ForeignKey("persons.id"), primary_key=True
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # --- Relationships ---
    account: Mapped["Account"] = relationship(back_populates="owners")
    person: Mapped["Person"] = relationship()


# ---------------------------------------------------------------------------
# ValuationRecord — asset valuation history
# ---------------------------------------------------------------------------


class ValuationRecord(BaseEntity):
    """Historical valuation records for assets (property, vehicles, etc.).

    Extends BaseEntity for full audit trail — who created the valuation,
    when updated, whether archived. Critical for historical accuracy.

    Fields:
        asset_id:          FK to accounts.id (the AssetAccount).
        valuation_date:    Date of valuation.
        value:             Valuation amount.
        value_currency:    ISO 4217 currency code.
        value_base:        Value in household base currency.
        source:            Origin ("manual" / "market_appraisal" / "depreciation_formula").
        formula_id:        FK to formulas.id (if computed).
        notes:             Appraiser notes, reference documents.
    """

    __tablename__ = "valuation_records"

    asset_id: Mapped[UUID] = mapped_column(
        ForeignKey("accounts.id"), nullable=False, index=True
    )
    valuation_date: Mapped[date] = mapped_column(Date, nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    value_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    value_base: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    formula_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("formulas.id"), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # --- Relationships ---
    account: Mapped["Account"] = relationship(back_populates="valuation_records")

    # --- Indexes ---
    __table_args__ = (
        Index("ix_valuations_asset_date", "asset_id", "valuation_date"),
    )


# ---------------------------------------------------------------------------
# RecurringConfig — recurring payment configuration per account
# ---------------------------------------------------------------------------


class RecurringConfig(BaseEntity):
    """Recurring payment configuration for an account.

    One config per account (enforced by unique constraint on account_id).
    Extends BaseEntity for full audit trail of config changes.

    Fields:
        account_id:        FK to accounts.id — unique (one config per account).
        enabled:           Whether recurring events are active.
        frequency_text:    Raw free-text frequency (e.g. "1st of every month").
        frequency_rule:    Parsed RecurrenceRule as JSON text.
        next_occurrence:   Next computed occurrence date.
        payment_method:    How payment is made.
        payee_person_id:   FK to persons.id (who this is attributed to).
        category_id:       FK to categories.id (for generated transactions).
        amount_override:   Override standard amount.
        currency_override: Override currency for amount_override.
    """

    __tablename__ = "recurring_configs"

    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("accounts.id"), nullable=False, unique=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    frequency_text: Mapped[str] = mapped_column(String(200), nullable=False)
    frequency_rule: Mapped[str] = mapped_column(Text, nullable=False)
    next_occurrence: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    payment_method: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    payee_person_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("persons.id"), nullable=True
    )
    category_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("categories.id"), nullable=True
    )
    amount_override: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 4), nullable=True
    )
    currency_override: Mapped[Optional[str]] = mapped_column(String(3), nullable=True)

    # --- Relationships ---
    account: Mapped["Account"] = relationship(back_populates="recurring_config")
