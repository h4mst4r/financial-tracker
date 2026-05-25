"""Account management API routes."""

from datetime import date
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Account, User
from ..services.account_service import (
    archive_account,
    create_account,
    delete_account_permanently,
    get_account,
    get_accounts_summary,
    list_accounts,
    restore_account,
    seed_default_accounts,
    update_account,
)

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


# --- Pydantic Models ---

class AccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Account name")
    type: str = Field(..., description="Account type (cash, bank, credit_card, investment)")
    currency: str = Field(default="SGD", max_length=3, description="ISO 4217 currency code")
    initial_balance: float = Field(default=0.00, description="Initial balance at account creation")
    opening_date: Optional[str] = Field(None, description="Opening date (YYYY-MM-DD)")


class AccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    type: Optional[str] = Field(None, description="Account type (cash, bank, credit_card, investment)")
    currency: Optional[str] = Field(None, max_length=3)


class AccountResponse(BaseModel):
    id: str
    household_id: str
    name: str
    type: str
    currency: str
    initial_balance: float
    current_balance: float
    opening_date: str | None = None
    is_active: bool
    created_by: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class AccountSummaryResponse(BaseModel):
    combined_balance: float
    accounts: List[dict]
    currency: str


# --- Routes ---

@router.get("")
def list_accounts_endpoint(
    include_archived: bool = Query(False, description="Include archived accounts"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> List[AccountResponse]:
    """List all accounts for the current user's household."""
    from ..services.account_service import get_user_household_id

    household_id = get_user_household_id(db, user)
    if not household_id:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    accounts = list_accounts(db, household_id, include_archived=include_archived)
    return [AccountResponse(**account.to_dict()) for account in accounts]


@router.post("", response_model=AccountResponse)
def create_account_endpoint(
    data: AccountCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AccountResponse:
    """Create a new account."""
    account = create_account(
        db=db,
        user=user,
        name=data.name,
        type=data.type,
        currency=data.currency,
        initial_balance=data.initial_balance,
        opening_date=data.opening_date,
    )
    return AccountResponse(**account.to_dict())


@router.get("/{account_id}", response_model=AccountResponse)
def get_account_endpoint(
    account_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AccountResponse:
    """Get a specific account by ID."""
    from ..services.account_service import get_user_household_id

    household_id = get_user_household_id(db, user)
    if not household_id:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    account = get_account(db, account_id, household_id)
    return AccountResponse(**account.to_dict())


@router.put("/{account_id}", response_model=AccountResponse)
def update_account_endpoint(
    account_id: UUID,
    data: AccountUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AccountResponse:
    """Update an existing account."""
    account = update_account(
        db=db,
        user=user,
        account_id=account_id,
        name=data.name,
        type=data.type,
        currency=data.currency,
    )
    return AccountResponse(**account.to_dict())


@router.delete("/{account_id}", response_model=AccountResponse)
def archive_account_endpoint(
    account_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AccountResponse:
    """Archive an account (soft delete)."""
    account = archive_account(db=db, user=user, account_id=account_id)
    return AccountResponse(**account.to_dict())


@router.post("/{account_id}/restore", response_model=AccountResponse)
def restore_account_endpoint(
    account_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AccountResponse:
    """Restore an archived account."""
    account = restore_account(db=db, user=user, account_id=account_id)
    return AccountResponse(**account.to_dict())


@router.delete("/{account_id}/permanent")
def delete_account_permanently_endpoint(
    account_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Permanently delete an archived account.

    Only archived accounts can be permanently deleted.
    """
    result = delete_account_permanently(db, user, account_id)
    return result


@router.get("/summary", response_model=AccountSummaryResponse)
def get_accounts_summary_endpoint(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AccountSummaryResponse:
    """Get combined balance and per-account breakdown."""
    from ..services.account_service import get_user_household_id

    household_id = get_user_household_id(db, user)
    if not household_id:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    summary = get_accounts_summary(db, household_id)
    return AccountSummaryResponse(**summary)


@router.post("/seed-defaults", response_model=List[AccountResponse])
def seed_defaults_endpoint(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> List[AccountResponse]:
    """Seed default accounts (Cash Wallet, Bank Account, Credit Card) if none exist."""
    from ..services.account_service import get_user_household_id

    household_id = get_user_household_id(db, user)
    if not household_id:
        raise HTTPException(status_code=400, detail="You must belong to a household")

    accounts = seed_default_accounts(db, household_id, created_by=user.id)
    return [AccountResponse(**account.to_dict()) for account in accounts]
