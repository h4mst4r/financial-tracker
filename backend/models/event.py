"""Financial event models (ARCH §3.6).

`FinancialEvent` uses STI on `event_type` (transaction|recurring_payment|transfer) and
mixes in `MonetaryValueMixin` for the 8-column money block.
`OccurrenceRecord` tracks recurring payment occurrences.
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

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

from backend.models.base import Base, BaseEntity, MonetaryValueMixin


class FinancialEvent(BaseEntity, MonetaryValueMixin):
    """FinancialEvent — STI on `event_type` (transaction|recurring_payment|transfer).

    Single table with ALL subtype columns present and nullable.
    Mixes in MonetaryValueMixin for the 8-column money block.
    """

    __tablename__ = "financial_events"

    event_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # Base event columns
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    event_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    transaction_status: Mapped[str] = mapped_column(String(20), nullable=False, default="completed")
    payee_person_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("persons.id"), nullable=True
    )
    payment_method: Mapped[str | None] = mapped_column(String(100), nullable=True)
    category_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("categories.id"), nullable=True
    )
    transaction_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_shared_expense: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_gst_claimable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_gift: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    source_account_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("accounts.id"), nullable=True
    )
    linked_recurring_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("financial_events.id"), nullable=True
    )
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    external_ref: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Transaction subtype columns
    reconciled: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    reconciled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duplicate_of: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("financial_events.id"), nullable=True
    )

    # RecurringPayment subtype columns
    frequency_text: Mapped[str | None] = mapped_column(String(50), nullable=True)
    frequency_rule: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_occurrence: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recurrence_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    recurrence_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    source_entity_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    source_entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    occurrences_generated: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Transfer subtype columns
    destination_account_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("accounts.id"), nullable=True
    )
    dest_currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    dest_amount: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    dest_amount_base: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)
    is_debt_repayment: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    debt_cleared_amount: Mapped[Decimal | None] = mapped_column(Numeric(15, 4), nullable=True)

    # Single-class STI: one table, `event_type` discriminator, all subtype columns nullable.
    # We do NOT register ORM polymorphic subclasses — serialization is via the discriminated-union
    # schemas (ARCH §4.5), and queries are cross-subtype. A `polymorphic_on` mapper here would
    # make SQLAlchemy try to load each row as a registered subclass and raise "No such
    # polymorphic_identity 'transaction'" on every SELECT. Add subclasses only if ORM polymorphism
    # needed.

    __table_args__ = (
        CheckConstraint(
            "is_shared_expense = 0 OR transaction_type = 'outflow'",
            name="ck_shared_expense_outflow_only",
        ),
        Index("ix_fe_household_id_event_date", "household_id", "event_date"),
        Index("ix_fe_household_id_category_id", "household_id", "category_id"),
        Index("ix_fe_household_id_payee_person_id", "household_id", "payee_person_id"),
        Index(
            "ix_fe_household_id_shared_expense_type",
            "household_id",
            "is_shared_expense",
            "transaction_type",
        ),
    )


class OccurrenceRecord(Base):
    """OccurrenceRecord — tracks recurring payment occurrence history."""

    __tablename__ = "occurrence_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    recurring_event_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("financial_events.id"), nullable=False, index=True
    )
    expected_date: Mapped[date] = mapped_column(Date, nullable=False)
    occurrence_status: Mapped[str] = mapped_column(String(20), nullable=False, default="upcoming")
    generated_event_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("financial_events.id"), nullable=True
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index(
            "ix_occurrence_records_recurring_event_id_expected_date",
            "recurring_event_id",
            "expected_date",
        ),
    )
