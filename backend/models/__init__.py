"""Shared model building blocks.

Re-exports for convenient imports throughout the backend:
    from backend.models import BaseEntity, MonetaryValueMixin, StatusEnum
    from backend.models import Household, Person, Session, HouseholdInvitation
    from backend.models import Account, AccountOwner, ValuationRecord, RecurringConfig
    from backend.models import FinancialEvent, OccurrenceRecord
    from backend.models import Alert, AuditLog, Budget, Category, Currency, FxRateHistory, Formula
"""

from .account import Account, AccountOwner, RecurringConfig, ValuationRecord
from .alert import Alert
from .audit import AuditLog
from .base import BaseEntity, MonetaryValueMixin, StatusEnum
from .budget import Budget
from .category import Category
from .currency import Currency, FxRateHistory
from .event import FinancialEvent, OccurrenceRecord
from .formula import Formula
from .household import Household
from .person import HouseholdInvitation, Person, Session

__all__ = [
    "Account",
    "AccountOwner",
    "Alert",
    "AuditLog",
    "BaseEntity",
    "Budget",
    "Category",
    "Currency",
    "FinancialEvent",
    "Formula",
    "FxRateHistory",
    "Household",
    "HouseholdInvitation",
    "MonetaryValueMixin",
    "OccurrenceRecord",
    "Person",
    "RecurringConfig",
    "Session",
    "StatusEnum",
    "ValuationRecord",
]
