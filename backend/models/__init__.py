"""ORM models package. Entity modules (Story 1.2c) and Alembic `env.py` import the
shared base layer from here.

Importing this package transitively registers ALL entity modules on `Base.metadata`
so autogenerate sees every table.
"""

from backend.models.account import (  # noqa: F401
    Account,
    AccountOwner,
    AccountSnapshot,
)
from backend.models.base import Base, BaseEntity, MonetaryValueMixin
from backend.models.budget import (  # noqa: F401
    Budget,
    Category,
)
from backend.models.currency import (  # noqa: F401
    Currency,
    Formula,
    FxProvider,
    FxRateHistory,
)
from backend.models.event import (  # noqa: F401
    FinancialEvent,
    OccurrenceRecord,
)

# Transitive imports ensure every table is registered on Base.metadata
from backend.models.identity import (  # noqa: F401
    ApprovedOwner,
    Household,
    HouseholdInvitation,
    Person,
    Session,
)
from backend.models.system import (  # noqa: F401
    Alert,
    AuditLog,
    EntityPreference,
)

__all__ = [
    # Base layer
    "Base",
    "BaseEntity",
    "MonetaryValueMixin",
    # Identity & Access (§3.4)
    "Household",
    "Person",
    "Session",
    "HouseholdInvitation",
    "ApprovedOwner",
    # Accounts (§3.5)
    "Account",
    "AccountOwner",
    "AccountSnapshot",
    # Events (§3.6)
    "FinancialEvent",
    "OccurrenceRecord",
    # Budgets & Categories (§3.7)
    "Budget",
    "Category",
    # Currencies & Formulas (§3.8)
    "Currency",
    "FxRateHistory",
    "FxProvider",
    "Formula",
    # System (§3.9)
    "Alert",
    "AuditLog",
    "EntityPreference",
]
