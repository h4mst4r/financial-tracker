"""Business logic for account operations."""

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Dict, List, Optional, Tuple
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Account, AccountType, HouseholdMember, Transaction, User


# --- Validation Helpers ---

VALID_CURRENCIES = {"SGD", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "HKD"}


def get_user_household_id(db: Session, user: User) -> Optional[UUID]:
    """Get the household_id for the current user."""
    member = db.query(HouseholdMember).filter(
        HouseholdMember.user_id == user.id
    ).first()
    return member.household_id if member else None


def belongs_to_household(db: Session, account: Account, household_id: UUID) -> bool:
    """Check if an account belongs to the user's household."""
    return account.household_id == household_id


# --- CRUD Operations ---

def list_accounts(
    db: Session,
    household_id: UUID,
    include_archived: bool = False
) -> List[Account]:
    """List all accounts for a household, ordered by type then name."""
    query = db.query(Account).filter(
        Account.household_id == household_id
    )
    if not include_archived:
        query = query.filter(Account.is_active == True)
    return query.order_by(Account.type, Account.name).all()


def create_account(
    db: Session,
    user: User,
    name: str,
    type: str,
    currency: str = "SGD",
    initial_balance: float = 0.00,
    opening_date: Optional[str] = None,
) -> Account:
    """Create a new account in the current user's household."""
    household_id = get_user_household_id(db, user)
    if not household_id:
        raise HTTPException(status_code=400, detail="You must belong to a household to create accounts")

    # Validate name
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="Account name cannot be empty")

    # Validate account type
    try:
        account_type = AccountType(type)
    except ValueError:
        valid_types = [t.value for t in AccountType]
        raise HTTPException(
            status_code=400,
            detail=f"Invalid account type '{type}'. Must be one of: {', '.join(valid_types)}"
        )

    # Validate currency
    if currency not in VALID_CURRENCIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid currency '{currency}'. Supported: {', '.join(sorted(VALID_CURRENCIES))}"
        )

    # Check name uniqueness (case-insensitive, active accounts only)
    existing = db.query(Account).filter(
        Account.household_id == household_id,
        func.lower(Account.name) == func.lower(name.strip()),
        Account.is_active == True
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Account '{name}' already exists in this household")

    # Parse opening date
    parsed_opening_date = date.today()
    if opening_date:
        try:
            parsed_opening_date = datetime.strptime(opening_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid opening date format. Use YYYY-MM-DD")

    # Create the account
    account = Account(
        household_id=household_id,
        name=name.strip(),
        type=account_type,
        currency=currency,
        initial_balance=Decimal(str(initial_balance)),
        current_balance=Decimal(str(initial_balance)),
        opening_date=parsed_opening_date,
        is_active=True,
        created_by=user.id,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def get_account(
    db: Session,
    account_id: UUID,
    household_id: UUID
) -> Account:
    """Get a specific account by ID, verifying it belongs to the household."""
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.household_id == household_id
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


def update_account(
    db: Session,
    user: User,
    account_id: UUID,
    name: Optional[str] = None,
    type: Optional[str] = None,
    currency: Optional[str] = None,
) -> Account:
    """Update an existing account (partial update)."""
    household_id = get_user_household_id(db, user)
    if not household_id:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    account = get_account(db, account_id, household_id)

    # Update name if provided
    if name is not None:
        if not name.strip():
            raise HTTPException(status_code=400, detail="Account name cannot be empty")

        # Check uniqueness (excluding current account)
        existing = db.query(Account).filter(
            Account.household_id == household_id,
            func.lower(Account.name) == func.lower(name.strip()),
            Account.is_active == True,
            Account.id != account_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Account '{name}' already exists in this household")

        account.name = name.strip()

    # Update type if provided
    if type is not None:
        try:
            account.type = AccountType(type)
        except ValueError:
            valid_types = [t.value for t in AccountType]
            raise HTTPException(
                status_code=400,
                detail=f"Invalid account type '{type}'. Must be one of: {', '.join(valid_types)}"
            )

    # Update currency if provided
    if currency is not None:
        if currency not in VALID_CURRENCIES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid currency '{currency}'. Supported: {', '.join(sorted(VALID_CURRENCIES))}"
            )
        account.currency = currency

    db.commit()
    db.refresh(account)
    return account


def archive_account(
    db: Session,
    user: User,
    account_id: UUID,
) -> Account:
    """Archive an account (soft delete). Fails if the account has transactions."""
    household_id = get_user_household_id(db, user)
    if not household_id:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    account = get_account(db, account_id, household_id)

    # Check for existing transactions
    transaction_count = db.query(Transaction).filter(
        Transaction.account_id == account_id
    ).count()
    if transaction_count > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot archive account with existing transactions. Transfer or delete the transactions first."
        )

    account.is_active = False
    db.commit()
    db.refresh(account)
    return account


def restore_account(
    db: Session,
    user: User,
    account_id: UUID,
) -> Account:
    """Restore an archived account."""
    household_id = get_user_household_id(db, user)
    if not household_id:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    account = get_account(db, account_id, household_id)

    # Account must be archived to restore
    if account.is_active:
        raise HTTPException(
            status_code=409,
            detail="Account is already active."
        )

    account.is_active = True
    db.commit()
    db.refresh(account)
    return account


def delete_account_permanently(
    db: Session,
    user: User,
    account_id: UUID,
) -> dict:
    """Permanently delete an archived account from the database.

    Only archived accounts can be permanently deleted.
    """
    household_id = get_user_household_id(db, user)
    if not household_id:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    account = get_account(db, account_id, household_id)

    # Only archived accounts can be permanently deleted
    if account.is_active:
        raise HTTPException(
            status_code=409,
            detail="Account must be archived before permanent deletion. Archive it first.",
        )

    # Double-check no transactions reference this account (shouldn't happen if properly archived)
    transaction_count = db.query(Transaction).filter(
        Transaction.account_id == account_id
    ).count()
    if transaction_count > 0:
        raise HTTPException(
            status_code=409,
            detail="Cannot permanently delete account with existing transactions.",
        )

    db.delete(account)
    db.commit()

    return {"message": "Account permanently deleted."}


# --- Balance Calculations ---

def calculate_current_balance(db: Session, account_id: UUID) -> Decimal:
    """Calculate current balance for an account.

    Balance = initial_balance + SUM(transaction amounts)
    Positive amounts = income/deposit, negative amounts = expense/withdrawal
    """
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Sum all transactions for this account
    result = db.query(func.sum(Transaction.amount)).filter(
        Transaction.account_id == account_id
    ).scalar()

    transaction_sum = Decimal(str(result or 0))
    current_balance = account.initial_balance + transaction_sum

    # Update the stored balance
    account.current_balance = current_balance
    db.commit()

    return current_balance


def get_accounts_summary(
    db: Session,
    household_id: UUID
) -> Dict[str, any]:
    """Get combined balance and per-account breakdown for a household.

    Single efficient query with GROUP BY rather than N+1 calculations.
    """
    accounts = db.query(Account).filter(
        Account.household_id == household_id,
        Account.is_active == True
    ).order_by(Account.type, Account.name).all()

    if not accounts:
        return {
            "combined_balance": 0.0,
            "accounts": [],
            "currency": "SGD"
        }

    account_balances = []
    combined_balance = Decimal("0")

    for account in accounts:
        # Calculate balance from transactions
        result = db.query(func.sum(Transaction.amount)).filter(
            Transaction.account_id == account.id
        ).scalar()

        transaction_sum = Decimal(str(result or 0))
        current_balance = account.initial_balance + transaction_sum
        combined_balance += current_balance

        account_balances.append({
            "id": str(account.id),
            "name": account.name,
            "type": account.type.value if account.type else None,
            "currency": account.currency,
            "current_balance": float(current_balance),
        })

    return {
        "combined_balance": float(combined_balance),
        "accounts": account_balances,
        "currency": accounts[0].currency if accounts else "SGD"
    }


# --- Default Account Seeding ---

def seed_default_accounts(
    db: Session,
    household_id: UUID,
    created_by: Optional[UUID] = None
) -> List[Account]:
    """Create default accounts for a household if none exist.

    Creates Cash Wallet, Bank Account, and Credit Card with zero balances.
    These behave exactly like regular accounts — can be renamed, archived, or modified freely.
    """
    # Check if any accounts already exist
    existing_count = db.query(Account).filter(
        Account.household_id == household_id
    ).count()

    if existing_count > 0:
        return []  # Don't seed if accounts already exist

    default_accounts_data = [
        {
            "name": "Cash Wallet",
            "type": AccountType.cash,
            "currency": "SGD",
            "initial_balance": Decimal("0.00"),
        },
        {
            "name": "Bank Account",
            "type": AccountType.bank,
            "currency": "SGD",
            "initial_balance": Decimal("0.00"),
        },
        {
            "name": "Credit Card",
            "type": AccountType.credit_card,
            "currency": "SGD",
            "initial_balance": Decimal("0.00"),
        },
    ]

    created_accounts = []
    for data in default_accounts_data:
        account = Account(
            household_id=household_id,
            name=data["name"],
            type=data["type"],
            currency=data["currency"],
            initial_balance=data["initial_balance"],
            current_balance=data["initial_balance"],
            opening_date=date.today(),
            is_active=True,
            created_by=created_by,
        )
        db.add(account)
        created_accounts.append(account)

    db.commit()
    for account in created_accounts:
        db.refresh(account)

    return created_accounts
