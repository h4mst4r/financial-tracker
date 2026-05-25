"""SQLAlchemy models for Financial Tracker."""

import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Date,
    Enum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.types import TypeDecorator


class UUID(TypeDecorator):
    """Platform-independent GUID type."""
    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            return str(value)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            return uuid.UUID(value)
        return value


class Base(DeclarativeBase):
    pass


class UserRole(enum.Enum):
    admin = "admin"
    member = "member"


class HouseholdRole(enum.Enum):
    owner = "owner"
    admin = "admin"
    member = "member"


class InvitationStatus(enum.Enum):
    pending = "pending"
    accepted = "accepted"
    expired = "expired"
    revoked = "revoked"


class AccountType(enum.Enum):
    cash = "cash"
    bank = "bank"
    credit_card = "credit_card"
    investment = "investment"


class OAuthState(Base):
    """Store OAuth state tokens for CSRF protection."""
    __tablename__ = "oauth_states"

    id = Column(
        UUID(),
        primary_key=True,
        default=uuid.uuid4,
    )
    state = Column(String(255), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(
        DateTime, nullable=False, default=lambda: datetime.now()
    )

    def is_expired(self) -> bool:
        now = datetime.now()
        return self.expires_at < now if self.expires_at else True


class CsrfToken(Base):
    """Store CSRF tokens for state-changing requests."""
    __tablename__ = "csrf_tokens"

    id = Column(
        UUID(),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id = Column(UUID(), ForeignKey("users.id"), nullable=False)
    token = Column(String(255), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(
        DateTime, nullable=False, default=lambda: datetime.now()
    )


class Household(Base):
    __tablename__ = "households"

    id = Column(
        UUID(),
        primary_key=True,
        default=uuid.uuid4,
    )
    name = Column(String(255), nullable=False)
    created_by = Column(
        UUID(), ForeignKey("users.id"), nullable=False
    )
    created_at = Column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    creator = relationship("User", foreign_keys=[created_by])
    members = relationship("HouseholdMember", back_populates="household", cascade="all, delete-orphan")
    invitations = relationship("HouseholdInvitation", back_populates="household", cascade="all, delete-orphan")
    categories = relationship("Category", back_populates="household", cascade="all, delete-orphan")
    accounts = relationship("Account", back_populates="household", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="household", cascade="all, delete-orphan")
    budgets = relationship("Budget", back_populates="household", cascade="all, delete-orphan")
    recurring_transactions = relationship("RecurringTransaction", back_populates="household", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "name": self.name,
            "created_by": str(self.created_by),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class HouseholdMember(Base):
    __tablename__ = "household_members"

    id = Column(
        UUID(),
        primary_key=True,
        default=uuid.uuid4,
    )
    household_id = Column(
        UUID(), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(
        UUID(), ForeignKey("users.id"), nullable=False
    )
    role = Column(Enum(HouseholdRole), nullable=False, default=HouseholdRole.member)
    joined_at = Column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        UniqueConstraint("household_id", "user_id", name="uq_household_user"),
    )

    household = relationship("Household", back_populates="members")
    user = relationship("User")

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "household_id": str(self.household_id),
            "user_id": str(self.user_id),
            "email": self.user.email if self.user else None,
            "name": self.user.name if self.user else None,
            "role": self.role.value,
            "joined_at": self.joined_at.isoformat() if self.joined_at else None,
        }


class HouseholdInvitation(Base):
    __tablename__ = "household_invitations"

    id = Column(
        UUID(),
        primary_key=True,
        default=uuid.uuid4,
    )
    household_id = Column(
        UUID(), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    email = Column(String(255), nullable=False)
    invited_by = Column(
        UUID(), ForeignKey("users.id"), nullable=False
    )
    status = Column(Enum(InvitationStatus), nullable=False, default=InvitationStatus.pending)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    household = relationship("Household", back_populates="invitations")
    inviter = relationship("User", foreign_keys=[invited_by])

    def is_expired(self) -> bool:
        now = datetime.now(timezone.utc)
        if not self.expires_at:
            return True
        # Handle naive datetime from SQLite by attaching UTC timezone if needed
        if self.expires_at.tzinfo is None:
            self.expires_at = self.expires_at.replace(tzinfo=timezone.utc)
        return self.expires_at < now

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "household_id": str(self.household_id),
            "email": self.email,
            "invited_by": str(self.invited_by),
            "status": self.status.value,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "is_expired": self.is_expired(),
        }


class Account(Base):
    """Financial account for tracking money sources (Cash, Bank, Credit Card, etc.)."""
    __tablename__ = "accounts"

    id = Column(
        UUID(),
        primary_key=True,
        default=uuid.uuid4,
    )
    household_id = Column(
        UUID(), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    name = Column(String(255), nullable=False)
    type = Column(Enum(AccountType), nullable=False, default=AccountType.cash)
    currency = Column(String(3), nullable=False, default="SGD")
    initial_balance = Column(Numeric(12, 2), nullable=False, default=0.00)
    current_balance = Column(Numeric(12, 2), nullable=False, default=0.00)
    opening_date = Column(Date, nullable=False, default=lambda: datetime.now(timezone.utc).date())
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(UUID(), ForeignKey("users.id"), nullable=True)
    created_at = Column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    household = relationship("Household", back_populates="accounts")
    creator = relationship("User", foreign_keys=[created_by])
    transactions = relationship("Transaction", back_populates="account", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("household_id", "name", name="uq_household_account_name"),
    )

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "household_id": str(self.household_id),
            "name": self.name,
            "type": self.type.value if self.type else None,
            "currency": self.currency,
            "initial_balance": float(self.initial_balance) if self.initial_balance else 0.00,
            "current_balance": float(self.current_balance) if self.current_balance else 0.00,
            "opening_date": self.opening_date.isoformat() if self.opening_date else None,
            "is_active": self.is_active,
            "created_by": str(self.created_by) if self.created_by else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class User(Base):
    __tablename__ = "users"

    id = Column(
        UUID(),
        primary_key=True,
        default=uuid.uuid4,
    )
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    picture_url = Column(String, nullable=True)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.member)
    created_at = Column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    sessions = relationship("Session", back_populates="user")

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "email": self.email,
            "name": self.name,
            "picture_url": self.picture_url,
            "role": self.role.value,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Category(Base):
    """Financial category for transactions."""
    __tablename__ = "categories"

    id = Column(
        UUID(),
        primary_key=True,
        default=uuid.uuid4,
    )
    household_id = Column(
        UUID(), ForeignKey("households.id", ondelete="CASCADE"), nullable=True
    )
    parent_id = Column(
        UUID(), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)  # "income" or "expense"
    color = Column(String(7), nullable=True)  # Hex color code
    icon = Column(String(50), nullable=True)
    is_default = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)
    created_by = Column(UUID(), ForeignKey("users.id"), nullable=True)
    created_at = Column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    household = relationship("Household", back_populates="categories")
    creator = relationship("User", foreign_keys=[created_by])
    transactions = relationship("Transaction", back_populates="category", cascade="all, delete-orphan")
    # Self-referential relationships for subcategory hierarchy
    parent = relationship("Category", remote_side=[id], backref="children")

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "household_id": str(self.household_id) if self.household_id else None,
            "parent_id": str(self.parent_id) if self.parent_id else None,
            "name": self.name,
            "type": self.type,
            "color": self.color,
            "icon": self.icon,
            "is_default": self.is_default,
            "is_archived": self.is_archived,
            "created_by": str(self.created_by) if self.created_by else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Transaction(Base):
    """Financial transaction."""
    __tablename__ = "transactions"

    id = Column(
        UUID(),
        primary_key=True,
        default=uuid.uuid4,
    )
    household_id = Column(
        UUID(), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    account_id = Column(
        UUID(), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True
    )
    category_id = Column(
        UUID(), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    user_id = Column(
        UUID(), ForeignKey("users.id"), nullable=False
    )
    amount = Column(Float, nullable=False)
    currency = Column(String(3), default="USD")
    type = Column(String(10), nullable=False)  # "income" or "expense"
    description = Column(String(500), nullable=True)
    date = Column(DateTime, nullable=False)
    is_recurring = Column(Boolean, default=False)
    recurring_frequency = Column(String(20), nullable=True)  # "daily", "weekly", "monthly", "yearly"
    next_due_date = Column(DateTime, nullable=True)
    is_archived = Column(Boolean, default=False)
    created_at = Column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    household = relationship("Household", back_populates="transactions")
    account = relationship("Account", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")
    user = relationship("User")

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "household_id": str(self.household_id),
            "account_id": str(self.account_id) if self.account_id else None,
            "category_id": str(self.category_id) if self.category_id else None,
            "user_id": str(self.user_id),
            "amount": self.amount,
            "currency": self.currency,
            "type": self.type,
            "description": self.description,
            "date": self.date.isoformat() if self.date else None,
            "is_recurring": self.is_recurring,
            "recurring_frequency": self.recurring_frequency,
            "next_due_date": self.next_due_date.isoformat() if self.next_due_date else None,
            "is_archived": self.is_archived,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Budget(Base):
    """Budget for a category within a household."""
    __tablename__ = "budgets"

    id = Column(
        UUID(),
        primary_key=True,
        default=uuid.uuid4,
    )
    household_id = Column(
        UUID(), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    category_id = Column(
        UUID(), ForeignKey("categories.id", ondelete="CASCADE"), nullable=False
    )
    amount = Column(Float, nullable=False)
    period = Column(String(20), nullable=False)  # "monthly", "yearly"
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    is_archived = Column(Boolean, default=False)
    created_by = Column(UUID(), ForeignKey("users.id"), nullable=False)
    created_at = Column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    household = relationship("Household", back_populates="budgets")
    category = relationship("Category")
    creator = relationship("User", foreign_keys=[created_by])

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "household_id": str(self.household_id),
            "category_id": str(self.category_id),
            "amount": self.amount,
            "period": self.period,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "is_archived": self.is_archived,
            "created_by": str(self.created_by),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class RecurringTransaction(Base):
    """Recurring transaction template."""
    __tablename__ = "recurring_transactions"

    id = Column(
        UUID(),
        primary_key=True,
        default=uuid.uuid4,
    )
    household_id = Column(
        UUID(), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    category_id = Column(
        UUID(), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    user_id = Column(
        UUID(), ForeignKey("users.id"), nullable=False
    )
    amount = Column(Float, nullable=False)
    currency = Column(String(3), default="USD")
    type = Column(String(10), nullable=False)  # "income" or "expense"
    description = Column(String(500), nullable=True)
    frequency = Column(String(20), nullable=False)  # "daily", "weekly", "monthly", "yearly"
    next_due_date = Column(DateTime, nullable=False)
    is_archived = Column(Boolean, default=False)
    created_at = Column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    household = relationship("Household", back_populates="recurring_transactions")
    category = relationship("Category")
    user = relationship("User")

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "household_id": str(self.household_id),
            "category_id": str(self.category_id) if self.category_id else None,
            "user_id": str(self.user_id),
            "amount": self.amount,
            "currency": self.currency,
            "type": self.type,
            "description": self.description,
            "frequency": self.frequency,
            "next_due_date": self.next_due_date.isoformat() if self.next_due_date else None,
            "is_archived": self.is_archived,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Session(Base):
    __tablename__ = "sessions"

    id = Column(
        UUID(),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id = Column(
        UUID(), ForeignKey("users.id"), nullable=False
    )
    expires_at = Column(DateTime, nullable=False)
    last_activity_at = Column(DateTime, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)

    user = relationship("User", back_populates="sessions")

    def is_expired(self) -> bool:
        if not self.expires_at:
            return True
        now = datetime.now(timezone.utc)
        # Handle both timezone-aware and naive datetimes
        if self.expires_at.tzinfo is None:
            now = now.replace(tzinfo=None)
        return self.expires_at < now
