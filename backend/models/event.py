"""FinancialEvent STI model and OccurrenceRecord tracking table.

Single Table Inheritance (STI) for all financial event types — one
`financial_events` table with an `event_type` discriminator column.
Subtype-specific fields are nullable.

Models:
    FinancialEvent(MonetaryValueMixin, BaseEntity)  — core events (EDP §7)
    OccurrenceRecord(Base)                          — occurrence tracking (EDP §7.3)

References: EDP §7, ARCH §4.4
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base
from backend.models.base import BaseEntity, MonetaryValueMixin


# ---------------------------------------------------------------------------
# FinancialEvent — STI with all subtype fields in one table
# ---------------------------------------------------------------------------


class FinancialEvent(MonetaryValueMixin, BaseEntity):
    """Core financial event model using Single Table Inheritance.

    One table (`financial_events`) with ALL subtype columns. The `event_type`
    column acts as a discriminator: "transaction", "recurring_payment", "transfer".

    BaseFinancialEvent fields [EDP §7.1]:
        name, event_date, event_type, transaction_status, payee_person_id,
        payment_method, category_id, transaction_type, is_shared_expense,
        notes, is_gst_claimable, is_gift, source_account_id, linked_recurring_id

    Transaction fields [EDP §7.2]:
        reconciled, reconciled_at, duplicate_of

    RecurringPayment fields [EDP §7.3]:
        frequency_text, frequency_rule, next_occurrence, recurrence_start_date,
        recurrence_end_date, source_entity_type, source_entity_id,
        occurrences_generated, last_processed_at

    Transfer fields [EDP §7.4]:
        destination_account_id, dest_currency, dest_amount, dest_amount_base,
        is_debt_repayment, debt_cleared_amount
    """

    __tablename__ = "financial_events"

    # -----------------------------------------------------------------------
    # BaseFinancialEvent fields [EDP §7.1]
    # -----------------------------------------------------------------------

    name: Mapped[str] = mapped_column(String(300), nullable=False)
    event_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    # event_type: "transaction" | "recurring_payment" | "transfer"

    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("accounts.id"), nullable=False, index=True
    )
    payee: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    transaction_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="completed"
    )
    # transaction_status: "pending" | "completed" | "cancelled" | "reconciled"

    payee_person_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("persons.id"), nullable=True, index=True
    )
    payment_method: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    category_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("categories.id"), nullable=True, index=True
    )
    transaction_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # transaction_type: "inflow" | "outflow" | "transfer"

    is_shared_expense: Mapped[bool] = mapped_column(
        Boolean, default=False, index=True
    )
    # Only valid when transaction_type = "outflow"

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_gst_claimable: Mapped[bool] = mapped_column(Boolean, default=False)
    is_gift: Mapped[bool] = mapped_column(Boolean, default=False)

    source_account_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("accounts.id"), nullable=True, index=True
    )
    linked_recurring_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("financial_events.id"), nullable=True
    )

    # -----------------------------------------------------------------------
    # Transaction fields [EDP §7.2]
    # -----------------------------------------------------------------------

    reconciled: Mapped[bool] = mapped_column(Boolean, default=False)
    reconciled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    duplicate_of: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("financial_events.id"), nullable=True
    )

    # -----------------------------------------------------------------------
    # RecurringPayment fields [EDP §7.3]
    # -----------------------------------------------------------------------

    frequency_text: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    frequency_rule: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    next_occurrence: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    recurrence_start_date: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )
    recurrence_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    source_entity_type: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True
    )
    # source_entity_type: "recurring_payment" | "capital" | "asset" | "insurance"

    source_entity_id: Mapped[Optional[UUID]] = mapped_column(nullable=True)
    # Polymorphic reference — no FK (spans accounts, capital, asset, insurance)

    occurrences_generated: Mapped[int] = mapped_column(Integer, default=0)
    last_processed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # -----------------------------------------------------------------------
    # Transfer fields [EDP §7.4]
    # -----------------------------------------------------------------------

    destination_account_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("accounts.id"), nullable=True
    )
    dest_currency: Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    dest_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 4), nullable=True
    )
    dest_amount_base: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 4), nullable=True
    )
    is_debt_repayment: Mapped[bool] = mapped_column(Boolean, default=False)
    debt_cleared_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 4), nullable=True
    )

    # -----------------------------------------------------------------------
    # Constraints & indexes
    # -----------------------------------------------------------------------

    __table_args__ = (
        Index("ix_events_household_date", "household_id", "event_date"),
        Index("ix_events_household_category", "household_id", "category_id"),
        Index("ix_events_household_payee", "household_id", "payee_person_id"),
        Index(
            "ix_events_shared_expense",
            "household_id",
            "is_shared_expense",
            "transaction_type",
        ),
        CheckConstraint(
            "(is_shared_expense = 0) OR (transaction_type = 'outflow')",
            name="ck_shared_expense_outflow_only",
        ),
    )


# ---------------------------------------------------------------------------
# OccurrenceRecord — pure tracking table for RecurringPayment occurrences
# ---------------------------------------------------------------------------


class OccurrenceRecord(Base):
    """Tracks each expected occurrence of a RecurringPayment.

    Inherits from Base (not BaseEntity) — pure tracking table without the
    household audit trail. Each row represents one scheduled occurrence.

    Fields [EDP §7.3]:
        id, recurring_event_id, expected_date, occurrence_status,
        generated_event_id, processed_at, notes
    """

    __tablename__ = "occurrence_records"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    recurring_event_id: Mapped[UUID] = mapped_column(
        ForeignKey("financial_events.id"), nullable=False, index=True
    )
    expected_date: Mapped[date] = mapped_column(Date, nullable=False)
    occurrence_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="upcoming"
    )
    # occurrence_status: "upcoming" | "processed" | "skipped" | "missed" | "failed"

    generated_event_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("financial_events.id"), nullable=True
    )
    processed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_occurrences_recurring_date", "recurring_event_id", "expected_date"),
    )
